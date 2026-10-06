import {
    useEffect,
    useState,
} from "react";

import {
    DEPLOYMENT_NAME_LENGTH_MAX,
    DEPLOYMENT_NAME_LENGTH_MIN,
    DeploymentNameSchema,
} from "@cloud.yscope.com/server/contracts";

import type {ApiClient} from "~/lib/api-client";


const NAME_CHECK_DELAY_MS = 300;
const NAME_RULE = `${DEPLOYMENT_NAME_LENGTH_MIN}–${DEPLOYMENT_NAME_LENGTH_MAX} characters:` +
    " lowercase letters, numbers, and hyphens.";

/**
 * Explains why a trimmed deployment name is malformed.
 *
 * @param trimmedName
 * @return The first rule the name breaks, or null when it is well-formed.
 */
const getFormatError = (trimmedName: string) => {
    if ("" === trimmedName) {
        return "Enter a deployment name.";
    }
    const result = DeploymentNameSchema.safeParse(trimmedName);
    if (!result.success) {
        for (const issue of result.error.issues) {
            if ("too_small" === issue.code) {
                return `Use at least ${issue.minimum} characters.`;
            }
            if ("too_big" === issue.code) {
                return `Use at most ${issue.maximum} characters.`;
            }
        }
        if (trimmedName.startsWith("-") || trimmedName.endsWith("-")) {
            return "Start and end with a letter or number.";
        }

        return "Use only lowercase letters, numbers, and hyphens.";
    }

    return null;
};

/**
 * Asks the API whether a well-formed name is free, shortly after the user stops typing.
 *
 * @param apiClient
 * @param trimmedName
 * @param isWellFormed Whether the name is worth checking.
 * @return The API's answer for this name, or null when there is none (the name was not checked or
 * the check failed; creation still rejects a taken name).
 */
const useIsDeploymentNameAvailable = (
    apiClient: ApiClient,
    trimmedName: string,
    isWellFormed: boolean,
) => {
    const [result, setResult] = useState<{available: boolean | null; name: string} | null>(
        null,
    );

    useEffect(() => {
        if (!isWellFormed) {
            return () => {
                // No check was scheduled.
            };
        }

        let isActive = true;
        const timer = setTimeout(() => {
            apiClient.api.v1.deployments["check-name"].$get({query: {name: trimmedName}})
                .then(async (response) => {
                    if (!response.ok) {
                        throw new Error("Failed to check deployment name availability.");
                    }

                    const {available} = await response.json();

                    if (isActive) {
                        setResult({available: available, name: trimmedName});
                    }
                })
                .catch(() => {
                    if (isActive) {
                        setResult({available: null, name: trimmedName});
                    }
                });
        }, NAME_CHECK_DELAY_MS);

        return () => {
            isActive = false;
            clearTimeout(timer);
        };
    }, [apiClient,
        isWellFormed,
        trimmedName]);

    if (!isWellFormed) {
        return null;
    }
    if (result?.name !== trimmedName) {
        return "checking";
    }
    if (null === result.available) {
        return null;
    }

    return result.available ?
        "available" :
        "taken";
};

/**
 * Holds the deployment name input with its validation and availability.
 *
 * Format errors appear once the field is touched; a taken name is reported as soon as it is known.
 *
 * @param apiClient
 * @return The name, the error to show (if any), help text, and ways to update it.
 */
const useDeploymentName = (apiClient: ApiClient) => {
    const [value, setValue] = useState("");
    const [isTouched, setIsTouched] = useState(false);
    const [takenName, setTakenName] = useState<string | null>(null);
    const trimmed = value.trim();
    const formatError = getFormatError(trimmed);
    const availability = useIsDeploymentNameAvailable(apiClient, trimmed, null === formatError);
    const isTaken = "taken" === availability || trimmed === takenName;
    const error = formatError ?? (isTaken ?
        `"${trimmed}" is already in use. Choose another name.` :
        null);
    let help = NAME_RULE;

    if ("checking" === availability) {
        help = "Checking availability…";
    } else if ("available" === availability) {
        help = `"${trimmed}" is available.`;
    }

    return {
        error: isTouched || isTaken ?
            error :
            null,
        help: help,
        isValid: null === error,
        markTaken: () => {
            setTakenName(trimmed);
        },
        setValue: setValue,
        touch: () => {
            setIsTouched(true);
        },
        trimmed: trimmed,
        value: value,
    };
};


export {useDeploymentName};
