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

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

it("copies the deployment ID from both controls", async () => {
    const writeText = vi.fn().mockResolvedValue(null);
    vi.stubGlobal("navigator", {clipboard: {writeText}});
    render(<DeploymentCard deployment={deployment}/>);

    fireEvent.click(screen.getByRole("button", {name: `Copy ${deployment.name} ID`}));
    expect(writeText).toHaveBeenLastCalledWith(deployment.id);
    writeText.mockClear();
    fireEvent.click(screen.getByRole("button", {name: `More actions for ${deployment.name}`}));
    fireEvent.click(await screen.findByRole("menuitem", {name: "Copy deployment ID"}));
    expect(writeText).toHaveBeenCalledExactlyOnceWith(deployment.id);
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
        fireEvent.click(screen.getByRole("button", {name: `Copy ${deployment.name} ID`}));
        await Promise.resolve();
        expect(onError).not.toHaveBeenCalled();
    } finally {
        window.removeEventListener("error", onError);
    }
});
