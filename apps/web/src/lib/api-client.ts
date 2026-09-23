import type {AppType} from "@cloud.yscope.com/server/contracts";
import {hc} from "hono/client";


/**
 * Creates the typed Cloud Console API client.
 *
 * The API shares the web console's origin, so requests use relative paths.
 *
 * @param getAccessToken Resolves the bearer token sent with every request.
 * @return The Hono RPC client.
 */
const createApiClient = (getAccessToken: () => Promise<string>) => hc<AppType>("/", {
    headers: async (): Promise<Record<string, string>> => ({
        Authorization: `Bearer ${await getAccessToken()}`,
    }),
});

type ApiClient = ReturnType<typeof createApiClient>;


export {
    type ApiClient,
    createApiClient,
};
