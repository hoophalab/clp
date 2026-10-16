import {
    useEffect,
    useRef,
    useState,
} from "react";

import {
    type S3Input,
    type S3Verifier,
    validateS3Input,
} from "~/lib/s3-input";


enum VerificationStatus {
    Error = "error",
    Idle = "idle",
    Pending = "pending",
    Verified = "verified",
}

type VerificationState = {
    status: VerificationStatus.Idle | VerificationStatus.Pending | VerificationStatus.Verified;
} | {status: VerificationStatus.Error; message: string};

/**
 * Owns a single verification attempt; edits and unmounts invalidate pending results.
 *
 * @param verifier The deployment-bound verifier, or null when the service is unavailable.
 * @return Form state and event handlers.
 */
const useS3Verification = (verifier: S3Verifier | null) => {
    const [input, setInput] = useState<S3Input>({bucket: "", key: ""});
    const [touched, setTouched] = useState({bucket: false, key: false});
    const [state, setState] = useState<VerificationState>({status: VerificationStatus.Idle});
    const pending = useRef<AbortController | null>(null);
    useEffect(
        () => () => {
            pending.current?.abort();
        },
        [],
    );
    const errors = validateS3Input(input);
    const update = (field: keyof S3Input, value: string) => {
        pending.current?.abort();
        pending.current = null;
        setState({status: VerificationStatus.Idle});
        setInput((previous) => ({...previous, [field]: value}));
    };
    const verify = () => {
        setTouched({bucket: true, key: true});
        if (!verifier || errors.bucket || errors.key || pending.current) {
            return;
        }
        const controller = new AbortController();
        pending.current = controller;
        setState({status: VerificationStatus.Pending});
        Promise.resolve()
            .then(() => {
                if (controller.signal.aborted) {
                    return Promise.resolve();
                }

                return verifier.verify(input, controller.signal);
            })
            .then(() => {
                if (!controller.signal.aborted) {
                    setState({status: VerificationStatus.Verified});
                }
            })
            .catch((error: unknown) => {
                if (!controller.signal.aborted) {
                    setState({
                        status: VerificationStatus.Error,
                        message: error instanceof Error ?
                            error.message :
                            "Unable to verify S3 access. Check the bucket policy and try again.",
                    });
                }
            })
            .finally(() => {
                if (pending.current === controller) {
                    pending.current = null;
                }
            });
    };
    const blur = (field: keyof S3Input) => {
        setTouched((previous) => ({...previous, [field]: true}));
    };

    return {blur, errors, input, state, touched, update, verify};
};

export {
    useS3Verification,
    VerificationStatus,
};
