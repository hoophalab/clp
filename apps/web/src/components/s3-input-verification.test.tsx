import {MemoryRouter} from "react-router";

import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import {
    afterEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";

import {S3InputVerification} from "~/components/s3-input-verification";
import type {S3Verifier} from "~/lib/s3-input";


/**
 * Creates a deployment-bound test verifier.
 *
 * @param verify The test implementation.
 * @return A verifier with a fixture role.
 */
const makeVerifier = (
    verify: S3Verifier["verify"],
): S3Verifier => ({
    deploymentId: "dep-1",
    roleArn: "arn:aws:iam::123456789012:role/log-reader",
    verify: verify,
});

/**
 * Renders the verification form in router context.
 *
 * @param verifier The test capability.
 * @return The rendered view.
 */
const renderForm = (verifier: S3Verifier | null) => render(
    <MemoryRouter>
        <S3InputVerification verifier={verifier}/>
    </MemoryRouter>,
);

/**
 * Fills valid representative input.
 */
const fill = () => {
    fireEvent.change(screen.getByRole("textbox", {name: "Bucket name"}), {
        target: {value: "application-logs"},
    });
    fireEvent.change(
        screen.getByRole("textbox", {name: "Representative object key"}),
        {target: {value: " logs/example.log "}},
    );
};

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe("S3 input verification", () => {
    it("keeps verification and policy generation unavailable without a deployment", () => {
        const fetch = vi.fn();
        vi.stubGlobal("fetch", fetch);
        renderForm(null);
        fill();
        expect(
            screen.getByRole("button", {name: "Verify access"}),
        ).toBeDisabled();
        expect(
            screen.queryByRole("button", {name: "Copy policy statement"}),
        ).not.toBeInTheDocument();
        fireEvent.submit(screen.getByRole("form"));
        expect(fetch).not.toHaveBeenCalled();
        expect(
            screen.getByText("S3 verification is not available yet."),
        ).toBeVisible();
    });

    it("validates inputs, prevents duplicate attempts, and preserves exact keys", async () => {
        let complete = () => {
        };
        const verify = vi.fn<S3Verifier["verify"]>(
            () => new Promise((resolve) => {
                complete = resolve;
            }),
        );

        renderForm(makeVerifier(verify));
        fireEvent.blur(screen.getByRole("textbox", {name: "Bucket name"}));
        expect(
            screen.getByRole("textbox", {name: "Bucket name"}),
        ).toHaveAttribute("aria-invalid", "true");
        fill();
        fireEvent.submit(screen.getByRole("form"));
        fireEvent.submit(screen.getByRole("form"));
        await waitFor(() => {
            expect(verify).toHaveBeenCalled();
        });
        expect(verify).toHaveBeenCalledOnce();
        expect(verify).toHaveBeenCalledWith(
            {bucket: "application-logs", key: " logs/example.log "},
            expect.any(AbortSignal),
        );
        expect(
            screen.getByRole("button", {name: "Verifying access…"}),
        ).toBeDisabled();
        await act(async () => {
            complete();
            await Promise.resolve();
        });
        expect(screen.getByText("S3 access verified")).toBeVisible();
        fireEvent.change(
            screen.getByRole("textbox", {name: "Representative object key"}),
            {target: {value: "new.log"}},
        );
        expect(screen.queryByText("S3 access verified")).not.toBeInTheDocument();
    });

    it("reports failure and supports retry", async () => {
        const verify = vi
            .fn<S3Verifier["verify"]>()
            .mockRejectedValueOnce(new Error("Access denied"))
            .mockResolvedValue();

        renderForm(makeVerifier(verify));
        fill();
        fireEvent.submit(screen.getByRole("form"));
        expect(await screen.findByText("Access denied")).toBeVisible();
        fireEvent.click(screen.getByRole("button", {name: "Retry verification"}));
        expect(await screen.findByText("S3 access verified")).toBeVisible();
        expect(verify).toHaveBeenCalledTimes(2);
    });
});

describe("S3 verification lifecycle and clipboard", () => {
    it("ignores a stale result after editing and aborts on unmount", async () => {
        let complete = () => {
        };
        const verify = vi.fn<S3Verifier["verify"]>(
            () => new Promise((resolve) => {
                complete = resolve;
            }),
        );
        const view = renderForm(makeVerifier(verify));
        fill();
        fireEvent.submit(screen.getByRole("form"));
        await waitFor(() => {
            expect(verify).toHaveBeenCalledOnce();
        });
        const firstSignal = verify.mock.calls[0]?.[1];
        fireEvent.change(screen.getByRole("textbox", {name: "Bucket name"}), {
            target: {value: "different-logs"},
        });
        expect(firstSignal.aborted).toBe(true);
        await act(async () => {
            complete();
            await Promise.resolve();
        });
        expect(screen.queryByText("S3 access verified")).not.toBeInTheDocument();
        fireEvent.submit(screen.getByRole("form"));
        await waitFor(() => {
            expect(verify).toHaveBeenCalledTimes(2);
        });
        view.unmount();
        expect(verify.mock.calls[1]?.[1].aborted).toBe(true);
        await act(async () => {
            complete();
            await Promise.resolve();
        });
    });

    it("resets pending work when the deployment role changes", async () => {
        let complete = () => {
        };
        const verify = vi.fn<S3Verifier["verify"]>(
            () => new Promise((resolve) => {
                complete = resolve;
            }),
        );
        const view = renderForm(makeVerifier(verify));
        fill();
        fireEvent.submit(screen.getByRole("form"));
        await waitFor(() => {
            expect(verify).toHaveBeenCalledOnce();
        });
        view.rerender(
            <MemoryRouter>
                <S3InputVerification
                    verifier={{...makeVerifier(verify), deploymentId: "dep-2"}}/>
            </MemoryRouter>,
        );
        expect(verify.mock.calls[0]?.[1].aborted).toBe(true);
        await act(async () => {
            complete();
            await Promise.resolve();
        });
        expect(screen.getByRole("textbox", {name: "Bucket name"})).toHaveValue(
            "",
        );
        expect(screen.queryByText("S3 access verified")).not.toBeInTheDocument();
    });

    it("copies only the current bucket policy and reports clipboard failures", async () => {
        const writeText = vi.fn().mockResolvedValue(null);
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: {writeText},
        });
        renderForm(makeVerifier(vi.fn()));
        fill();
        fireEvent.click(
            screen.getByRole("button", {name: "Copy policy statement"}),
        );
        await waitFor(() => {
            expect(screen.getByText("Copied to clipboard.")).toBeVisible();
        });
        expect(writeText.mock.calls[0]?.[0]).toContain(
            "arn:aws:s3:::application-logs",
        );
        fireEvent.change(screen.getByRole("textbox", {name: "Bucket name"}), {
            target: {value: "different-logs"},
        });
        expect(screen.queryByText("Copied to clipboard.")).not.toBeInTheDocument();
        writeText.mockRejectedValue(new Error("denied"));
        fireEvent.click(
            screen.getByRole("button", {name: "Copy policy statement"}),
        );
        expect(
            await screen.findByText(
                "Could not copy. Select and copy the text above.",
            ),
        ).toBeVisible();
    });
});
