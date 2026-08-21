import {Hono} from "hono";
import type {ApplyGlobalResponse} from "hono/client";
import {requestId} from "hono/request-id";

import type {ErrorEnvelope} from "./contracts/error.js";
import type {ServerEnv} from "./environment.js";
import {
    handleAppError,
    handleNotFound,
} from "./errors.js";
import {
    HTTP_STATUS_BAD_REQUEST,
    HTTP_STATUS_INTERNAL_SERVER_ERROR,
} from "./http-status.js";
import {healthRoutes} from "./routes/health.js";


/**
 * Creates the Hono application with the service routes.
 *
 * Every response carries an `X-Request-Id` identifying the request in the
 * server logs. `limitLength: 0` rejects any inbound `X-Request-Id`, so the ID
 * is always minted server-side rather than chosen by the caller.
 *
 * @return The configured Hono application.
 */
const createApp = () => new Hono<ServerEnv>()
    .use("*", requestId({limitLength: 0}))
    .route("/api/v1/health", healthRoutes)
    .notFound(handleNotFound)
    .onError(handleAppError);

/**
 * RPC-visible application contract.
 *
 * Hono cannot infer responses returned by the global error handler from route
 * handlers. ApplyGlobalResponse makes the two statuses emitted by
 * handleAppError explicit without changing the runtime app. Unmatched routes
 * are not RPC-callable, so handleNotFound remains a runtime-only 404; matched
 * routes that can return 404 must use context.json with the shared envelope and
 * a literal 404 status.
 */
type AppType = ApplyGlobalResponse<
    ReturnType<typeof createApp>,
    {
        [HTTP_STATUS_BAD_REQUEST]: {json: ErrorEnvelope};
        [HTTP_STATUS_INTERNAL_SERVER_ERROR]: {json: ErrorEnvelope};
    }
>;

export {
    type AppType, createApp,
};
