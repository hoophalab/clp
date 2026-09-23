import type {
    Collection,
    Db,
} from "mongodb";
import {MongoMemoryServer} from "mongodb-memory-server-core";
import {
    afterAll,
    beforeAll,
    beforeEach,
    expect,
    it,
    vi,
} from "vitest";

import type {DeploymentAction} from "../../src/deployment-orchestrator/deployment-request.js";
import {
    DeploymentOrchestrator,
    type DeploymentRequest,
    DeploymentRequestExecutor,
} from "../../src/deployment-orchestrator/index.js";
import {MetadataDb} from "../../src/metadata-db.js";
import {
    type DeploymentDocument,
    DeploymentDocumentSchema,
    type DeploymentPhase,
    type InProgressDeploymentPhase,
    type RequestedDeploymentPhase,
} from "../../src/metadata-db-schemas/index.js";


const DEPLOYMENTS_COLLECTION_NAME = "deployments";
const METADATA_DB_SETUP_TIMEOUT_MILLISECS = 60_000;
const OWNER_ID = "owner-a";
const REQUESTED_AT = new Date("2026-08-25T12:00:00.000Z");
const DEPLOYMENT_OUTPUTS = {
    archive_bucket: "test-deployment-archive",
    public_url: "https://test-deployment.cloud.yscope.com",
    s3_access_role_arn: "arn:aws:iam::123456789012:role/test-deployment-s3-access",
};
const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const REQUEST_PHASE_CASES = [
    {
        action: "create",
        completedPhase: "RUNNING",
        inProgressPhase: "CREATING",
        requestedPhase: "CREATE_REQUESTED",
    },
    {
        action: "delete",
        completedPhase: "DELETED",
        inProgressPhase: "DELETING",
        requestedPhase: "DELETE_REQUESTED",
    },
] as const satisfies ReadonlyArray<Readonly<{
    action: DeploymentAction;
    completedPhase: DeploymentPhase;
    inProgressPhase: InProgressDeploymentPhase;
    requestedPhase: RequestedDeploymentPhase;
}>>;

/**
 * Creates a deployment document in the given phase.
 *
 * @param deploymentId
 * @param phase The deployment phase for the document.
 * @return A deployment document in the given phase.
 */
const createDeploymentDocument = (
    deploymentId: string,
    phase: DeploymentPhase,
): DeploymentDocument => ({
    _id: deploymentId,
    metadata: {
        created_at: new Date("2026-08-25T11:00:00.000Z"),
        email: "owner@example.com",
        org_id: "organization-a",
        owner_id: OWNER_ID,
    },
    spec: {
        cloud_provider: "aws",
        clp_image_tag: "1.2.3",
        cluster_id: "default",
        compression_workers: 4,
        deployment_name: "test-deployment",
        helm_chart_version: "1.2.3",
        region: "ca-central-1",
        search_workers: 4,
    },
    status: {
        phase_transition_records: {
            [phase]: REQUESTED_AT,
        },
        ...(
            "CONFIG_REQUESTED" === phase ||
            "CONFIGURING" === phase ||
            "CONFIG_FAILED" === phase ?
                {
                    pending_update: {
                        requested_by: "requester-a",
                        spec_patch: {compression_workers: 8},
                    },
                    phase: phase,
                } :
                {phase: phase}
        ),
    },
});

let database: Db;
let deploymentCollection: Collection<DeploymentDocument>;
const executedRequests: DeploymentRequest[] = [];
let metadataDb: MetadataDb;
let mongoServer: MongoMemoryServer;
let orchestrator: DeploymentOrchestrator;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    metadataDb = new MetadataDb(
        mongoServer.getUri("deployment-orchestrator-integration"),
    );
    await metadataDb.connect();

    database = metadataDb.getDatabase();
    deploymentCollection = database.collection<DeploymentDocument>(
        DEPLOYMENTS_COLLECTION_NAME,
    );

    const requestExecutor = new DeploymentRequestExecutor({
        clusterSecret: "test-secret",
        database: database,
    });

    vi.spyOn(requestExecutor, "execute").mockImplementation((request) => {
        executedRequests.push(request);

        return Promise.resolve(
            "create" === request.action ?
                DEPLOYMENT_OUTPUTS :
                null,
        );
    });

    orchestrator = new DeploymentOrchestrator(database, requestExecutor);

    orchestrator.runProcessor().catch((error: unknown) => {
        throw error;
    });
}, METADATA_DB_SETUP_TIMEOUT_MILLISECS);

beforeEach(async () => {
    await deploymentCollection.deleteMany({});
    executedRequests.length = 0;
});

afterAll(async () => {
    await metadataDb.close();
    await mongoServer.stop();
});

it.each(REQUEST_PHASE_CASES)(
    "claims and processes a $action request",
    async ({
        action,
        completedPhase,
        inProgressPhase,
        requestedPhase,
    }) => {
        const deploymentId = `deployment-${action}`;
        const deployment = createDeploymentDocument(
            deploymentId,
            requestedPhase,
        );

        await deploymentCollection.insertOne(deployment);
        await orchestrator.schedule(deploymentId);

        const completedDeployment = await vi.waitFor(async () => {
            const stored = DeploymentDocumentSchema.parse(
                await deploymentCollection.findOne({_id: deploymentId}),
            );

            expect(stored.status.phase).toBe(completedPhase);

            return stored;
        });

        const transitions = completedDeployment.status.phase_transition_records;
        expect(transitions[requestedPhase]).toEqual(REQUESTED_AT);
        expect(transitions[inProgressPhase]).toBeInstanceOf(Date);
        expect(transitions[completedPhase]).toBeInstanceOf(Date);
        expect(completedDeployment.status.error).toBeUndefined();
        if ("create" === action) {
            expect(completedDeployment.status).toMatchObject(DEPLOYMENT_OUTPUTS);
        }
        expect(executedRequests).toHaveLength(1);
        const [executedRequest] = executedRequests;

        expect(executedRequest.requestId).toMatch(UUID_PATTERN);
        expect(executedRequest).toEqual({
            action: action,
            deploymentId: deploymentId,
            requestId: executedRequest.requestId,
            requestedAt: REQUESTED_AT,
            tenantId: OWNER_ID,
        });
    },
);

it("does not allow concurrent requests on the same deployment", async () => {
    const deploymentId = "deployment-concurrent";
    await deploymentCollection.insertOne(createDeploymentDocument(
        deploymentId,
        "CREATE_REQUESTED",
    ));
    const scheduleResults = await Promise.allSettled([
        orchestrator.schedule(deploymentId),
        orchestrator.schedule(deploymentId),
    ]);

    expect(scheduleResults.filter(({status}) => "fulfilled" === status))
        .toHaveLength(1);
    expect(scheduleResults.filter(({status}) => "rejected" === status))
        .toHaveLength(1);
    await vi.waitFor(async () => {
        expect((await deploymentCollection.findOne({_id: deploymentId}))?.status.phase)
            .toBe("RUNNING");
        expect(executedRequests).toHaveLength(1);
    });
});

it("rejects starting the request processor when it is already running", async () => {
    await expect(Promise.resolve().then(() => orchestrator.runProcessor()))
        .rejects.toThrow();
});

it("rejects scheduling a deployment with a missing deployment document", async () => {
    await expect(orchestrator.schedule("missing-deployment"))
        .rejects.toThrow();
});

it("rejects scheduling a deployment with an invalid specification", async () => {
    const deploymentId = "deployment-invalid-spec";
    const deployment = createDeploymentDocument(
        deploymentId,
        "CREATE_REQUESTED",
    );

    await deploymentCollection.insertOne(deployment);
    await deploymentCollection.updateOne(
        {_id: deploymentId},
        {$set: {"spec.compression_workers": "invalid"}},
    );

    await expect(orchestrator.schedule(deploymentId)).rejects.toThrow();
});

it("rejects scheduling a deployment not in a `_REQUESTED` phase", async () => {
    const deploymentId = "deployment-running";
    await deploymentCollection.insertOne(createDeploymentDocument(
        deploymentId,
        "RUNNING",
    ));

    await expect(orchestrator.schedule(deploymentId)).rejects.toThrow();
});

it("rejects an invalid 'in-progress' transition before updating the document", async () => {
    const deploymentId = "deployment-invalid-transition";
    const deployment = createDeploymentDocument(deploymentId, "CREATE_REQUESTED");
    await deploymentCollection.insertOne(deployment);

    vi.useFakeTimers({toFake: ["Date"]});
    try {
        vi.setSystemTime(new Date(REQUESTED_AT.getTime() - 1));

        await expect(orchestrator.schedule(deploymentId)).rejects.toThrow(
            `Deployment "${deploymentId}" failed validation.`,
        );
        expect(await deploymentCollection.findOne({_id: deploymentId})).toEqual(deployment);
    } finally {
        vi.useRealTimers();
    }
});
