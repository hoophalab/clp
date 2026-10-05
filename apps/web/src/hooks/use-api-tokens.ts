import {
    useCallback,
    useEffect,
    useState,
} from "react";

import type {
    ApiTokenResponse,
    CreateApiTokenRequest,
    CreateApiTokenResponse,
} from "@cloud.yscope.com/server/contracts";

import type {ApiClient} from "~/lib/api-client";


const HTTP_STATUS_FORBIDDEN = 403;
const HTTP_STATUS_NOT_FOUND = 404;
const HTTP_STATUS_CONFLICT = 409;

type ApiTokenLoadFailure =

    /** The filtered deployment does not exist or the caller cannot see it. */
    "deployment" |

    /** Any other failure, including an unreachable cluster. */
    "request";

type ApiTokenList = {

    /** Why the latest load failed, or null when it succeeded or is running. */
    loadFailure: ApiTokenLoadFailure | null;

    /** Loads the list again. */
    reload: () => void;

    /** The tokens, or null until the first load succeeds. */
    tokens: readonly ApiTokenResponse[] | null;

    /** Adds or replaces a token in the list without reloading. */
    upsertToken: (token: ApiTokenResponse) => void;
};

type CreateApiTokenOutcome =
    {outcome: "created"; token: CreateApiTokenResponse} |
    {outcome: "alias_taken" | "deployment_unavailable" | "failed"};

/**
 * Fetches the caller's tokens, on one deployment or on all of them.
 *
 * @param api The API client.
 * @param deploymentId The deployment to list, or null for every deployment.
 * @return The tokens, or why they could not be listed.
 */
const loadApiTokens = async (
    api: ApiClient,
    deploymentId: string | null,
): Promise<{tokens: ApiTokenResponse[]} | {failure: ApiTokenLoadFailure}> => {
    const response = await api.api.v1["api-tokens"].$get({
        query: null === deploymentId ?
            {} :
            {deployment: deploymentId},
    });

    if (response.ok) {
        return {tokens: (await response.json()).tokens};
    }

    return {
        failure: HTTP_STATUS_NOT_FOUND === response.status ||
            HTTP_STATUS_FORBIDDEN === response.status ?
            "deployment" :
            "request",
    };
};

/**
 * Loads the caller's API tokens, on one deployment or on all of them.
 *
 * @param api The API client.
 * @param deploymentId The deployment to list, or null for every deployment.
 * @return The token list and ways to keep it current after an action.
 */
const useApiTokens = (api: ApiClient, deploymentId: string | null): ApiTokenList => {
    const [tokens, setTokens] = useState<readonly ApiTokenResponse[] | null>(null);
    const [loadFailure, setLoadFailure] = useState<ApiTokenLoadFailure | null>(null);
    const [loadCount, setLoadCount] = useState(0);

    useEffect(() => {
        let isActive = true;

        setLoadFailure(null);
        loadApiTokens(api, deploymentId)
            .then((result) => {
                if (!isActive) {
                    return;
                }
                if ("tokens" in result) {
                    setTokens(result.tokens);
                } else {
                    setLoadFailure(result.failure);
                }
            })
            .catch(() => {
                if (isActive) {
                    setLoadFailure("request");
                }
            });

        return () => {
            isActive = false;
        };
    }, [api,
        deploymentId,
        loadCount]);

    const reload = useCallback(() => {
        setLoadCount((count) => count + 1);
    }, []);
    const upsertToken = useCallback((token: ApiTokenResponse) => {
        setTokens((current) => {
            const others = (current ?? []).filter(({id}) => id !== token.id);

            return [token,
                ...others];
        });
    }, []);

    return {
        loadFailure: loadFailure,
        reload: reload,
        tokens: tokens,
        upsertToken: upsertToken,
    };
};

/**
 * Creates a token.
 *
 * @param api The API client.
 * @param request
 * @return The created token, or why it was not created.
 */
const createApiToken = async (
    api: ApiClient,
    request: CreateApiTokenRequest,
): Promise<CreateApiTokenOutcome> => {
    const response = await api.api.v1["api-tokens"].$post({json: request});

    if (response.ok) {
        return {outcome: "created", token: await response.json()};
    }
    if (HTTP_STATUS_CONFLICT === response.status) {
        const {error} = await response.json();

        return {
            outcome: "DEPLOYMENT_UNAVAILABLE" === error.code ?
                "deployment_unavailable" :
                "alias_taken",
        };
    }

    return {outcome: "failed"};
};


export {
    type ApiTokenList,
    type ApiTokenLoadFailure,
    createApiToken,
    useApiTokens,
};
