import {
    render,
    screen,
} from "@testing-library/react";
import {
    describe,
    expect,
    it,
} from "vitest";

import DeploymentsPage from "~/routes/deployments";


describe("DeploymentsPage", () => {
    it("guides users through the empty deployment state", () => {
        render(<DeploymentsPage/>);

        expect(screen.getByRole("heading", {name: "Deployments"})).toBeVisible();
        expect(screen.getByText("No deployments yet")).toBeVisible();
        expect(screen.getByRole("button", {name: "Create Deployment"})).toBeVisible();
        expect(screen.getByRole("button", {name: "Read documentation"})).toBeVisible();
        expect(screen.getByText("Choose a region")).toBeVisible();
        expect(screen.getByText("Configure compute")).toBeVisible();
        expect(screen.getByText("Deploy in minutes")).toBeVisible();
    });
});
