import type {ErrorHandler} from "hono";
import type {Db} from "mongodb";
import type {Pool} from "mysql2/promise";

import type {ClusterDatabaseManager} from "../cluster-databases.js";
import type {ApiTokenResponse} from "../contracts/api-token.js";
import {createErrorEnvelope} from "../contracts/error.js";
import type {ServerEnv} from "../environment.js";
import {HTTP_STATUS_SERVICE_UNAVAILABLE} from "../http-status.js";
import {
    type DeploymentDocument,
    DEPLOYMENTS_COLLECTION,
} from "../metadata-db-schemas/deployment.js";
import {
    type RegionDocument,
    REGIONS_COLLECTION,
} from "../metadata-db-schemas/region.js";
import {
    type ApiTokenRow,
    hasDeploymentAccess,
    selectBySelector,
    selectVisible,
} from "./api-token-sql.js";
import {
    computeRevocationEffectiveAt,
    computeTokenStatus,
    decodeTokenId,
    encodeTokenId,
} from "./token.js";


// The webserver strips the "auth0|" prefix from user IDs, but the database
// and downstream auth-server require the full original string. We must
// re-attach the prefix before querying or writing.
const AUTH0_SUBJECT_PREFIX = "auth0|";

/** A token row together with where it lives. */
type LocatedToken = {
    deployment: DeploymentDocument;
    pool: Pool;
    row: ApiTokenRow;
};

/** Raised when a cluster's pool cannot be opened. The routes answer 503. */
class ClusterUnreachableError extends Error {
}

/**
 * Whether a query failed because the connection failed, not because the
 * database rejected it. mysql2 marks errors that end the connection (refused,
 * unresolvable host, connect timeout, lost mid-query) as `fatal`; errors the
 * server answers with (duplicate key, no such table) are not.
 *
 * @param error
 * @return Whether the error is a mysql2 connection failure.
 */
const isConnectionFailure = (error: unknown): boolean => (
    "object" === typeof error &&
    null !== error &&
    "fatal" in error &&
    true === error.fatal
);

/**
 * Answers an unreachable cluster — its pool could not be opened, or a query
 * failed because the connection did — with 503, and leaves every other error
 * to the application's handler.
 *
 * @param error
 * @param context
 * @return The 503 response.
 * @throws The error, when it is neither.
 */
const handleClusterUnreachable: ErrorHandler<ServerEnv> = (error, context) => {
    if (!(error instanceof ClusterUnreachableError) && !isConnectionFailure(error)) {
        throw error;
    }
    console.error("A cluster database is unreachable.", {
        error: error,
        requestId: context.get("requestId"),
    });

    return context.json(
        createErrorEnvelope("SERVICE_UNAVAILABLE"),
        HTTP_STATUS_SERVICE_UNAVAILABLE,
    );
};

/**
 * Prefixes a caller's user ID into the form the auth database stores.
 *
 * @param userId
 * @return The full Auth0 subject.
 */
const subjectOf = (userId: string): string => `${AUTH0_SUBJECT_PREFIX}${userId}`;

/**
 * Shapes a row for the API.
 *
 * @param row
 * @param deploymentName
 * @param now The instant to compute the status at.
 * @return The public token object.
 */
const toResponse = (row: ApiTokenRow, deploymentName: string, now: Date): ApiTokenResponse => ({
    alias: row.alias,
    created_at: row.createdAt.toISOString(),
    deployment_id: row.deploymentId,
    deployment_name: deploymentName,
    expires_at: row.expiresAt.toISOString(),
    id: encodeTokenId(row.selector),
    revocation_effective_at: computeRevocationEffectiveAt(row)?.toISOString() ?? null,
    revoked_at: row.revokedAt?.toISOString() ?? null,
    status: computeTokenStatus(row, now),
    user_id: row.userId,
});

/**
 * Opens the pool for one cluster's database.
 *
 * @param clusterDatabaseManager
 * @param region
 * @param clusterId
 * @return The pool.
 * @throws {ClusterUnreachableError} When the cluster cannot be reached.
 */
const connectToCluster = async (
    clusterDatabaseManager: ClusterDatabaseManager,
    region: string,
    clusterId: string,
): Promise<Pool> => {
    try {
        return await clusterDatabaseManager.getPool(region, clusterId);
    } catch (error: unknown) {
        throw new ClusterUnreachableError(
            `Cluster ${clusterId} in ${region} is unreachable.`,
            {cause: error},
        );
    }
};

/**
 * Opens the pool for every cluster's database.
 *
 * A token ID does not say which cluster holds the token, so routes that only
 * have an ID must ask every cluster.
 *
 * TODO: Optimize this fanout search as cluster count scales.
 *
 * @param clusterDatabaseManager
 * @param database Metadata database, for the list of clusters.
 * @return One pool per cluster.
 * @throws {ClusterUnreachableError} When any cluster cannot be reached.
 */
const connectToAllClusters = async (
    clusterDatabaseManager: ClusterDatabaseManager,
    database: Db,
): Promise<Pool[]> => {
    const clusters = await database
        .collection<RegionDocument>(REGIONS_COLLECTION)
        .find({})
        .toArray();

    return Promise.all(clusters.map(
        (cluster) => connectToCluster(clusterDatabaseManager, cluster.region, cluster.cluster_id),
    ));
};

/**
 * Lists the tokens on one deployment that the caller may see.
 *
 * @param clusterDatabaseManager
 * @param deployment
 * @param userId
 * @return Every token on the deployment for its owner; only the caller's own
 * for anyone else with access; null when the caller has no access.
 * @throws {ClusterUnreachableError} When the deployment's cluster cannot be
 * reached.
 */
const listDeploymentTokens = async (
    clusterDatabaseManager: ClusterDatabaseManager,
    deployment: DeploymentDocument,
    userId: string,
): Promise<ApiTokenResponse[] | null> => {
    const pool = await connectToCluster(
        clusterDatabaseManager,
        deployment.spec.region,
        deployment.spec.cluster_id,
    );

    if (!await hasDeploymentAccess(pool, subjectOf(userId), deployment._id)) {
        return null;
    }

    const ownedIds = deployment.metadata.owner_id === userId ?
        [deployment._id] :
        [];
    const rows = await selectVisible(pool, subjectOf(userId), ownedIds);
    const now = new Date();

    return rows
        .filter((row) => row.deploymentId === deployment._id)
        .map((row) => toResponse(row, deployment.spec.deployment_name, now));
};

/**
 * Lists every token the caller may see, on every cluster.
 *
 * @param clusterDatabaseManager
 * @param database Metadata database, for deployments and regions.
 * @param userId
 * @return The caller's own tokens plus every token on deployments they own,
 * newest first across every cluster, ties broken by ID.
 * @throws {ClusterUnreachableError} When any cluster cannot be reached.
 */
const listAllTokens = async (
    clusterDatabaseManager: ClusterDatabaseManager,
    database: Db,
    userId: string,
): Promise<ApiTokenResponse[]> => {
    const deployments = database.collection<DeploymentDocument>(DEPLOYMENTS_COLLECTION);
    const pools = await connectToAllClusters(clusterDatabaseManager, database);
    const ownedIds = await deployments.distinct("_id", {"metadata.owner_id": userId});
    const rows = (await Promise.all(pools.map(
        (pool) => selectVisible(pool, subjectOf(userId), ownedIds),
    ))).flat()
        .sort((a, b) => (b.createdAt.getTime() - a.createdAt.getTime()) ||
            Buffer.compare(b.selector, a.selector));

    // A deployment that has since been deleted falls back to its ID.
    const names = new Map((await deployments
        .find({_id: {$in: rows.map((row) => row.deploymentId)}})
        .toArray()).map((deployment) => [
        deployment._id,
        deployment.spec.deployment_name,
    ]));
    const now = new Date();

    return rows.map((row) => toResponse(
        row,
        names.get(row.deploymentId) ?? row.deploymentId,
        now,
    ));
};

/**
 * Finds a token by querying every cluster in parallel.
 *
 * This does not check who is asking: the route decides whether the caller may
 * act on the token, and answers 404 either way so that IDs are never confirmed.
 *
 * @param clusterDatabaseManager
 * @param database Metadata database, for the token's deployment and regions.
 * @param tokenId
 * @return The row, its pool, and its deployment; or null when no cluster has
 * the token or its deployment no longer exists.
 * @throws {ClusterUnreachableError} When any cluster cannot be reached.
 */
const locateToken = async (
    clusterDatabaseManager: ClusterDatabaseManager,
    database: Db,
    tokenId: string,
): Promise<LocatedToken | null> => {
    const selector = decodeTokenId(tokenId);
    if (null === selector) {
        return null;
    }

    const pools = await connectToAllClusters(clusterDatabaseManager, database);
    const found = (await Promise.all(pools.map(async (pool) => ({
        pool: pool,
        row: await selectBySelector(pool, selector),
    })))).find(({row}) => null !== row);

    if ("undefined" === typeof found || null === found.row) {
        return null;
    }

    const deployment = await database
        .collection<DeploymentDocument>(DEPLOYMENTS_COLLECTION)
        .findOne({_id: found.row.deploymentId});

    if (null === deployment) {
        return null;
    }

    return {deployment: deployment, pool: found.pool, row: found.row};
};

export {
    connectToCluster,
    handleClusterUnreachable,
    listAllTokens,
    listDeploymentTokens,
    locateToken,
    subjectOf,
    toResponse,
};
