import {
    describe,
    expect,
    it,
} from "vitest";

import {
    DeploymentDocumentSchema,
    type DeploymentSpecPatch,
    type PendingDeploymentUpdate,
    type RequestedDeploymentPhase,
} from "../../../src/metadata-db-schemas/index.js";


/**
 * Creates a valid deployment specification.
 *
 * @return A deployment specification.
 */
const createDeploymentSpec = () => ({
    cloud_provider: "aws",
    cluster_id: "default",
    compression_workers: 4,
    deployment_name: "valid-deployment",
    helm_chart_version: "1.2.3",
    region: "ca-central-1",
    search_workers: 8,
});

/**
 * Creates a deployment specification patch for a `config` request.
 *
 * @param specPatch The requested deployment specification patch.
 * @return A deployment specification patch.
 */
const createSpecPatch = (
    specPatch: DeploymentSpecPatch = {compression_workers: 8},
) => specPatch;

/**
 * Creates a pending update record for a `config` request.
 *
 * @param specPatch The deployment specification patch to apply.
 * @return A pending update record.
 */
const createPendingUpdate = (
    specPatch: DeploymentSpecPatch = createSpecPatch(),
) => ({
    requested_by: "requester-a",
    spec_patch: specPatch,
});

/**
 * Creates valid deployment metadata.
 *
 * @return Metadata for a deployment document.
 */
const createDeploymentMetadata = () => ({
    created_at: new Date("2026-08-25T11:00:00.000Z"),
    email: "owner@example.com",
    org_id: null,
    owner_id: "owner-a",
});

/**
 * Creates status fields available after deployment creation.
 *
 * @return Deployment status fields after creation.
 */
const createPostCreationStatusFields = () => ({
    archive_bucket: "deployment-archive",
    error: "previous deployment error",
    last_active_at: new Date("2026-08-25T11:30:00.000Z"),
    public_url: "http://deployment.example.com",
    s3_access_role_arn: "arn:aws:iam::123456789012:role/deployment-access",
});

/**
 * Creates a deployment document with the specified phase.
 *
 * @param phase The requested phase to record in the deployment status.
 * @param pendingUpdate A valid pending update record, only required for `config` requests.
 * @return A deployment document.
 */
const createDeploymentDocument = (
    phase: RequestedDeploymentPhase,
    pendingUpdate?: PendingDeploymentUpdate,
) => ({
    _id: "deployment-id",
    metadata: createDeploymentMetadata(),
    spec: createDeploymentSpec(),
    status: {
        ...(
            "CREATE_REQUESTED" === phase ?
                {} :
                createPostCreationStatusFields()
        ),
        phase: phase,
        phase_transition_records: {
            [phase]: new Date("2026-08-25T12:00:00.000Z"),
        },
        ...(
            pendingUpdate ?
                {pending_update: pendingUpdate} :
                {}
        ),
    },
});

const INVALID_CREATE_REQUESTS = [
    {
        description: "a missing specification",
        createRequest: () => {
            const deployment = createDeploymentDocument("CREATE_REQUESTED");
            Reflect.deleteProperty(deployment, "spec");

            return deployment;
        },
    },
    {
        description: "an empty specification",
        createRequest: () => ({
            ...createDeploymentDocument("CREATE_REQUESTED"),
            spec: {},
        }),
    },
    {
        description: "an invalid specification",
        createRequest: () => ({
            ...createDeploymentDocument("CREATE_REQUESTED"),
            spec: {
                ...createDeploymentSpec(),
                compression_workers: 0,
            },
        }),
    },
    {
        description: "a specification missing compression_workers",
        createRequest: () => {
            const deployment = createDeploymentDocument("CREATE_REQUESTED");
            Reflect.deleteProperty(deployment.spec, "compression_workers");

            return deployment;
        },
    },
    {
        description: "an unsupported specification field",
        createRequest: () => ({
            ...createDeploymentDocument("CREATE_REQUESTED"),
            spec: {
                ...createDeploymentSpec(),
                unsupported_field: true,
            },
        }),
    },
    {
        description: "a pending update present",
        createRequest: () => createDeploymentDocument(
            "CREATE_REQUESTED",
            createPendingUpdate(),
        ),
    },
] as const;

const DELETE_SUSPEND_RESUME_REQUESTS = [
    {
        action: "delete",
        requestedPhase: "DELETE_REQUESTED",
    },
    {
        action: "suspend",
        requestedPhase: "SUSPEND_REQUESTED",
    },
    {
        action: "resume",
        requestedPhase: "RESUME_REQUESTED",
    },
] as const satisfies ReadonlyArray<Readonly<{
    action: string;
    requestedPhase: RequestedDeploymentPhase;
}>>;

const VALID_SPEC_PATCHES = [
    {compression_workers: 8},
    {deployment_name: "updated-deployment"},
    {helm_chart_version: "1.2.4"},
    {search_workers: 12},
    {
        compression_workers: 8,
        deployment_name: "updated-deployment",
        helm_chart_version: "1.2.4",
        search_workers: 12,
    },
] as const satisfies ReadonlyArray<DeploymentSpecPatch>;

const INVALID_SPEC_PATCHES = [
    {
        description: "an undefined patch field alongside a valid field",
        specPatch: {
            compression_workers: 8,
            // eslint-disable-next-line no-undefined -- Explicit undefined is the input under test.
            search_workers: undefined,
        },
    },
    {
        description: "an unsupported patch field",
        specPatch: {region: "us-east-1"},
    },
    {
        description: "an empty patch",
        specPatch: {},
    },
    {
        description: "zero compression workers",
        specPatch: {compression_workers: 0},
    },
] as const;

describe("create request", () => {
    it("accepts a valid create request document", () => {
        expect(DeploymentDocumentSchema.safeParse(
            createDeploymentDocument("CREATE_REQUESTED"),
        ).success).toBe(true);
    });

    it.each(INVALID_CREATE_REQUESTS)(
        "rejects a create request with $description",
        ({createRequest}) => {
            expect(DeploymentDocumentSchema.safeParse(createRequest()).success).toBe(false);
        },
    );
});

describe("delete, suspend, and resume requests", () => {
    it.each(DELETE_SUSPEND_RESUME_REQUESTS)(
        "accepts a valid $action request document",
        ({requestedPhase}) => {
            expect(DeploymentDocumentSchema.safeParse(
                createDeploymentDocument(requestedPhase),
            ).success).toBe(true);
        },
    );

    it.each(DELETE_SUSPEND_RESUME_REQUESTS)(
        "rejects a $action request containing a pending update",
        ({requestedPhase}) => {
            expect(DeploymentDocumentSchema.safeParse(
                createDeploymentDocument(
                    requestedPhase,
                    createPendingUpdate(),
                ),
            ).success).toBe(false);
        },
    );
});

describe("config request", () => {
    it.each(VALID_SPEC_PATCHES)("accepts a config request patch %j", (specPatch) => {
        expect(DeploymentDocumentSchema.safeParse(
            createDeploymentDocument(
                "CONFIG_REQUESTED",
                createPendingUpdate(createSpecPatch(specPatch)),
            ),
        ).success).toBe(true);
    });

    it.each(INVALID_SPEC_PATCHES)(
        "rejects a config request with $description",
        ({specPatch}) => {
            const deployment = createDeploymentDocument("CONFIG_REQUESTED");

            expect(DeploymentDocumentSchema.safeParse({
                ...deployment,
                status: {
                    ...deployment.status,
                    pending_update: {
                        ...createPendingUpdate(),
                        spec_patch: specPatch,
                    },
                },
            }).success).toBe(false);
        },
    );

    it("rejects a config request without a pending update", () => {
        expect(DeploymentDocumentSchema.safeParse(
            createDeploymentDocument("CONFIG_REQUESTED"),
        ).success).toBe(false);
    });
});
