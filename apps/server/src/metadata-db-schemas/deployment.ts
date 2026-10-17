import * as z from "zod";


const DEPLOYMENTS_COLLECTION = "deployments";

const REQUESTED_PHASES = [
    "CONFIG_REQUESTED",
    "CREATE_REQUESTED",
    "DELETE_REQUESTED",
    "RESUME_REQUESTED",
    "SUSPEND_REQUESTED",
] as const;

const RequestedDeploymentPhaseSchema = z.enum(REQUESTED_PHASES);
type RequestedDeploymentPhase = z.infer<
    typeof RequestedDeploymentPhaseSchema
>;

const IN_PROGRESS_PHASES = [
    "CONFIGURING",
    "CREATING",
    "DELETING",
    "RESUMING",
    "SUSPENDING",
] as const;

const InProgressDeploymentPhaseSchema = z.enum(IN_PROGRESS_PHASES);
type InProgressDeploymentPhase = z.infer<
    typeof InProgressDeploymentPhaseSchema
>;

const REQUEST_RESULT_PHASES = [
    "CONFIG_FAILED",
    "CREATE_FAILED",
    "DELETE_FAILED",
    "DELETED",
    "RESUME_FAILED",
    "RUNNING",
    "SUSPEND_FAILED",
    "SUSPENDED",
] as const;

const RequestResultDeploymentPhaseSchema = z.enum(REQUEST_RESULT_PHASES);
type RequestResultDeploymentPhase = z.infer<
    typeof RequestResultDeploymentPhaseSchema
>;

const DEPLOYMENT_PHASES = [
    ...REQUESTED_PHASES,
    ...IN_PROGRESS_PHASES,
    ...REQUEST_RESULT_PHASES,
] as const;

const DeploymentPhaseSchema = z.enum(DEPLOYMENT_PHASES);
type DeploymentPhase = z.infer<typeof DeploymentPhaseSchema>;

const PENDING_UPDATE_PHASES = [
    "CONFIG_FAILED",
    "CONFIG_REQUESTED",
    "CONFIGURING",
] as const satisfies readonly DeploymentPhase[];

const PendingUpdatePhaseSchema = z.enum(PENDING_UPDATE_PHASES);

const PhaseWithoutPendingUpdateSchema = DeploymentPhaseSchema.exclude(
    PENDING_UPDATE_PHASES,
);

const WorkerCountSchema = z.int().positive();

const DeploymentSpecSchema = z.strictObject({
    cloud_provider: z.literal("aws"),
    clp_image_tag: z.string(),
    cluster_id: z.string(),
    deployment_name: z.string(),
    helm_chart_version: z.string(),
    num_compression_workers: WorkerCountSchema,
    num_search_workers: WorkerCountSchema,
    region: z.string(),
});

const DeploymentSpecPatchShape = {
    clp_image_tag: DeploymentSpecSchema.shape.clp_image_tag.exactOptional(),
    deployment_name: DeploymentSpecSchema.shape.deployment_name.exactOptional(),
    helm_chart_version: DeploymentSpecSchema.shape.helm_chart_version.exactOptional(),
    num_compression_workers: DeploymentSpecSchema.shape.num_compression_workers.exactOptional(),
    num_search_workers: DeploymentSpecSchema.shape.num_search_workers.exactOptional(),
};

const DeploymentSpecPatchSchema = z.union([
    z.strictObject({
        ...DeploymentSpecPatchShape,
        clp_image_tag: DeploymentSpecSchema.shape.clp_image_tag,
    }),
    z.strictObject({
        ...DeploymentSpecPatchShape,
        num_compression_workers: DeploymentSpecSchema.shape.num_compression_workers,
    }),
    z.strictObject({
        ...DeploymentSpecPatchShape,
        deployment_name: DeploymentSpecSchema.shape.deployment_name,
    }),
    z.strictObject({
        ...DeploymentSpecPatchShape,
        helm_chart_version: DeploymentSpecSchema.shape.helm_chart_version,
    }),
    z.strictObject({
        ...DeploymentSpecPatchShape,
        num_search_workers: DeploymentSpecSchema.shape.num_search_workers,
    }),
]);

const DeploymentMetadataSchema = z.strictObject({
    created_at: z.date(),
    email: z.string(),
    org_id: z.string().nullable(),
    owner_id: z.string(),
});

const PendingDeploymentUpdateSchema = z.strictObject({
    requested_by: z.string(),
    spec_patch: DeploymentSpecPatchSchema,
});

const DeploymentStatusCommonShape = {
    archive_bucket: z.string().exactOptional(),

    // When deletion was first requested; billing stops then. Unlike
    // `phase_transition_records.DELETE_REQUESTED`, a retried deletion doesn't change it.
    deletion_requested_at: z.date().exactOptional(),

    deploymentNotFunctional: z.boolean().exactOptional(),
    error: z.string().exactOptional(),
    last_active_at: z.date().exactOptional(),
    phase_transition_records: z.partialRecord(
        DeploymentPhaseSchema,
        z.date(),
    ),
    public_url: z.httpUrl().exactOptional(),
    s3_access_role_arn: z.string().exactOptional(),
};

const DeploymentStatusSchema = z.discriminatedUnion("phase", [
    z.strictObject({
        ...DeploymentStatusCommonShape,
        pending_update: PendingDeploymentUpdateSchema,
        phase: PendingUpdatePhaseSchema,
    }),
    z.strictObject({
        ...DeploymentStatusCommonShape,
        phase: PhaseWithoutPendingUpdateSchema,
    }),
]).superRefine((status, context) => {
    const currentPhaseTimestamp = status.phase_transition_records[status.phase];

    if (!currentPhaseTimestamp) {
        context.addIssue({
            code: "custom",
            message: `Missing transition timestamp for ${status.phase}.`,
            path: [
                "phase_transition_records",
                status.phase,
            ],
        });

        return;
    }

    const hasNewerTransition = Object.values(status.phase_transition_records).some(
        (timestamp) => timestamp.getTime() > currentPhaseTimestamp.getTime(),
    );

    if (hasNewerTransition) {
        context.addIssue({
            code: "custom",
            message: `Timestamp for ${status.phase} is older than another phase's timestamp.`,
            path: [
                "phase_transition_records",
                status.phase,
            ],
        });
    }
});

const DeploymentDocumentSchema = z.strictObject({
    _id: z.string(),
    metadata: DeploymentMetadataSchema,
    spec: DeploymentSpecSchema,
    status: DeploymentStatusSchema,
});

type DeploymentDocument = z.infer<typeof DeploymentDocumentSchema>;

type DeploymentMetadata = z.infer<typeof DeploymentMetadataSchema>;

type DeploymentSpec = z.infer<typeof DeploymentSpecSchema>;

type DeploymentSpecPatch = z.infer<typeof DeploymentSpecPatchSchema>;

type DeploymentStatus = z.infer<typeof DeploymentStatusSchema>;

type PendingDeploymentUpdate = z.infer<typeof PendingDeploymentUpdateSchema>;

export {
    DEPLOYMENT_PHASES,
    type DeploymentDocument,
    DeploymentDocumentSchema,
    type DeploymentMetadata,
    DeploymentMetadataSchema,
    type DeploymentPhase,
    DeploymentPhaseSchema,
    DEPLOYMENTS_COLLECTION,
    type DeploymentSpec,
    type DeploymentSpecPatch,
    DeploymentSpecPatchSchema,
    DeploymentSpecSchema,
    type DeploymentStatus,
    DeploymentStatusSchema,
    type InProgressDeploymentPhase,
    InProgressDeploymentPhaseSchema,
    type PendingDeploymentUpdate,
    PendingDeploymentUpdateSchema,
    type RequestedDeploymentPhase,
    RequestedDeploymentPhaseSchema,
    type RequestResultDeploymentPhase,
    RequestResultDeploymentPhaseSchema,
    WorkerCountSchema,
};
