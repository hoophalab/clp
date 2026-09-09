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
} from "vitest";

import DeploymentsPage from "~/routes/deployments";


const SAMPLE_DEPLOYMENT_COUNT = 4;
const RUNNING_DEPLOYMENT_COUNT = 2;

afterEach(cleanup);

describe("DeploymentsPage", () => {
    it("renders the sample deployment inventory", () => {
        render(<DeploymentsPage/>);

        expect(screen.getByRole("heading", {name: "Deployments"})).toBeVisible();
        expect(screen.getAllByRole("article")).toHaveLength(SAMPLE_DEPLOYMENT_COUNT);
        expect(screen.getAllByText("yscope-admin-ca-central-1")[0]).toBeVisible();
        expect(screen.getByText("test-deployment-2")).toBeVisible();
        expect(screen.getByText("testagain")).toBeVisible();
        expect(screen.getByText("test-prod-eu-west-1")).toBeVisible();
        expect(screen.getAllByText("0.3.3-clap.41")).toHaveLength(SAMPLE_DEPLOYMENT_COUNT);
        expect(screen.getAllByRole("button", {name: "Open"})).toHaveLength(
            RUNNING_DEPLOYMENT_COUNT,
        );
        expect(screen.getByRole("button", {name: "Wake Up"})).toBeVisible();
        expect(screen.getByRole("button", {name: "Retry"})).toBeVisible();

        const deploymentCard = screen.getByRole("article", {
            name: "test-deployment-2",
        });
        const deploymentIdentity = within(deploymentCard).getByRole("group", {
            name: "test-deployment-2 identity",
        });

        expect(within(deploymentIdentity).getByText("test-deployment-2")).toBeVisible();
        expect(within(deploymentIdentity).getByText("7c9a9fc1e7f9d4a7e96af46")).toBeVisible();
        expect(within(deploymentIdentity).getByRole("button", {
            name: "Copy test-deployment-2 ID",
        })).toBeVisible();
    });

    it("filters the deployment inventory by search text", () => {
        render(<DeploymentsPage/>);

        fireEvent.change(screen.getByRole("searchbox", {name: "Search deployments"}), {
            target: {value: "eu-west"},
        });

        expect(screen.getAllByRole("article")).toHaveLength(1);
        expect(screen.getByText("test-prod-eu-west-1")).toBeVisible();
        expect(screen.queryByText("test-deployment-2")).not.toBeInTheDocument();
    });
});
