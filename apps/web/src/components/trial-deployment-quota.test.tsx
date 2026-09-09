import {
    cleanup,
    render,
    screen,
} from "@testing-library/react";
import {
    afterEach,
    expect,
    it,
} from "vitest";

import {TrialDeploymentQuota} from "~/components/trial-deployment-quota";


afterEach(cleanup);

it("shows finite deployment usage", () => {
    render(<TrialDeploymentQuota quota={{limit: 10, used: 9, mode: "trial"}}/>);
    expect(screen.getByText("9 / 10")).toBeVisible();
    const progress = screen.getByRole("progressbar");
    expect(progress).toHaveAttribute("aria-valuetext", "9 of 10 deployments used");
});

it("treats zero as no deployments allowed", () => {
    render(<TrialDeploymentQuota quota={{limit: 0, used: 0, mode: "trial"}}/>);
    expect(screen.getByText("0 deployments allowed")).toBeVisible();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
});
