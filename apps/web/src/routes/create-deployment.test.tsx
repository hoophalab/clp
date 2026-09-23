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


const REGIONS = [
    {
        cloud_provider: "aws",
        regions: ["ca-central-1",
            "us-east-2"],
    },
];

const auth = vi.hoisted(() => ({useAuth0: vi.fn()}));

vi.mock("@auth0/auth0-react", () => auth);

/**
 * Answers the region catalog with a fixed response.
 *
 * @param regions The catalog the API reports.
 * @return The stubbed fetch.
 */
const stubApi = (regions: unknown = REGIONS) => {
    const fetch = vi.fn(() => Promise.resolve(Response.json(regions)));

    auth.useAuth0.mockReturnValue({
        getAccessTokenSilently: () => Promise.resolve("test-token"),
    });
    vi.stubGlobal("fetch", fetch);

    return fetch;
};

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

describe("CreateDeploymentPage", () => {
    it("keeps the review synchronized and validates an empty name on blur", () => {
        stubApi();
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

    it("offers the regions the API reports", async () => {
        stubApi();
        render(
            <MemoryRouter>
                <CreateDeploymentPage/>
            </MemoryRouter>
        );
        const review = screen.getByRole("complementary", {name: "Review deployment"});

        expect(await within(review).findByText("ca-central-1")).toBeVisible();
        expect(screen.getByRole("combobox", {name: "Region"})).toBeEnabled();
    });

    it("reports an empty catalog and keeps the region select disabled", async () => {
        stubApi([]);
        render(
            <MemoryRouter>
                <CreateDeploymentPage/>
            </MemoryRouter>
        );

        expect(await screen.findByText("No regions are available yet.")).toBeVisible();
        expect(screen.getByRole("combobox", {name: "Region"})).toBeDisabled();
    });

    it("blocks creation without supported configuration and never creates anything", () => {
        const fetch = stubApi();
        render(
            <MemoryRouter>
                <CreateDeploymentPage/>
            </MemoryRouter>
        );
        const create = screen.getByRole("button", {name: "Create deployment"});
        expect(create).toBeDisabled();
        fireEvent.click(create);
        fireEvent.click(create);
        const form = screen.getByRole("form", {name: "Deployment details"});
        const submitted = fireEvent.submit(form);
        expect(submitted).toBe(false);
        expect(fetch).not.toHaveBeenCalledWith(
            "/api/v1/deployments",
            expect.anything(),
        );
        expect(screen.getByText("Deployment creation is not available yet.")).toBeVisible();
        expect(screen.getByRole("link", {name: "Back"})).toHaveAttribute("href", "/");
        const activeStep = screen.getByText("Create deployment", {selector: "li span:last-child"});
        expect(activeStep.closest("li"))
            .toHaveAttribute("aria-current", "step");
        expect(screen.queryByRole("link", {name: "Add logs"})).not.toBeInTheDocument();
    });
});
