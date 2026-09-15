import {MemoryRouter} from "react-router";

import {
    cleanup,
    fireEvent,
    render,
    screen,
    within,
} from "@testing-library/react";
import {
    afterEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";

import CreateDeploymentPage from "~/routes/create-deployment";


afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe("CreateDeploymentPage", () => {
    it("keeps the review synchronized and validates an empty name on blur", () => {
        render(
            <MemoryRouter>
                <CreateDeploymentPage/>
            </MemoryRouter>
        );
        const name = screen.getByRole("textbox", {name: "Deployment name"});
        const review = screen.getByRole("complementary", {name: "Review deployment"});
        fireEvent.change(name, {target: {value: "application-logs"}});
        expect(within(review).getByText("application-logs")).toBeVisible();
        fireEvent.change(name, {target: {value: "   "}});
        fireEvent.blur(name);
        expect(name).toHaveAttribute("aria-invalid", "true");
        expect(screen.getByRole("alert")).toHaveTextContent("Enter a deployment name.");
        expect(within(review).getByText("Not entered")).toBeVisible();
        fireEvent.change(name, {target: {value: "service-logs"}});
        expect(name).toHaveAttribute("aria-invalid", "false");
        expect(within(review).getByText("service-logs")).toBeVisible();
    });

    it("blocks creation without supported configuration and never sends a request", () => {
        const fetch = vi.fn();
        vi.stubGlobal("fetch", fetch);
        render(
            <MemoryRouter>
                <CreateDeploymentPage/>
            </MemoryRouter>
        );
        expect(screen.getByRole("combobox", {name: "Region"})).toBeDisabled();
        const create = screen.getByRole("button", {name: "Create deployment"});
        expect(create).toBeDisabled();
        fireEvent.click(create);
        fireEvent.click(create);
        const form = screen.getByRole("form", {name: "Deployment details"});
        const submitted = fireEvent.submit(form);
        expect(submitted).toBe(false);
        expect(fetch).not.toHaveBeenCalled();
        expect(screen.getByText("Deployment creation is not available yet.")).toBeVisible();
        expect(screen.getByRole("link", {name: "Back"})).toHaveAttribute("href", "/");
        const activeStep = screen.getByText("Create deployment", {selector: "li span:last-child"});
        expect(activeStep.closest("li"))
            .toHaveAttribute("aria-current", "step");
        expect(screen.queryByRole("link", {name: "Add logs"})).not.toBeInTheDocument();
    });
});
