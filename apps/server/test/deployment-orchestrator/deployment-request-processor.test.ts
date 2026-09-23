/* eslint-disable max-lines -- Keep processor tests with their shared MongoDB fixture. */
import {setTimeout as sleep} from "node:timers/promises";

import {
    Collection,
    type Db,
} from "mongodb";
import {MongoMemoryReplSet} from "mongodb-memory-server-core";
import {
    afterAll,
    afterEach,
    beforeAll,
    expect,
    it,
    vi,
} from "vitest";

import {
    type DeploymentId,
    type DeploymentRequest,
    DeploymentRequestExecutor,
    DeploymentRequestProcessor,
    DeploymentRequestQueues,
    REQUEST_PROCESSING_CONCURRENCY_MAX,
    REQUEST_PROCESSING_CONCURRENCY_MIN,
    type RequestId,
} from "../../src/deployment-orchestrator/index.js";
import {MetadataDb} from "../../src/metadata-db.js";
import {type DeploymentDocument} from "../../src/metadata-db-schemas/deployment.js";


vi.mock(import("node:timers/promises"), async (importOriginal) => {
    const actual = await importOriginal();

    return {...actual, setTimeout: vi.fn(actual.setTimeout) as typeof actual.setTimeout};
});


const DEPLOYMENT_OUTPUTS = {
    archive_bucket: "deployment-a-archive",
    public_url: "https://deployment-a.cloud.yscope.com",
    s3_access_role_arn: "arn:aws:iam::123456789012:role/deployment-a-s3-access",
};
const EXISTING_OUTPUTS = {
    archive_bucket: "previous-archive",
    public_url: "https://previous.cloud.yscope.com",
    s3_access_role_arn: "arn:aws:iam::123456789012:role/previous-s3-access",
};
const INTEGRATION_TIMEOUT_MS = 60_000;
const COMPLETED_AT = new Date("2026-08-27T00:01:00.000Z");
const SINGLE_WORKER_CONCURRENCY = 1;
const TWO_WORKER_CONCURRENCY = 2;
const NON_INTEGER_CONCURRENCY_VALUE = 1.5;
const INVALID_CONCURRENCY_VALUES = [
    NON_INTEGER_CONCURRENCY_VALUE,
    REQUEST_PROCESSING_CONCURRENCY_MIN - 1,
    REQUEST_PROCESSING_CONCURRENCY_MAX + 1,
];

let memoryServer: MongoMemoryReplSet;
let metadataDb: MetadataDb;
let database: Db;
let deployments: Collection<DeploymentDocument>;

beforeAll(async () => {
    memoryServer = await MongoMemoryReplSet.create({replSet: {count: 1}});
    metadataDb = new MetadataDb(memoryServer.getUri("request-processor-tests"));
    await metadataDb.connect();
    database = metadataDb.getDatabase();
    deployments = database.collection<DeploymentDocument>("deployments");
}, INTEGRATION_TIMEOUT_MS);

afterEach(async () => {
    vi.restoreAllMocks();
    vi.mocked(sleep).mockReset();
    vi.useRealTimers();
    await deployments.deleteMany({});
});

afterAll(async () => {
    await metadataDb.close();
    await memoryServer.stop();
});

/**
 * Creates a deployment request.
 *
 * @param requestId
 * @param deploymentId
 * @return The created request.
 */
const createDeploymentRequest = (
    requestId: RequestId,
    deploymentId: DeploymentId,
): DeploymentRequest => ({
    action: "create",
    deploymentId: deploymentId,
    requestId: requestId,
    requestedAt: new Date("2026-08-27T00:00:00.000Z"),
    tenantId: "tenant-a",
});

/**
 * Creates the claimed document that the processor will finish.
 *
 * @param request The request being processed.
 * @return An in-progress deployment document.
 */
const createDeploymentDocument = (request: DeploymentRequest): DeploymentDocument => {
    const phase = "delete" === request.action ?
        "DELETING" :
        "CREATING";

    return {
        _id: request.deploymentId,
        metadata: {
            created_at: request.requestedAt,
            email: "owner@example.com",
            org_id: null,
            owner_id: "owner-a",
        },
        spec: {
            cloud_provider: "aws",
            clp_image_tag: "0.5.0-main-test",
            cluster_id: "yscope1",
            compression_workers: 4,
            deployment_name: request.deploymentId,
            helm_chart_version: "0.4.1-dev.11",
            region: "ca-central-1",
            search_workers: 4,
        },
        status: {
            phase: phase,
            phase_transition_records: {[phase]: request.requestedAt},
        },
    };
};

it("dispatches enqueued requests to the request executor in order", async () => {
    const firstRequest = createDeploymentRequest(
        "request-a",
        "deployment-a",
    );
    const secondRequest = createDeploymentRequest(
        "request-b",
        "deployment-b",
    );
    const requestQueues = new DeploymentRequestQueues();
    const requestExecutor = new DeploymentRequestExecutor({
        clusterSecret: "test-secret",
        database: database,
    });

    const execute = vi.spyOn(requestExecutor, "execute").mockResolvedValue(DEPLOYMENT_OUTPUTS);
    const requestProcessor = new DeploymentRequestProcessor(
        requestQueues,
        requestExecutor,
        database,
    );

    await deployments.insertMany([
        createDeploymentDocument(firstRequest),
        createDeploymentDocument(secondRequest),
    ]);
    requestQueues.enqueue(firstRequest);
    requestQueues.enqueue(secondRequest);

    expect(requestProcessor.run(SINGLE_WORKER_CONCURRENCY)).toBeInstanceOf(Promise);

    await vi.waitFor(async () => {
        expect(execute).toHaveBeenNthCalledWith(1, firstRequest);
        expect(execute).toHaveBeenNthCalledWith(2, secondRequest);
        expect(await deployments.countDocuments({"status.phase": "RUNNING"})).toBe(2);
    });
});

it("waits for a request when the queues are empty", async () => {
    const request = createDeploymentRequest(
        "request-a",
        "deployment-a",
    );
    const requestQueues = new DeploymentRequestQueues();
    const requestExecutor = new DeploymentRequestExecutor({
        clusterSecret: "test-secret",
        database: database,
    });

    const execute = vi.spyOn(requestExecutor, "execute").mockResolvedValue(DEPLOYMENT_OUTPUTS);
    const requestProcessor = new DeploymentRequestProcessor(
        requestQueues,
        requestExecutor,
        database,
    );

    expect(requestProcessor.run(SINGLE_WORKER_CONCURRENCY)).toBeInstanceOf(Promise);

    await Promise.resolve();
    expect(execute).not.toHaveBeenCalled();

    await deployments.insertOne(createDeploymentDocument(request));
    requestQueues.enqueue(request);
    await vi.waitFor(async () => {
        expect(execute).toHaveBeenCalledExactlyOnceWith(request);
        expect((await deployments.findOne({_id: request.deploymentId}))?.status.phase)
            .toBe("RUNNING");
    });
});

it("continues processing after a request executor rejection", async () => {
    const firstRequest = createDeploymentRequest(
        "request-a",
        "deployment-a",
    );
    const secondRequest = createDeploymentRequest(
        "request-b",
        "deployment-b",
    );
    const executionError = new Error("executor failed");
    const requestQueues = new DeploymentRequestQueues();
    const requestExecutor = new DeploymentRequestExecutor({
        clusterSecret: "test-secret",
        database: database,
    });

    const execute = vi.spyOn(requestExecutor, "execute")
        .mockRejectedValueOnce(executionError)
        .mockResolvedValueOnce(DEPLOYMENT_OUTPUTS);
    const consoleError = vi.spyOn(console, "error")
        .mockImplementation(() => {
            // Suppress the expected worker-side test log.
        });
    const requestProcessor = new DeploymentRequestProcessor(
        requestQueues,
        requestExecutor,
        database,
    );

    await deployments.insertMany([
        createDeploymentDocument(firstRequest),
        createDeploymentDocument(secondRequest),
    ]);
    requestQueues.enqueue(firstRequest);
    requestQueues.enqueue(secondRequest);
    expect(requestProcessor.run(SINGLE_WORKER_CONCURRENCY)).toBeInstanceOf(Promise);

    await vi.waitFor(async () => {
        expect(execute).toHaveBeenNthCalledWith(2, secondRequest);
        expect((await deployments.findOne({_id: secondRequest.deploymentId}))?.status.phase)
            .toBe("RUNNING");
    });
    expect((await deployments.findOne({_id: firstRequest.deploymentId}))?.status.error)
        .toBe(executionError.message);
    expect(consoleError).toHaveBeenCalledExactlyOnceWith(
        "Deployment request executor failed.",
        executionError,
    );
});

it("never exceeds the configured concurrency", async () => {
    const firstRequest = createDeploymentRequest(
        "request-a",
        "deployment-a",
    );
    const secondRequest = createDeploymentRequest(
        "request-b",
        "deployment-b",
    );
    const thirdRequest = createDeploymentRequest(
        "request-c",
        "deployment-c",
    );
    const requestQueues = new DeploymentRequestQueues();
    const requestExecution = Promise.withResolvers<boolean>();
    const requestExecutor = new DeploymentRequestExecutor({
        clusterSecret: "test-secret",
        database: database,
    });

    const execute = vi.spyOn(requestExecutor, "execute").mockImplementation(async () => {
        await requestExecution.promise;

        return DEPLOYMENT_OUTPUTS;
    });
    const requestProcessor = new DeploymentRequestProcessor(
        requestQueues,
        requestExecutor,
        database,
    );

    await deployments.insertMany([
        createDeploymentDocument(firstRequest),
        createDeploymentDocument(secondRequest),
    ]);
    requestQueues.enqueue(firstRequest);
    requestQueues.enqueue(secondRequest);
    await deployments.insertOne(createDeploymentDocument(thirdRequest));
    requestQueues.enqueue(thirdRequest);

    expect(requestProcessor.run(TWO_WORKER_CONCURRENCY)).toBeInstanceOf(Promise);

    await vi.waitFor(() => {
        expect(execute).toHaveBeenCalledTimes(TWO_WORKER_CONCURRENCY);
    });

    // Give the loop a chance to incorrectly dispatch the third request while two requests are
    // executing.
    await Promise.resolve();
    expect(execute).toHaveBeenCalledTimes(TWO_WORKER_CONCURRENCY);

    requestExecution.resolve(true);

    await vi.waitFor(async () => {
        expect(execute).toHaveBeenCalledWith(thirdRequest);
        expect(await deployments.countDocuments({"status.phase": "RUNNING"})).toBe(3);
    });
});

it.each(INVALID_CONCURRENCY_VALUES)(
    "rejects invalid concurrency %s",
    (concurrency) => {
        const requestProcessor = new DeploymentRequestProcessor(
            new DeploymentRequestQueues(),
            new DeploymentRequestExecutor({clusterSecret: "test-secret", database: database}),
            database,
        );

        expect(() => requestProcessor.run(concurrency)).toThrow(RangeError);
    },
);

it("does not let a blocked worker prevent other workers from completing", async () => {
    const blockedRequest = createDeploymentRequest(
        "request-a",
        "deployment-a",
    );
    const secondRequest = createDeploymentRequest(
        "request-b",
        "deployment-b",
    );
    const thirdRequest = createDeploymentRequest(
        "request-c",
        "deployment-c",
    );
    const blockedRequestExecution = Promise.withResolvers<boolean>();
    const completedRequestIds: RequestId[] = [];
    const requestExecutor = new DeploymentRequestExecutor({
        clusterSecret: "test-secret",
        database: database,
    });

    vi.spyOn(requestExecutor, "execute").mockImplementation(async (request) => {
        if (request === blockedRequest) {
            await blockedRequestExecution.promise;
        }

        completedRequestIds.push(request.requestId);

        return DEPLOYMENT_OUTPUTS;
    });
    const requestQueues = new DeploymentRequestQueues();
    const requestProcessor = new DeploymentRequestProcessor(
        requestQueues,
        requestExecutor,
        database,
    );

    await deployments.insertMany([
        createDeploymentDocument(blockedRequest),
        createDeploymentDocument(secondRequest),
        createDeploymentDocument(thirdRequest),
    ]);
    requestQueues.enqueue(blockedRequest);
    requestQueues.enqueue(secondRequest);
    requestQueues.enqueue(thirdRequest);

    expect(requestProcessor.run(TWO_WORKER_CONCURRENCY)).toBeInstanceOf(Promise);

    await vi.waitFor(() => {
        expect(completedRequestIds).toEqual([
            secondRequest.requestId,
            thirdRequest.requestId,
        ]);
    });

    blockedRequestExecution.resolve(true);
    await vi.waitFor(async () => {
        expect(completedRequestIds).toContain(blockedRequest.requestId);
        expect(await deployments.countDocuments({"status.phase": "RUNNING"})).toBe(3);
    });
});

it.each([
    {action: "create", phase: "RUNNING"},
    {action: "delete", phase: "DELETED"},
] as const)("records $phase after $action succeeds", async ({action, phase}) => {
    const request = {...createDeploymentRequest("request-a", "deployment-a"), action: action};
    const document = createDeploymentDocument(request);
    document.status = {
        ...document.status,
        ...EXISTING_OUTPUTS,
        deploymentNotFunctional: true,
        error: "An earlier attempt failed.",
        last_active_at: request.requestedAt,
    };
    await deployments.insertOne(document);
    const updateOne = vi.spyOn(Collection.prototype, "updateOne");
    const requestExecutor = new DeploymentRequestExecutor({
        clusterSecret: "test-secret",
        database: database,
    });

    const execute = vi.spyOn(requestExecutor, "execute").mockImplementation(async () => {
        const stored = await deployments.findOne({_id: request.deploymentId});
        expect(stored?.status.phase).toBe(document.status.phase);
        vi.setSystemTime(COMPLETED_AT);

        return "create" === action ?
            DEPLOYMENT_OUTPUTS :
            null;
    });
    const requestQueues = new DeploymentRequestQueues();
    const processor = new DeploymentRequestProcessor(requestQueues, requestExecutor, database);

    requestQueues.enqueue(request);
    expect(processor.run(SINGLE_WORKER_CONCURRENCY)).toBeInstanceOf(Promise);

    await vi.waitFor(async () => {
        expect((await deployments.findOne({_id: request.deploymentId}))?.status.phase).toBe(phase);
    });
    expect(execute).toHaveBeenCalledExactlyOnceWith(request);
    const stored = await deployments.findOne({_id: request.deploymentId});
    expect(stored?.status.phase).toBe(phase);
    expect(stored?.status.phase_transition_records[phase]).toEqual(COMPLETED_AT);
    expect(stored?.status.error).toBeUndefined();
    expect(stored?.status.deploymentNotFunctional).toBe(true);
    expect(stored?.status).toMatchObject({
        ...("create" === action ?
            DEPLOYMENT_OUTPUTS :
            EXISTING_OUTPUTS),
        last_active_at: request.requestedAt,
        phase_transition_records: document.status.phase_transition_records,
    });
    expect(updateOne).toHaveBeenCalledTimes(1);
});

it.each([
    {action: "create", phase: "CREATE_FAILED"},
    {action: "delete", phase: "DELETE_FAILED"},
] as const)("records $phase after $action fails", async ({action, phase}) => {
    const request = {...createDeploymentRequest("request-a", "deployment-a"), action: action};
    const document = createDeploymentDocument(request);
    document.status = {...document.status, ...EXISTING_OUTPUTS};
    await deployments.insertOne(document);
    const executionError = new Error("CloudFormation operation failed.");
    const requestExecutor = new DeploymentRequestExecutor({
        clusterSecret: "test-secret",
        database: database,
    });

    const execute = vi.spyOn(requestExecutor, "execute").mockImplementation(() => {
        vi.setSystemTime(COMPLETED_AT);

        return Promise.reject(executionError);
    });

    vi.spyOn(console, "error").mockImplementation(vi.fn());
    const requestQueues = new DeploymentRequestQueues();
    const processor = new DeploymentRequestProcessor(requestQueues, requestExecutor, database);

    requestQueues.enqueue(request);
    expect(processor.run(SINGLE_WORKER_CONCURRENCY)).toBeInstanceOf(Promise);

    await vi.waitFor(async () => {
        expect((await deployments.findOne({_id: request.deploymentId}))?.status.phase).toBe(phase);
    });
    expect(execute).toHaveBeenCalledExactlyOnceWith(request);
    const stored = await deployments.findOne({_id: request.deploymentId});
    expect(stored?.status.phase).toBe(phase);
    expect(stored?.status.phase_transition_records[phase]).toEqual(COMPLETED_AT);
    expect(stored?.status.error).toBe(executionError.message);
    expect(stored?.status.deploymentNotFunctional).toBeUndefined();
    expect(stored?.status).toMatchObject(EXISTING_OUTPUTS);
});

it("records CREATE_FAILED when successful execution returns no deployment outputs", async () => {
    const request = createDeploymentRequest("request-a", "deployment-a");
    const document = createDeploymentDocument(request);
    document.status = {...document.status, ...EXISTING_OUTPUTS};
    await deployments.insertOne(document);
    const requestExecutor = new DeploymentRequestExecutor({
        clusterSecret: "test-secret",
        database: database,
    });

    const execute = vi.spyOn(requestExecutor, "execute").mockResolvedValue(null);
    const logError = vi.spyOn(console, "error").mockImplementation(vi.fn());
    const requestQueues = new DeploymentRequestQueues();
    const processor = new DeploymentRequestProcessor(requestQueues, requestExecutor, database);
    requestQueues.enqueue(request);

    expect(processor.run(SINGLE_WORKER_CONCURRENCY)).toBeInstanceOf(Promise);

    await vi.waitFor(async () => {
        expect((await deployments.findOne({_id: request.deploymentId}))?.status.phase)
            .toBe("CREATE_FAILED");
    });
    expect(execute).toHaveBeenCalledExactlyOnceWith(request);
    const stored = await deployments.findOne({_id: request.deploymentId});
    expect(stored?.status).toMatchObject({
        ...EXISTING_OUTPUTS,
        error: `Missing deployment outputs for ${request.deploymentId}.`,
    });
    expect(logError).toHaveBeenCalledExactlyOnceWith(
        "Deployment request executor failed.",
        new Error(`Missing deployment outputs for ${request.deploymentId}.`),
    );
});

it("skips an unsupported action and continues processing the next request", async () => {
    const request = {
        ...createDeploymentRequest("request-a", "deployment-a"),
        action: "suspend",
    } as const;
    const nextRequest = createDeploymentRequest("request-b", "deployment-b");
    await deployments.insertOne(createDeploymentDocument(nextRequest));
    const logError = vi.spyOn(console, "error").mockImplementation(vi.fn());
    const updateOne = vi.spyOn(Collection.prototype, "updateOne");
    const requestExecutor = new DeploymentRequestExecutor({
        clusterSecret: "test-secret",
        database: database,
    });

    const execute = vi.spyOn(requestExecutor, "execute").mockResolvedValue(DEPLOYMENT_OUTPUTS);
    const requestQueues = new DeploymentRequestQueues();
    const processor = new DeploymentRequestProcessor(requestQueues, requestExecutor, database);
    requestQueues.enqueue(request);
    requestQueues.enqueue(nextRequest);

    expect(processor.run(SINGLE_WORKER_CONCURRENCY)).toBeInstanceOf(Promise);

    await vi.waitFor(async () => {
        expect((await deployments.findOne({_id: nextRequest.deploymentId}))?.status.phase)
            .toBe("RUNNING");
    });
    expect(execute).toHaveBeenCalledExactlyOnceWith(nextRequest);
    expect(updateOne).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledExactlyOnceWith(
        "Deployment request processing failed.",
        new Error("Unsupported deployment action: suspend"),
    );
});

it(
    "recovers from a real MongoDB outage while saving the result without executing again",
    // eslint-disable-next-line max-statements -- Keep outage, recovery, and cleanup together.
    async () => {
        const outageServer = await MongoMemoryReplSet.create({replSet: {count: 1}});
        const uri = outageServer.getUri("request-processor-outage");
        const outageMetadataDb = new MetadataDb(
            `${uri}&heartbeatFrequencyMS=500`,
        );

        try {
            await outageMetadataDb.connect();
            const outageDatabase = outageMetadataDb.getDatabase();
            const outageDeployments = outageDatabase.collection<DeploymentDocument>("deployments");
            const request = createDeploymentRequest("request-a", "deployment-a");
            await outageDeployments.insertOne(createDeploymentDocument(request));
            const logError = vi.spyOn(console, "error").mockImplementation(vi.fn());
            const updateOne = vi.spyOn(Collection.prototype, "updateOne");
            const serverUnavailable = Promise.withResolvers<boolean>();
            outageDatabase.client.on("serverDescriptionChanged", ({newDescription}) => {
                if ("Unknown" === newDescription.type) {
                    serverUnavailable.resolve(true);
                }
            });
            const requestExecutor = new DeploymentRequestExecutor({
                clusterSecret: "test-secret",
                database: outageDatabase,
            });

            const execute = vi.spyOn(requestExecutor, "execute").mockImplementation(async () => {
                await outageServer.stop({doCleanup: false});

                // Start the write after the driver has detected the existing outage.
                await serverUnavailable.promise;

                return DEPLOYMENT_OUTPUTS;
            });
            const requestQueues = new DeploymentRequestQueues();
            const processor = new DeploymentRequestProcessor(
                requestQueues,
                requestExecutor,
                outageDatabase,
            );

            requestQueues.enqueue(request);

            expect(processor.run(SINGLE_WORKER_CONCURRENCY)).toBeInstanceOf(Promise);
            await serverUnavailable.promise;

            await vi.waitFor(() => {
                expect(updateOne).toHaveBeenCalledTimes(1);
            });
            expect(logError).not.toHaveBeenCalled();
            expect(outageServer.state).toBe("stopped");
            expect(execute).toHaveBeenCalledTimes(1);

            await outageServer.start();
            expect(outageServer.getUri("request-processor-outage")).toBe(uri);
            await vi.waitFor(async () => {
                const stored = await outageDeployments.findOne({_id: request.deploymentId});
                expect(stored?.status.phase).toBe("RUNNING");
            });
            expect(execute).toHaveBeenCalledTimes(1);
            expect(updateOne).toHaveBeenCalledTimes(1);
            expect(logError).not.toHaveBeenCalled();
        } finally {
            await outageMetadataDb.close();
            await outageServer.stop();
        }
    },
    INTEGRATION_TIMEOUT_MS
);
