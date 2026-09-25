import * as z from "zod";

import {
    DeploymentPhaseSchema,
    WorkerCountSchema,
} from "../metadata-db-schemas/deployment.js";


const DEPLOYMENT_NAME_LENGTH_MIN = 5;
const DEPLOYMENT_NAME_LENGTH_MAX = 32;
const DEPLOYMENT_LIST_LIMIT_DEFAULT = 20;
const DEPLOYMENT_LIST_LIMIT_MAX = 100;
const DEPLOYMENT_LIST_PAGE_MAX = 1_000;

const DeploymentNameSchema = z.string().min(DEPLOYMENT_NAME_LENGTH_MIN)
    .max(DEPLOYMENT_NAME_LENGTH_MAX)
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u);

const CreateDeploymentRequestSchema = z.strictObject({
    cloud_provider: z.literal("aws"),
    cluster_id: z.string().min(1)
        .optional(),
    deployment_name: DeploymentNameSchema,
    helm_chart_version: z.string().min(1)
        .optional(),
    num_compression_workers: WorkerCountSchema,
    num_search_workers: WorkerCountSchema,
    region: z.string().min(1),
});

const CheckDeploymentNameQuerySchema = z.strictObject({
    name: z.string(),
});

const CheckDeploymentNameResponseSchema = z.strictObject({
    available: z.boolean(),
    reason: z.string().nullable(),
});

const DateTimeSchema = z.preprocess(
    (value) => {
        return value instanceof Date ?
            value.toISOString() :
            value;
    },
    z.iso.datetime(),
);

const DeploymentSpecPatchSchema = z.strictObject({
    clp_image_tag: z.string().optional(),
    deployment_name: z.string().optional(),
    helm_chart_version: z.string().optional(),
    num_compression_workers: WorkerCountSchema.optional(),
    num_search_workers: WorkerCountSchema.optional(),
});

const DeploymentResponseSchema = z.strictObject({
    _id: z.string(),
    metadata: z.strictObject({
        created_at: DateTimeSchema,
        email: z.string(),
        org_id: z.string().nullable(),
        owner_id: z.string(),
    }),
    spec: z.strictObject({
        cloud_provider: z.literal("aws"),
        clp_image_tag: z.string(),
        cluster_id: z.string(),
        deployment_name: z.string(),
        helm_chart_version: z.string(),
        num_compression_workers: WorkerCountSchema,
        num_search_workers: WorkerCountSchema,
        region: z.string(),
    }),
    status: z.strictObject({
        archive_bucket: z.string().optional(),
        deploymentNotFunctional: z.boolean().optional(),
        error: z.string().optional(),
        last_active_at: DateTimeSchema.optional(),
        pending_update: z.strictObject({
            requested_by: z.string(),
            spec_patch: DeploymentSpecPatchSchema,
        }).optional(),
        phase: DeploymentPhaseSchema,
        phase_transition_records: z.partialRecord(
            DeploymentPhaseSchema,
            DateTimeSchema,
        ),
        public_url: z.httpUrl().optional(),
        s3_access_role_arn: z.string().optional(),
    }),
});

const ListDeploymentsQuerySchema = z.strictObject({
    limit: z.coerce.number().int()
        .min(1)
        .max(DEPLOYMENT_LIST_LIMIT_MAX)
        .default(DEPLOYMENT_LIST_LIMIT_DEFAULT),
    page: z.coerce.number().int()
        .min(1)
        .max(DEPLOYMENT_LIST_PAGE_MAX)
        .default(1),
});

const ListDeploymentsResponseSchema = z.strictObject({
    data: z.array(DeploymentResponseSchema),
    limit: z.number().int()
        .min(1)
        .max(DEPLOYMENT_LIST_LIMIT_MAX),
    page: z.number().int()
        .min(1)
        .max(DEPLOYMENT_LIST_PAGE_MAX),
    total: z.number().int()
        .nonnegative(),
});

type CheckDeploymentNameResponse = z.infer<
    typeof CheckDeploymentNameResponseSchema
>;

type CreateDeploymentRequest = z.infer<typeof CreateDeploymentRequestSchema>;

type DeploymentResponse = z.infer<typeof DeploymentResponseSchema>;

type ListDeploymentsResponse = z.infer<typeof ListDeploymentsResponseSchema>;

export {
    CheckDeploymentNameQuerySchema,
    type CheckDeploymentNameResponse,
    CheckDeploymentNameResponseSchema,
    type CreateDeploymentRequest,
    CreateDeploymentRequestSchema,
    DeploymentNameSchema,
    type DeploymentResponse,
    DeploymentResponseSchema,
    ListDeploymentsQuerySchema,
    type ListDeploymentsResponse,
    ListDeploymentsResponseSchema,
};
