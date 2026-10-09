/* eslint-disable max-lines -- Keep deployment lifecycle routes together. */
import {randomUUID} from "node:crypto";

import {
    GetObjectCommand,
    ListObjectsV2Command,
    S3Client,
    S3ServiceException,
} from "@aws-sdk/client-s3";
import {
    AssumeRoleCommand,
    STSClient,
} from "@aws-sdk/client-sts";
import {Hono} from "hono";
import {
    type Db,
    MongoServerError,
} from "mongodb";

import {
    deleteDeploymentAccess,
    markDeploymentTokensRevoked,
} from "../api-tokens/api-token-sql.js";
import type {ClusterDatabaseManager} from "../cluster-databases.js";
import {
    CheckDeploymentNameQuerySchema,
    CheckDeploymentNameResponseSchema,
    CreateDeploymentRequestSchema,
    DEPLOYMENT_DELETABLE_PHASES,
    DeploymentIdParamSchema,
    DeploymentNameSchema,
    DeploymentResponseSchema,
    ListDeploymentsQuerySchema,
    ListDeploymentsResponseSchema,
} from "../contracts/deployment.js";
import {createErrorEnvelope} from "../contracts/error.js";
import {
    IAM_ROLE_ARN_PATTERN,
    type S3AccessFailureReason,
    VerifyS3AccessRequestSchema,
    VerifyS3AccessResponseSchema,
} from "../contracts/s3-access.js";
import type {DeploymentOrchestrator} from "../deployment-orchestrator/index.js";
import type {ServerEnv} from "../environment.js";
import {
    HTTP_STATUS_ACCEPTED,
    HTTP_STATUS_BAD_REQUEST,
    HTTP_STATUS_CONFLICT,
    HTTP_STATUS_FORBIDDEN,
    HTTP_STATUS_NOT_FOUND,
    HTTP_STATUS_OK,
    HTTP_STATUS_RANGE_NOT_SATISFIABLE,
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
const ASSUMED_ROLE_SESSION_SECONDS = 900;
const S3_ACCESS_VERIFICATION_TIMEOUT_MILLISECS = 15_000;

type DeploymentRouteOptions = {
    clusterDatabaseManager: ClusterDatabaseManager;
    database: Db;
    deploymentOrchestrator: DeploymentOrchestrator;
};

/**
 * Maps an S3 error to a failure reason that the user can act on.
 *
 * @param error
 * @return The failure reason, or null when the error is not a known customer-side failure.
 */
const classifyS3Error = (error: unknown): S3AccessFailureReason | null => {
    if (false === error instanceof S3ServiceException) {
        return null;
    }

    switch (error.name) {
        case "NoSuchBucket":
            return "bucket_not_found";
        case "NoSuchKey":
            return "object_not_found";
        case "InvalidObjectState":
            return "object_archived";
        case "InvalidRange":
            return "object_empty";
        default:
            break;
    }

    const {httpStatusCode} = error.$metadata;
    if (HTTP_STATUS_RANGE_NOT_SATISFIABLE === httpStatusCode) {
        return "object_empty";
    }
    if (HTTP_STATUS_FORBIDDEN === httpStatusCode || "AccessDenied" === error.name) {
        return (/\bkms\b/iu).test(error.message) ?
            "unsupported_encryption" :
            "access_denied";
    }

    return null;
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
        )
        .delete(
            "/:id",
            requestValidator("param", DeploymentIdParamSchema),
            async (context) => {
                const {id} = context.req.valid("param");
                const ownershipFilter = context.get("isAdmin") ?
                    {} :
                    {"metadata.owner_id": context.get("userId")};
                const deployment = await deployments.findOne({
                    _id: id,
                    ...ownershipFilter,
                });

                if (null === deployment) {
                    return context.json(
                        createErrorEnvelope("not_found"),
                        HTTP_STATUS_NOT_FOUND,
                    );
                }

                if (!DEPLOYMENT_DELETABLE_PHASES.has(deployment.status.phase)) {
                    return context.json(
                        createErrorEnvelope("CONFLICT"),
                        HTTP_STATUS_CONFLICT,
                    );
                }

                const clusterDatabase = await clusterDatabaseManager.getPool(
                    deployment.spec.region,
                    deployment.spec.cluster_id,
                );

                await markDeploymentTokensRevoked(clusterDatabase, id);
                await deleteDeploymentAccess(clusterDatabase, id);

                const deletionRequested = await deployments.findOneAndUpdate(
                    {
                        "_id": id,
                        ...ownershipFilter,
                        "status.phase": deployment.status.phase,
                    },
                    {
                        $set: {
                            "status.phase": "DELETE_REQUESTED",
                            "status.phase_transition_records.DELETE_REQUESTED": new Date(),
                        },
                        $unset: {
                            "status.error": "",
                            "status.pending_update": "",
                        },
                    },
                    {returnDocument: "after"},
                );

                if (null === deletionRequested) {
                    return context.json(
                        createErrorEnvelope("CONFLICT"),
                        HTTP_STATUS_CONFLICT,
                    );
                }

                await deploymentOrchestrator.schedule(id);

                return context.json(
                    parseContractResponse(
                        DeploymentResponseSchema,
                        deletionRequested,
                    ),
                    HTTP_STATUS_ACCEPTED,
                );
            },
        )
        .post(
            "/:id/verify-s3-access",
            requestValidator("param", DeploymentIdParamSchema),
            requestValidator("json", VerifyS3AccessRequestSchema),
            // eslint-disable-next-line max-lines-per-function, max-statements
            async (context) => {
                const deployment = await deployments.findOne({
                    "_id": context.req.valid("param").id,
                    "metadata.owner_id": context.get("userId"),
                });

                if (null === deployment) {
                    return context.json(
                        createErrorEnvelope("not_found"),
                        HTTP_STATUS_NOT_FOUND,
                    );
                }

                const roleArn = deployment.status.s3_access_role_arn;
                if (
                    "RUNNING" !== deployment.status.phase ||
                    "undefined" === typeof roleArn ||
                    !IAM_ROLE_ARN_PATTERN.test(roleArn)
                ) {
                    return context.json(
                        createErrorEnvelope("DEPLOYMENT_UNAVAILABLE"),
                        HTTP_STATUS_CONFLICT,
                    );
                }

                const request = context.req.valid("json");
                const {region} = deployment.spec;
                const callerSignal = context.req.raw.signal;
                const timeoutSignal = AbortSignal.timeout(S3_ACCESS_VERIFICATION_TIMEOUT_MILLISECS);
                const signal = AbortSignal.any([callerSignal,
                    timeoutSignal]);

                const stsClient = new STSClient({region});
                let s3Client: S3Client | null = null;
                let reason: S3AccessFailureReason | null = null;
                try {
                    const {Credentials: credentials} = await stsClient.send(
                        new AssumeRoleCommand({
                            DurationSeconds: ASSUMED_ROLE_SESSION_SECONDS,
                            RoleArn: roleArn,
                            RoleSessionName: `yscope-verify-${context.get("requestId")}`,
                        }),
                        {abortSignal: signal},
                    );

                    if (
                        "undefined" === typeof credentials?.AccessKeyId ||
                        "undefined" === typeof credentials.SecretAccessKey ||
                        "undefined" === typeof credentials.SessionToken
                    ) {
                        throw new Error(
                            "STS returned no credentials for the deployment's S3 access role.",
                        );
                    }

                    s3Client = new S3Client({
                        credentials: {
                            accessKeyId: credentials.AccessKeyId,
                            secretAccessKey: credentials.SecretAccessKey,
                            sessionToken: credentials.SessionToken,
                        },
                        followRegionRedirects: true,
                        region: region,
                    });

                    await s3Client.send(
                        new ListObjectsV2Command({
                            Bucket: request.bucket,
                            MaxKeys: 1,
                            Prefix: request.key,
                        }),
                        {abortSignal: signal},
                    );
                    const {Body: body} = await s3Client.send(
                        new GetObjectCommand({
                            Bucket: request.bucket,
                            Key: request.key,
                            Range: "bytes=0-0",
                        }),
                        {abortSignal: signal},
                    );

                    if ("undefined" === typeof body) {
                        throw new Error("S3 returned no object body.");
                    }
                    await body.transformToByteArray();
                } catch (error: unknown) {
                    reason = timeoutSignal.aborted && !callerSignal.aborted ?
                        "timed_out" :
                        classifyS3Error(error);
                    if (null === reason || callerSignal.aborted) {
                        throw error;
                    }
                } finally {
                    stsClient.destroy();
                    s3Client?.destroy();
                }

                return context.json(
                    parseContractResponse(
                        VerifyS3AccessResponseSchema,
                        null === reason ?
                            {status: "verified"} :
                            {
                                reason: reason,
                                status: "failed",
                            },
                    ),
                    HTTP_STATUS_OK,
                );
            },
        );
};

export {createDeploymentRoutes};
export type {DeploymentRouteOptions};
