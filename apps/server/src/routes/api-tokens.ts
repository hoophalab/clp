import {Hono} from "hono";
import type {ApplyGlobalResponse} from "hono/client";
import type {Db} from "mongodb";

import {
    connectToCluster,
    handleClusterUnreachable,
    listAllTokens,
    listDeploymentTokens,
    locateToken,
    subjectOf,
    toResponse,
} from "../api-tokens/api-token-lookups.js";
import {
    deleteIfExpired,
    hasDeploymentAccess,
    insertToken,
    isDuplicateAlias,
    markRevoked,
    selectBySelector,
    updateAlias,
} from "../api-tokens/api-token-sql.js";
import {generateToken} from "../api-tokens/token.js";
import type {ClusterDatabaseManager} from "../cluster-databases.js";
import {
    type ApiTokenResponse,
    ApiTokenResponseSchema,
    CreateApiTokenRequestSchema,
    CreateApiTokenResponseSchema,
    ListApiTokensQuerySchema,
    ListApiTokensResponseSchema,
    TokenIdParamSchema,
    UpdateApiTokenRequestSchema,
} from "../contracts/api-token.js";
import {
    createErrorEnvelope,
    type ErrorEnvelope,
} from "../contracts/error.js";
import type {ServerEnv} from "../environment.js";
import {
    HTTP_STATUS_BAD_REQUEST,
    HTTP_STATUS_CONFLICT,
    HTTP_STATUS_CREATED,
    HTTP_STATUS_FORBIDDEN,
    HTTP_STATUS_NO_CONTENT,
    HTTP_STATUS_NOT_FOUND,
    HTTP_STATUS_OK,
    HTTP_STATUS_SERVICE_UNAVAILABLE,
} from "../http-status.js";
import {
    type DeploymentDocument,
    DEPLOYMENTS_COLLECTION,
} from "../metadata-db-schemas/deployment.js";
import {requestValidator} from "../request-validation.js";
import {parseContractResponse} from "../response-validation.js";


type ApiTokenRouteOptions = {
    clusterDatabaseManager: ClusterDatabaseManager;
    database: Db;
};

/**
 * Creates the authenticated API token routes.
 *
 * Tokens live in the database of the cluster hosting their deployment. Anyone
 * with access to a deployment may create tokens on it and list their own. The
 * owner sees every token on it and may revoke any; a token's creator may
 * rename, revoke, and delete their own. The `/:id` routes answer 404 whenever
 * the caller may not act on the token, so that token IDs are never confirmed
 * to exist.
 *
 * An unreachable cluster database fails the request with 503 through the
 * route group's error handler. ApplyGlobalResponse declares the status so RPC
 * clients see it.
 *
 * @param options
 * @param options.clusterDatabaseManager Cluster database connection manager.
 * @param options.database Metadata database, for deployments and regions.
 * @return The API token route group.
 */
// eslint-disable-next-line max-lines-per-function -- Keep the inferred Hono route chain intact.
const createApiTokenRoutes = ({
    clusterDatabaseManager,
    database,
}: ApiTokenRouteOptions) => {
    const deployments = database.collection<DeploymentDocument>(DEPLOYMENTS_COLLECTION);

    const routes = new Hono<ServerEnv>()
        .onError(handleClusterUnreachable)
        .get(
            "/",
            requestValidator("query", ListApiTokensQuerySchema),
            async (context) => {
                const {deployment: deploymentId} = context.req.valid("query");
                const userId = context.get("userId");
                let tokens: ApiTokenResponse[] | null;

                if ("undefined" === typeof deploymentId) {
                    tokens = await listAllTokens(clusterDatabaseManager, database, userId);
                } else {
                    const deployment = await deployments.findOne({_id: deploymentId});
                    if (null === deployment) {
                        return context.json(
                            createErrorEnvelope("not_found"),
                            HTTP_STATUS_NOT_FOUND,
                        );
                    }

                    // Only a user with access to the deployment may list on it.
                    tokens = await listDeploymentTokens(clusterDatabaseManager, deployment, userId);
                    if (null === tokens) {
                        return context.json(
                            createErrorEnvelope("forbidden"),
                            HTTP_STATUS_FORBIDDEN,
                        );
                    }
                }

                return context.json(
                    parseContractResponse(ListApiTokensResponseSchema, {
                        tokens: tokens,
                        unreachable_regions: [],
                    }),
                    HTTP_STATUS_OK,
                );
            },
        )
        .post(
            "/",
            requestValidator("json", CreateApiTokenRequestSchema),
            async (context) => {
                const request = context.req.valid("json");

                if (new Date(request.expires_at) <= new Date()) {
                    return context.json(
                        createErrorEnvelope("invalid_request"),
                        HTTP_STATUS_BAD_REQUEST,
                    );
                }

                const deployment = await deployments.findOne({_id: request.deployment_id});
                if (null === deployment) {
                    return context.json(createErrorEnvelope("not_found"), HTTP_STATUS_NOT_FOUND);
                }

                const pool = await connectToCluster(
                    clusterDatabaseManager,
                    deployment.spec.region,
                    deployment.spec.cluster_id,
                );

                // Whoever the auth server would admit may mint a token.
                if (!await hasDeploymentAccess(
                    pool,
                    subjectOf(context.get("userId")),
                    deployment._id,
                )) {
                    return context.json(createErrorEnvelope("forbidden"), HTTP_STATUS_FORBIDDEN);
                }

                const token = generateToken();
                try {
                    await insertToken(pool, {
                        alias: request.alias,
                        deploymentId: deployment._id,
                        expiresAt: new Date(request.expires_at),
                        secretHash: token.secretHash,
                        selector: token.selector,
                        userId: subjectOf(context.get("userId")),
                    });
                } catch (error: unknown) {
                    if (isDuplicateAlias(error)) {
                        return context.json(createErrorEnvelope("CONFLICT"), HTTP_STATUS_CONFLICT);
                    }
                    throw error;
                }

                // Read back so the response carries the database's created_at.
                const row = await selectBySelector(pool, token.selector);
                if (null === row) {
                    throw new Error("The token was inserted but could not be read back.");
                }

                // The plaintext exists only in this response; nothing on the
                // path may keep a copy.
                context.header("Cache-Control", "no-store");

                return context.json(
                    parseContractResponse(CreateApiTokenResponseSchema, {
                        ...toResponse(row, deployment.spec.deployment_name, new Date()),
                        plaintext_token: token.plaintext,
                    }),
                    HTTP_STATUS_CREATED,
                );
            },
        )
        .patch(
            "/:id",
            requestValidator("param", TokenIdParamSchema),
            requestValidator("json", UpdateApiTokenRequestSchema),
            async (context) => {
                const {id} = context.req.valid("param");
                const {alias} = context.req.valid("json");
                const subject = subjectOf(context.get("userId"));

                // Only the creator may rename.
                const located = await locateToken(clusterDatabaseManager, database, id);
                if (null === located || located.row.userId !== subject) {
                    return context.json(createErrorEnvelope("not_found"), HTTP_STATUS_NOT_FOUND);
                }

                try {
                    await updateAlias(located.pool, located.row.selector, subject, alias);
                } catch (error: unknown) {
                    if (isDuplicateAlias(error)) {
                        return context.json(createErrorEnvelope("CONFLICT"), HTTP_STATUS_CONFLICT);
                    }
                    throw error;
                }

                return context.json(
                    parseContractResponse(ApiTokenResponseSchema, toResponse(
                        {...located.row, alias: alias},
                        located.deployment.spec.deployment_name,
                        new Date(),
                    )),
                    HTTP_STATUS_OK,
                );
            },
        )
        .post(
            "/:id/revoke",
            requestValidator("param", TokenIdParamSchema),
            async (context) => {
                const {id} = context.req.valid("param");
                const userId = context.get("userId");

                // The creator or the deployment's owner may revoke.
                const located = await locateToken(clusterDatabaseManager, database, id);
                if (
                    null === located ||
                    (located.row.userId !== subjectOf(userId) &&
                        located.deployment.metadata.owner_id !== userId)
                ) {
                    return context.json(createErrorEnvelope("not_found"), HTTP_STATUS_NOT_FOUND);
                }

                await markRevoked(located.pool, located.row.selector);

                // Read back so the response carries the database's revoked_at.
                const revoked = await selectBySelector(located.pool, located.row.selector);
                if (null === revoked) {
                    return context.json(createErrorEnvelope("not_found"), HTTP_STATUS_NOT_FOUND);
                }

                return context.json(
                    parseContractResponse(ApiTokenResponseSchema, toResponse(
                        revoked,
                        located.deployment.spec.deployment_name,
                        new Date(),
                    )),
                    HTTP_STATUS_OK,
                );
            },
        )
        .delete(
            "/:id",
            requestValidator("param", TokenIdParamSchema),
            async (context) => {
                const {id} = context.req.valid("param");
                const subject = subjectOf(context.get("userId"));

                // Only the creator may delete.
                const located = await locateToken(clusterDatabaseManager, database, id);
                if (null === located || located.row.userId !== subject) {
                    return context.json(createErrorEnvelope("not_found"), HTTP_STATUS_NOT_FOUND);
                }

                // The row was there a moment ago, so the only reason not to
                // delete it is that something may still honour it.
                if (!await deleteIfExpired(located.pool, located.row.selector, subject)) {
                    return context.json(createErrorEnvelope("CONFLICT"), HTTP_STATUS_CONFLICT);
                }

                return context.body(null, HTTP_STATUS_NO_CONTENT);
            },
        );

    return routes as ApplyGlobalResponse<typeof routes, {
        [HTTP_STATUS_SERVICE_UNAVAILABLE]: {json: ErrorEnvelope};
    }>;
};

export {createApiTokenRoutes};
export type {ApiTokenRouteOptions};
