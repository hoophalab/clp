import {MemoryRouter} from "react-router";

import type {DeploymentResponse} from "@cloud.yscope.com/server/contracts";
import {
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import {
    afterEach,
    expect,
    it,
    vi,
} from "vitest";

import {DeploymentCard} from "~/components/deployment-card";
import {SAMPLE_DEPLOYMENTS} from "~/lib/sample-deployments";


const [deployment] = SAMPLE_DEPLOYMENTS;
const name = deployment.spec.deployment_name;

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

it("copies the deployment ID from the inline control", () => {
    const writeText = vi.fn().mockResolvedValue(null);
    vi.stubGlobal("navigator", {clipboard: {writeText}});
    render(<DeploymentCard deployment={deployment}/>);

    fireEvent.click(screen.getByRole("button", {name: `Copy ${name} ID`}));
    expect(writeText).toHaveBeenCalledExactlyOnceWith(deployment._id);
});

it.each([
    {label: "Failed to create", phase: "CREATE_FAILED"},
    {label: "Failed to update", phase: "CONFIG_FAILED"},
    {label: "Failed to suspend", phase: "SUSPEND_FAILED"},
    {label: "Failed to resume", phase: "RESUME_FAILED"},
    {label: "Failed to delete", phase: "DELETE_FAILED"},
] as const)("renders $label for $phase", ({label, phase}) => {
    const failedDeployment: DeploymentResponse = {
        ...deployment,
        status: {
            phase: phase,
            phase_transition_records: {[phase]: "2026-09-22T12:00:00.000Z"},
        },
    };

    render(<DeploymentCard deployment={failedDeployment}/>);

    expect(screen.getByText(label)).toBeVisible();
});

it.each(["missing",
    "throwing",
    "rejected"])("handles a %s clipboard", async (failure) => {
    const writeText = vi.fn().mockImplementation(() => {
        if ("throwing" === failure) {
            throw new Error("Unavailable");
        }

        return Promise.reject(new Error("Denied"));
    });

    vi.stubGlobal("navigator", "missing" === failure ?
        {} :
        {clipboard: {writeText}});
    const onError = vi.fn();
    window.addEventListener("error", onError);
    try {
        render(<DeploymentCard deployment={deployment}/>);
        fireEvent.click(screen.getByRole("button", {name: `Copy ${name} ID`}));
        await Promise.resolve();
        expect(onError).not.toHaveBeenCalled();
    } finally {
        window.removeEventListener("error", onError);
    }
});

it.each([
    {phase: "RUNNING", visible: true},
    {phase: "DELETE_REQUESTED", visible: false},
    {phase: "DELETING", visible: false},
    {phase: "DELETED", visible: false},
] as const)("shows Connect your logs for $phase: $visible", async ({phase, visible}) => {
    const phaseDeployment: DeploymentResponse = {
        ...deployment,
        status: {
            phase: phase,
            phase_transition_records: {[phase]: "2026-09-22T12:00:00.000Z"},
        },
    };

    render(
        <MemoryRouter>
            <DeploymentCard deployment={phaseDeployment}/>
        </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", {name: `More actions for ${name}`}));

    expect(await screen.findByRole("menuitem", {name: "Manage tokens"})).toBeVisible();
    expect(Boolean(screen.queryByRole("menuitem", {name: "Connect your logs"})))
        .toBe(visible);
});
