import {Hono} from "hono";
import type {Collection} from "mongodb";
import {MongoMemoryServer} from "mongodb-memory-server";
import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    expect,
    it,
    vi,
} from "vitest";

import type {ClusterDatabaseManager} from "../../src/cluster-databases.js";
import {DeploymentResponseSchema} from "../../src/contracts/deployment.js";
import {createErrorEnvelope} from "../../src/contracts/error.js";
import type {DeploymentOrchestrator} from "../../src/deployment-orchestrator/index.js";
import type {ServerEnv} from "../../src/environment.js";
import {
    HTTP_STATUS_ACCEPTED,
    HTTP_STATUS_CONFLICT,
    HTTP_STATUS_NOT_FOUND,
} from "../../src/http-status.js";
import {MetadataDb} from "../../src/metadata-db.js";
import {
    type DeploymentDocument,
    DEPLOYMENTS_COLLECTION,
} from "../../src/metadata-db-schemas/deployment.js";
import {createDeploymentRoutes} from "../../src/routes/deployments.js";


const INTEGRATION_TIMEOUT_MS = 300_000;
const OWNER_ID = "owner-a";
const OTHER_OWNER_ID = "owner-b";
const CREATED_AT = new Date("2026-09-28T12:00:00.000Z");

let deploymentCollection: Collection<DeploymentDocument>;
let memoryServer: MongoMemoryServer;
let metadataDb: MetadataDb;

const schedule = vi.fn<(deploymentId: string) => Promise<void>>();
const execute = vi.fn<(
    sql: string,
    values: readonly string[],
) => Promise<unknown>>();
const getPool = vi.fn(() => Promise.resolve({execute: execute}));

/**
 * Builds a valid deployment in either a deletable or busy phase.
 *
 * @param id
 * @param ownerId
 * @param phase
 * @return A document suitable for route tests.
 */
const createDeployment = (
    id: string,
    ownerId: string,
    phase: "CREATING" | "RUNNING" = "RUNNING",
): DeploymentDocument => ({
    _id: id,
    metadata: {
        created_at: CREATED_AT,
        email: `${ownerId}@example.com`,
        org_id: null,
        owner_id: ownerId,
    },
    spec: {
        cloud_provider: "aws",
        clp_image_tag: "0.5.0",
        cluster_id: "default",
        deployment_name: `deployment-${id}`,
        helm_chart_version: "0.4.1",
        num_compression_workers: 4,
        num_search_workers: 4,
        region: "ca-central-1",
    },
    status: {
        phase: phase,
        phase_transition_records: {[phase]: CREATED_AT},
    },
});

/**
 * Creates deployment routes with a trusted test identity.
 *
 * @param userId
 * @param isAdmin
 * @return The Hono application.
 */
const createTestApp = (userId = OWNER_ID, isAdmin = false) => {
    const routes = createDeploymentRoutes({
        clusterDatabaseManager: {getPool} as unknown as ClusterDatabaseManager,
        database: metadataDb.getDatabase(),
        deploymentOrchestrator: {schedule} as unknown as DeploymentOrchestrator,
    });

    return new Hono<ServerEnv>()
        .use("*", async (context, next) => {
            context.set("email", `${userId}@example.com`);
            context.set("isAdmin", isAdmin);
            context.set("userId", userId);
            await next();
        })
        .route("/api/v1/deployments", routes);
};

beforeAll(async () => {
    memoryServer = await MongoMemoryServer.create({
        instance: {launchTimeout: INTEGRATION_TIMEOUT_MS},
    });
    metadataDb = new MetadataDb(memoryServer.getUri("deployment-routes"));
    await metadataDb.connect();
    deploymentCollection = metadataDb.getDatabase().collection<DeploymentDocument>(
        DEPLOYMENTS_COLLECTION,
    );
}, INTEGRATION_TIMEOUT_MS);

beforeEach(() => {
    vi.clearAllMocks();
    execute.mockResolvedValue([]);
    schedule.mockResolvedValue();
});

afterEach(async () => {
    await deploymentCollection.deleteMany({});
});

afterAll(async () => {
    await metadataDb.close();
    await memoryServer.stop();
});

it("requests deletion of an owned deployment", async () => {
    await deploymentCollection.insertOne(createDeployment("owned", OWNER_ID));
    execute.mockImplementation(async () => {
        expect((await deploymentCollection.findOne({_id: "owned"}))?.status.phase)
            .toBe("RUNNING");

        return [];
    });

    const response = await createTestApp().request(
        "/api/v1/deployments/owned",
        {method: "DELETE"},
    );
    const body = DeploymentResponseSchema.parse(await response.json());

    expect(response.status).toBe(HTTP_STATUS_ACCEPTED);
    expect(body.status.phase).toBe("DELETE_REQUESTED");
    expect(body.status.phase_transition_records.DELETE_REQUESTED)
        .toEqual(expect.any(String));
    expect(getPool).toHaveBeenCalledExactlyOnceWith("ca-central-1", "default");
    expect(execute).toHaveBeenNthCalledWith(
        1,
        "UPDATE auth.api_tokens SET revoked_at = UTC_TIMESTAMP(6)" +
            " WHERE deployment_id = ? AND revoked_at IS NULL",
        ["owned"],
    );
    expect(execute).toHaveBeenNthCalledWith(
        2,
        "DELETE FROM auth.user_deployment_access WHERE deployment_id = ?",
        ["owned"],
    );
    expect(schedule).toHaveBeenCalledExactlyOnceWith("owned");
    await expect(deploymentCollection.findOne({_id: "owned"}))
        .resolves.toMatchObject({status: {phase: "DELETE_REQUESTED"}});
    expect(body.status.deletion_requested_at)
        .toBe(body.status.phase_transition_records.DELETE_REQUESTED);
});

it("keeps the first deletion request's time when a failed deletion is retried", async () => {
    const firstRequestedAt = new Date("2026-09-29T08:00:00.000Z");
    const deployment = createDeployment("retried", OWNER_ID);
    await deploymentCollection.insertOne({
        ...deployment,
        status: {
            deletion_requested_at: firstRequestedAt,
            phase: "DELETE_FAILED",
            phase_transition_records: {
                DELETE_FAILED: new Date("2026-09-29T08:20:00.000Z"),
                DELETE_REQUESTED: firstRequestedAt,
                DELETING: new Date("2026-09-29T08:00:01.000Z"),
                RUNNING: CREATED_AT,
            },
        },
    });

    const response = await createTestApp().request(
        "/api/v1/deployments/retried",
        {method: "DELETE"},
    );
    const body = DeploymentResponseSchema.parse(await response.json());

    expect(response.status).toBe(HTTP_STATUS_ACCEPTED);
    expect(body.status.deletion_requested_at).toBe(firstRequestedAt.toISOString());
    expect(Date.parse(body.status.phase_transition_records.DELETE_REQUESTED ?? ""))
        .toBeGreaterThan(firstRequestedAt.getTime());
});

it("does not reveal a deployment owned by another user", async () => {
    await deploymentCollection.insertOne(createDeployment("foreign", OTHER_OWNER_ID));

    const response = await createTestApp().request(
        "/api/v1/deployments/foreign",
        {method: "DELETE"},
    );

    expect(response.status).toBe(HTTP_STATUS_NOT_FOUND);
    expect(await response.json()).toEqual(createErrorEnvelope("not_found"));
    expect(getPool).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
});

it("allows an administrator to delete another user's deployment", async () => {
    await deploymentCollection.insertOne(createDeployment("admin-delete", OTHER_OWNER_ID));

    const response = await createTestApp(OWNER_ID, true).request(
        "/api/v1/deployments/admin-delete",
        {method: "DELETE"},
    );

    expect(response.status).toBe(HTTP_STATUS_ACCEPTED);
    expect(schedule).toHaveBeenCalledExactlyOnceWith("admin-delete");
});

it("rejects deletion while another lifecycle operation is running", async () => {
    await deploymentCollection.insertOne(createDeployment("busy", OWNER_ID, "CREATING"));

    const response = await createTestApp().request(
        "/api/v1/deployments/busy",
        {method: "DELETE"},
    );

    expect(response.status).toBe(HTTP_STATUS_CONFLICT);
    expect(await response.json()).toEqual(createErrorEnvelope("CONFLICT"));
    expect(getPool).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
});
