import {Hono} from "hono";
import type {ApplyGlobalResponse} from "hono/client";
import {requestId} from "hono/request-id";
import type {Db} from "mongodb";

import {
    createAuthenticationMiddleware,
    type IdentityVerifier,
} from "./authentication.js";
import type {ClusterDatabaseManager} from "./cluster-databases.js";
import type {ErrorEnvelope} from "./contracts/error.js";
import type {DeploymentOrchestrator} from "./deployment-orchestrator/index.js";
import type {ServerEnv} from "./environment.js";
import {
    handleAppError,
    handleNotFound,
} from "./errors.js";
import {
    HTTP_STATUS_BAD_REQUEST,
    HTTP_STATUS_FORBIDDEN,
    HTTP_STATUS_INTERNAL_SERVER_ERROR,
    HTTP_STATUS_UNAUTHORIZED,
} from "./http-status.js";
import {createApiTokenRoutes} from "./routes/api-tokens.js";
import {createDeploymentRoutes} from "./routes/deployments.js";
import {createHealthRoutes} from "./routes/health.js";
import {createRegionRoutes} from "./routes/regions.js";


type CreateAppOptions = {
    clusterDatabaseManager: ClusterDatabaseManager;
    database: Db;
    deploymentOrchestrator: DeploymentOrchestrator;
    identityVerifier: IdentityVerifier;
};

/**
 * Creates the Hono application with the service routes.
 *
 * Every response carries an `X-Request-Id` identifying the request in the
 * server logs. `limitLength: 0` rejects any inbound `X-Request-Id`, so the ID
 * is always minted server-side rather than chosen by the caller.
 *
 * Hono runs handlers in registration order, so routes registered before the
 * authentication boundary stay public. Every other `/api/v1/*` request must
 * present a bearer token that the identity verifier accepts.
 *
 * @param options App construction options.
 * @param options.clusterDatabaseManager
 * @param options.database Metadata database the routes read and write.
 * @param options.deploymentOrchestrator
 * @param options.identityVerifier The bearer identity verifier.
 * @return The configured Hono application.
 */
const createApp = ({
    clusterDatabaseManager,
    database,
    deploymentOrchestrator,
    identityVerifier,
}: CreateAppOptions) => {
    return new Hono<ServerEnv>()
        .use("*", requestId({limitLength: 0}))
        .route("/api/v1/health", createHealthRoutes())
        .route("/api/v1/regions", createRegionRoutes(database))
        .use("/api/v1/*", createAuthenticationMiddleware(identityVerifier))
        .route("/api/v1/api-tokens", createApiTokenRoutes({
            clusterDatabaseManager: clusterDatabaseManager,
            database: database,
        }))
        .route("/api/v1/deployments", createDeploymentRoutes({
            clusterDatabaseManager: clusterDatabaseManager,
            database: database,
            deploymentOrchestrator: deploymentOrchestrator,
        }))
        .notFound(handleNotFound)
        .onError(handleAppError);
};

/**
 * RPC-visible application contract.
 *
 * Hono cannot infer responses returned by the global error handler, nor the
 * ones the authentication boundary returns before a route handler runs.
 * ApplyGlobalResponse makes those statuses explicit without changing the
 * runtime app, so clients are typed for every rejection the boundary can emit.
 * Public routes registered ahead of the boundary never return 401 or 403 at
 * runtime. Unmatched routes are not RPC-callable, so handleNotFound remains a
 * runtime-only 404; matched routes that can return 404 must use context.json
 * with the shared envelope and a literal 404 status.
 */
type AppType = ApplyGlobalResponse<
    ReturnType<typeof createApp>,
    {
        [HTTP_STATUS_BAD_REQUEST]: {json: ErrorEnvelope};
        [HTTP_STATUS_UNAUTHORIZED]: {json: ErrorEnvelope};
        [HTTP_STATUS_FORBIDDEN]: {json: ErrorEnvelope};
        [HTTP_STATUS_INTERNAL_SERVER_ERROR]: {json: ErrorEnvelope};
    }
>;

export {
    type AppType, createApp,
};
export type {CreateAppOptions};
