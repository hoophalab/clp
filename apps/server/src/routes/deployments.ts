import {randomUUID} from "node:crypto";

import {Hono} from "hono";
import {
    type Db,
    MongoServerError,
} from "mongodb";

import type {ClusterDatabaseManager} from "../cluster-databases.js";
import {
    CheckDeploymentNameQuerySchema,
    CheckDeploymentNameResponseSchema,
    CreateDeploymentRequestSchema,
    DeploymentNameSchema,
    DeploymentResponseSchema,
    ListDeploymentsQuerySchema,
    ListDeploymentsResponseSchema,
} from "../contracts/deployment.js";
import {createErrorEnvelope} from "../contracts/error.js";
import type {DeploymentOrchestrator} from "../deployment-orchestrator/index.js";
import type {ServerEnv} from "../environment.js";
import {
    HTTP_STATUS_ACCEPTED,
    HTTP_STATUS_BAD_REQUEST,
    HTTP_STATUS_CONFLICT,
    HTTP_STATUS_OK,
} from "../http-status.js";
import {
    type DeploymentDocument,
    DEPLOYMENTS_COLLECTION,
} from "../metadata-db-schemas/deployment.js";
import {
    type RegionDocument,
    REGIONS_COLLECTION,
} from "../metadata-db-schemas/region.js";
import {requestValidator} from "../request-validation.js";
import {parseContractResponse} from "../response-validation.js";


const MONGO_DUPLICATE_KEY_ERROR_CODE = 11_000;
const AUTH0_SUBJECT_PREFIX = "auth0|";

type DeploymentRouteOptions = {
    clusterDatabaseManager: ClusterDatabaseManager;
    database: Db;
    deploymentOrchestrator: DeploymentOrchestrator;
};

/**
 * Creates authenticated deployment routes backed by metadata persistence and the deployment
 * orchestrator.
 *
 * @param options Database, access-grant, and provisioning dependencies.
 * @param options.clusterDatabaseManager Cluster database connection manager.
 * @param options.database Deployment metadata database.
 * @param options.deploymentOrchestrator Asynchronous provisioning dispatcher.
 * @return The deployment route group.
 */
// eslint-disable-next-line max-lines-per-function -- Keep the inferred Hono route chain intact.
const createDeploymentRoutes = ({
    clusterDatabaseManager,
    database,
    deploymentOrchestrator,
}: DeploymentRouteOptions) => {
    const deployments = database.collection<DeploymentDocument>(
        DEPLOYMENTS_COLLECTION,
    );

    return new Hono<ServerEnv>()
        .get(
            "/",
            requestValidator("query", ListDeploymentsQuerySchema),
            async (context) => {
                const {limit, page} = context.req.valid("query");
                const filter = context.get("isAdmin") ?
                    {} :
                    {"metadata.owner_id": context.get("userId")};
                const [data, total] = await Promise.all([
                    deployments.find(filter)
                        .sort({"metadata.created_at": -1, "_id": -1})
                        .skip((page - 1) * limit)
                        .limit(limit)
                        .toArray(),
                    deployments.countDocuments(filter),
                ]);

                return context.json(
                    parseContractResponse(ListDeploymentsResponseSchema, {
                        data: data,
                        limit: limit,
                        page: page,
                        total: total,
                    }),
                    HTTP_STATUS_OK,
                );
            },
        )
        .get(
            "/check-name",
            requestValidator("query", CheckDeploymentNameQuerySchema),
            async (context) => {
                const {name} = context.req.valid("query");
                let reason: string | null = null;

                if (!DeploymentNameSchema.safeParse(name).success) {
                    reason = "Name must be 5-32 lowercase letters, digits, and/or hyphens, " +
                        "and start and end with a letter or digit.";
                } else if (null !== await deployments.findOne(
                    {"metadata.owner_id": context.get("userId"), "spec.deployment_name": name},
                    {projection: {_id: 1}},
                )) {
                    reason = "You already have a deployment with this name.";
                }

                return context.json(
                    parseContractResponse(CheckDeploymentNameResponseSchema, {
                        available: null === reason,
                        reason: reason,
                    }),
                    HTTP_STATUS_OK,
                );
            },
        )
        .post(
            "/",
            requestValidator("json", CreateDeploymentRequestSchema),
            // eslint-disable-next-line max-lines-per-function
            async (context) => {
                const request = context.req.valid("json");
                const targetRegion = await database.collection<RegionDocument>(
                    REGIONS_COLLECTION,
                ).findOne(
                    {
                        cloud_provider: request.cloud_provider,
                        region: request.region,
                        ...("undefined" === typeof request.cluster_id ?
                            {} :
                            {cluster_id: request.cluster_id}),
                    },
                    {sort: {cluster_id: 1}},
                );

                if (null === targetRegion) {
                    return context.json(
                        createErrorEnvelope("UNKNOWN_CLUSTER_TARGET"),
                        HTTP_STATUS_BAD_REQUEST,
                    );
                }
                if (
                    "undefined" !== typeof request.helm_chart_version &&
                    request.helm_chart_version !== targetRegion.defaults.helm_chart_version
                ) {
                    return context.json(
                        createErrorEnvelope("VERSION_NOT_FOUND"),
                        HTTP_STATUS_BAD_REQUEST,
                    );
                }

                const now = new Date();
                const deployment: DeploymentDocument = {
                    _id: randomUUID().replaceAll("-", ""),
                    metadata: {
                        created_at: now,
                        email: context.get("email"),
                        org_id: null,
                        owner_id: context.get("userId"),
                    },
                    spec: {
                        cloud_provider: targetRegion.cloud_provider,
                        clp_image_tag: targetRegion.defaults.clp_image_tag,
                        cluster_id: targetRegion.cluster_id,
                        deployment_name: request.deployment_name,
                        helm_chart_version: request.helm_chart_version ??
                            targetRegion.defaults.helm_chart_version,
                        num_compression_workers: request.num_compression_workers,
                        num_search_workers: request.num_search_workers,
                        region: targetRegion.region,
                    },
                    status: {
                        last_active_at: now,
                        phase: "CREATE_REQUESTED",
                        phase_transition_records: {CREATE_REQUESTED: now},
                    },
                };

                try {
                    await deployments.insertOne(deployment);
                } catch (error: unknown) {
                    if (
                        error instanceof MongoServerError &&
                        MONGO_DUPLICATE_KEY_ERROR_CODE === error.code
                    ) {
                        return context.json(
                            createErrorEnvelope("NAME_TAKEN"),
                            HTTP_STATUS_CONFLICT,
                        );
                    }
                    throw error;
                }

                const clusterDatabase = await clusterDatabaseManager.getPool(
                    deployment.spec.region,
                    deployment.spec.cluster_id,
                );

                await clusterDatabase.execute(
                    "INSERT INTO auth.user_deployment_access (user_id, deployment_id) " +
                        "VALUES (?, ?) ON DUPLICATE KEY UPDATE user_id = user_id",
                    [
                        `${AUTH0_SUBJECT_PREFIX}${deployment.metadata.owner_id}`,
                        deployment._id,
                    ],
                );
                await deploymentOrchestrator.schedule(deployment._id);

                return context.json(
                    parseContractResponse(DeploymentResponseSchema, deployment),
                    HTTP_STATUS_ACCEPTED,
                );
            },
        );
};

export {createDeploymentRoutes};
export type {DeploymentRouteOptions};
