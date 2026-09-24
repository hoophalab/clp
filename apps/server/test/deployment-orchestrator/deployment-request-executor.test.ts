/* eslint-disable max-lines -- Keep executor tests with their shared MongoDB fixture. */
import {once} from "node:events";
import {setTimeout as sleep} from "node:timers/promises";

import {
    Collection,
    type Db,
} from "mongodb";
import {MongoMemoryReplSet} from "mongodb-memory-server";
import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    expect,
    it,
    vi,
} from "vitest";

import type {
    CdkCommandResult,
    CdkCommandRunner,
} from "../../src/deployment-orchestrator/cdk-command-runner.js";
import type {
    DeploymentOutputs,
    GetDeploymentOutputs,
    GetStackStatus,
    WaitForStackToSettle,
} from "../../src/deployment-orchestrator/cloudformation-client.js";
import {
    type DeploymentRequest,
    DeploymentRequestExecutor,
} from "../../src/deployment-orchestrator/index.js";
import {MetadataDb} from "../../src/metadata-db.js";
import type {DeploymentDocument} from "../../src/metadata-db-schemas/deployment.js";


vi.mock(import("node:timers/promises"), async (importOriginal) => {
    const actual = await importOriginal();

    return {...actual, setTimeout: vi.fn(actual.setTimeout) as typeof actual.setTimeout};
});

const INTEGRATION_TIMEOUT_MS = 300_000;
const OUTAGE_DETECTION_TIMEOUT_MS = 10_000;
const STATUS_POLL_INTERVAL_MS = 30_000;
const MIN_THROTTLE_DELAY_MS = 1_000;
const DEPLOYMENT_ID = "deployment-a";
const DEPLOYMENT_STACK_NAME = "yscope1-Deployment-deployment-a";
const REQUEST_CHANGE_SET_ID = "arn:aws:cloudformation:ca-central-1:123456789012:" +
    "changeSet/request-request-a/id";
const REQUESTED_AT = new Date("2026-08-25T12:00:00.000Z");
const CLAIMED_AT = new Date("2026-08-25T12:05:00.000Z");
const EXECUTION_STARTED_AT = new Date("2026-08-25T12:10:00.000Z");
const LATE_EXECUTION_AT = new Date("2026-08-25T12:31:00.000Z");

const ACTIONS = [
    "create",
    "delete",
] as const;

const DEPLOYMENT_OUTPUTS: DeploymentOutputs = {
    archive_bucket: "deployment-archive-bucket",
    public_url: "https://deployment-a.yscope1.cloud.yscope.com",
    s3_access_role_arn: "arn:aws:iam::123456789012:role/deployment-s3-access",
};
const getDeploymentOutputs = vi.fn<GetDeploymentOutputs>();
const waitForStackToSettle = vi.fn<WaitForStackToSettle>();

const EXECUTOR_CONFIG = {
    clusterSecret: "test-cluster-secret",
    getDeploymentOutputs: getDeploymentOutputs,
    waitForStackToSettle: waitForStackToSettle,
};

const CDK_SUCCEEDED: CdkCommandResult = {
    exitCode: 0,
    signal: null,
    stderr: "",
};

const CDK_DEPLOY_FAILED: CdkCommandResult = {
    exitCode: 1,
    signal: null,
    stderr: "CloudFormation failed.",
};

const CDK_KILLED: CdkCommandResult = {
    exitCode: null,
    signal: "SIGKILL",
    stderr: "",
};

/**
 * Creates an in-progress document for an executor test.
 *
 * @param action Action represented by the document.
 * @return In-progress deployment document.
 */
const createDeploymentDocument = (action: "create" | "delete"): DeploymentDocument => {
    const isCreate = "create" === action;
    const requestedPhase = isCreate ?
        "CREATE_REQUESTED" :
        "DELETE_REQUESTED";
    const inProgressPhase = isCreate ?
        "CREATING" :
        "DELETING";

    return {
        _id: DEPLOYMENT_ID,
        metadata: {
            created_at: new Date("2026-08-25T11:00:00.000Z"),
            email: "owner@example.com",
            org_id: null,
            owner_id: "owner-a",
        },
        spec: {
            cloud_provider: "aws",
            clp_image_tag: "0.5.0-main-test",
            cluster_id: "yscope1",
            compression_workers: 4,
            deployment_name: DEPLOYMENT_ID,
            helm_chart_version: "0.4.1-dev.11",
            region: "ca-central-1",
            search_workers: 4,
        },
        status: {
            phase: inProgressPhase,
            phase_transition_records: {
                [requestedPhase]: REQUESTED_AT,
                [inProgressPhase]: CLAIMED_AT,
            },
        },
    };
};

/**
 * Creates the internal request passed to the executor.
 *
 * @param action Action to place in the returned request.
 * @param requestedAt Time when the request was submitted.
 * @return Request with fixed identity and timing fields.
 */
const createDeploymentRequest = (
    action: DeploymentRequest["action"],
    requestedAt = REQUESTED_AT,
): DeploymentRequest => ({
    action: action,
    deploymentId: DEPLOYMENT_ID,
    requestId: "request-a",
    requestedAt: requestedAt,
    tenantId: "tenant-a",
});

let memoryReplicaSet: MongoMemoryReplSet;
let metadataDb: MetadataDb;
let database: Db;
let deployments: Collection<DeploymentDocument>;

beforeAll(async () => {
    memoryReplicaSet = await MongoMemoryReplSet.create({
        instanceOpts: [{launchTimeout: INTEGRATION_TIMEOUT_MS}],
        replSet: {count: 1},
    });
    metadataDb = new MetadataDb(memoryReplicaSet.getUri("request-executor-tests"));
    await metadataDb.connect();
    database = metadataDb.getDatabase();
    deployments = database.collection<DeploymentDocument>("deployments");
}, INTEGRATION_TIMEOUT_MS);

beforeEach(() => {
    getDeploymentOutputs.mockReset().mockResolvedValue(DEPLOYMENT_OUTPUTS);
    waitForStackToSettle.mockReset().mockResolvedValue({StackStatus: "CREATE_COMPLETE"});
    vi.setSystemTime(EXECUTION_STARTED_AT);
});

afterEach(async () => {
    vi.restoreAllMocks();
    vi.mocked(sleep).mockReset();
    vi.useRealTimers();
    await deployments.deleteMany({});
});

afterAll(async () => {
    await metadataDb.close();
    await memoryReplicaSet.stop();
});

it.each(ACTIONS)(
    "%s resolves when CloudFormation succeeds without changing the deployment",
    async (action) => {
        const document = createDeploymentDocument(action);
        await deployments.insertOne(document);
        const runCdkCommand = vi.fn<CdkCommandRunner>().mockResolvedValue(CDK_SUCCEEDED);
        waitForStackToSettle.mockResolvedValue(
            "create" === action ?
                {StackStatus: "CREATE_COMPLETE"} :
                null,
        );

        const executor = new DeploymentRequestExecutor({
            ...EXECUTOR_CONFIG,
            database: database,
            runCdkCommand: runCdkCommand,
        });

        const execution = executor.execute(createDeploymentRequest(action));
        if ("create" === action) {
            await expect(execution).resolves.toEqual(DEPLOYMENT_OUTPUTS);
            expect(getDeploymentOutputs).toHaveBeenCalledExactlyOnceWith({
                region: "ca-central-1",
                stackName: DEPLOYMENT_STACK_NAME,
            });
        } else {
            await expect(execution).resolves.toBeNull();
            expect(getDeploymentOutputs).not.toHaveBeenCalled();
        }

        expect(runCdkCommand).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
            action: action,
            deployment: document,
        }));
        expect(waitForStackToSettle).toHaveBeenCalledExactlyOnceWith({
            region: "ca-central-1",
            stackName: DEPLOYMENT_STACK_NAME,
        });
        expect(await deployments.findOne({_id: DEPLOYMENT_ID})).toEqual(document);
    },
);

it("rejects when deployment outputs cannot be read after a successful create", async () => {
    const document = createDeploymentDocument("create");
    await deployments.insertOne(document);
    const error = new Error("Missing CloudFormation output ArchiveBucketName.");
    getDeploymentOutputs.mockRejectedValue(error);
    const runCdkCommand = vi.fn<CdkCommandRunner>().mockResolvedValue(CDK_SUCCEEDED);
    const executor = new DeploymentRequestExecutor({
        ...EXECUTOR_CONFIG,
        database: database,
        runCdkCommand: runCdkCommand,
    });

    await expect(executor.execute(createDeploymentRequest("create"))).rejects.toBe(error);

    expect(runCdkCommand).toHaveBeenCalledTimes(1);
    expect(await deployments.findOne({_id: DEPLOYMENT_ID})).toEqual(document);
});

it.each(ACTIONS)(
    "settles an old %s request after its CDK process is killed",
    async (action) => {
        vi.setSystemTime(LATE_EXECUTION_AT);
        const document = createDeploymentDocument(action);
        await deployments.insertOne(document);
        const runCdkCommand = vi.fn<CdkCommandRunner>().mockResolvedValue(CDK_KILLED);
        waitForStackToSettle.mockResolvedValue("create" === action ?
            {StackStatus: "CREATE_COMPLETE", ChangeSetId: REQUEST_CHANGE_SET_ID} :
            {StackStatus: "DELETE_COMPLETE"});
        const executor = new DeploymentRequestExecutor({
            ...EXECUTOR_CONFIG,
            database: database,
            runCdkCommand: runCdkCommand,
        });

        await executor.execute(createDeploymentRequest(action));

        const stack = {
            region: "ca-central-1",
            stackName: DEPLOYMENT_STACK_NAME,
        };

        expect(waitForStackToSettle).toHaveBeenCalledExactlyOnceWith(stack);
        expect(runCdkCommand).toHaveBeenCalledTimes(1);
        expect(await deployments.findOne({_id: DEPLOYMENT_ID})).toEqual(document);
    },
);

it("applies throttling jitter to the next request", async () => {
    const first = createDeploymentDocument("create");
    const second = {
        ...first,
        _id: "deployment-b",
        spec: {...first.spec, deployment_name: "deployment-b"},
    };

    await deployments.insertMany([
        first,
        second,
    ]);
    const runCdkCommand = vi.fn<CdkCommandRunner>()
        .mockResolvedValueOnce({
            exitCode: 1,
            signal: null,
            stderr: "ThrottlingException: Rate exceeded.",
        })
        .mockResolvedValue(CDK_SUCCEEDED);

    waitForStackToSettle.mockResolvedValueOnce(null)
        .mockResolvedValue({StackStatus: "CREATE_COMPLETE"});

    vi.spyOn(Math, "random").mockReturnValue(0);
    vi.mocked(sleep).mockImplementation(() => {
        expect(runCdkCommand).toHaveBeenCalledTimes(1);

        return Promise.resolve();
    });
    const executor = new DeploymentRequestExecutor({
        ...EXECUTOR_CONFIG,
        database: database,
        runCdkCommand: runCdkCommand,
    });

    await expect(executor.execute(createDeploymentRequest("create")))
        .rejects.toThrow("deployment submission could not be confirmed");
    expect(sleep).not.toHaveBeenCalled();

    await executor.execute({
        ...createDeploymentRequest("create"),
        deploymentId: second._id,
        requestId: "request-b",
    });

    expect(sleep).toHaveBeenCalledExactlyOnceWith(
        MIN_THROTTLE_DELAY_MS,
        null,
        {signal: expect.any(AbortSignal) as AbortSignal},
    );
    expect(runCdkCommand).toHaveBeenCalledTimes(2);
    expect(runCdkCommand).toHaveBeenLastCalledWith(expect.objectContaining({
        action: "create",
        deployment: second,
    }));
});

it.each([
    "CREATE_COMPLETE",
    "UPDATE_COMPLETE",
] as const)("resolves from %s after checking a failed create's change set", async (status) => {
    const document = createDeploymentDocument("create");
    await deployments.insertOne(document);
    const runCdkCommand = vi.fn<CdkCommandRunner>().mockResolvedValue(CDK_DEPLOY_FAILED);
    waitForStackToSettle.mockResolvedValue({
        StackStatus: status,
        ChangeSetId: REQUEST_CHANGE_SET_ID,
    });
    const request = createDeploymentRequest("create");

    const executor = new DeploymentRequestExecutor({
        ...EXECUTOR_CONFIG,
        database: database,
        runCdkCommand: runCdkCommand,
    });

    await expect(executor.execute(request)).resolves.toEqual(DEPLOYMENT_OUTPUTS);

    expect(waitForStackToSettle).toHaveBeenCalledExactlyOnceWith({
        region: "ca-central-1",
        stackName: DEPLOYMENT_STACK_NAME,
    });
    expect(runCdkCommand).toHaveBeenCalledTimes(1);
    expect(await deployments.findOne({_id: DEPLOYMENT_ID})).toEqual(document);
});

it("rejects after rollback settles without cleanup or a database write", async () => {
    const document = createDeploymentDocument("create");
    await deployments.insertOne(document);
    const runCdkCommand = vi.fn<CdkCommandRunner>().mockResolvedValue(CDK_DEPLOY_FAILED);
    waitForStackToSettle.mockResolvedValue({
        StackStatus: "ROLLBACK_COMPLETE",
        ChangeSetId: REQUEST_CHANGE_SET_ID,
    });
    const request = createDeploymentRequest("create");
    const executor = new DeploymentRequestExecutor({
        ...EXECUTOR_CONFIG,
        database: database,
        runCdkCommand: runCdkCommand,
    });

    await expect(executor.execute(request)).rejects.toThrow("ROLLBACK_COMPLETE");

    expect(getDeploymentOutputs).not.toHaveBeenCalled();
    expect(waitForStackToSettle).toHaveBeenCalledTimes(1);
    expect(runCdkCommand).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
        action: "create",
        deployment: document,
    }));
    expect(await deployments.findOne({_id: DEPLOYMENT_ID})).toEqual(document);
});

it.each(ACTIONS)(
    "waits for AWS to settle after the %s command exits successfully",
    async (action) => {
        const document = createDeploymentDocument(action);
        await deployments.insertOne(document);
        const runCdkCommand = vi.fn<CdkCommandRunner>().mockResolvedValue(CDK_SUCCEEDED);
        const stackSettled = Promise.withResolvers<boolean>();
        waitForStackToSettle.mockImplementation(async () => {
            await stackSettled.promise;

            return "create" === action ?
                {StackStatus: "CREATE_COMPLETE"} :
                null;
        });
        const executor = new DeploymentRequestExecutor({
            ...EXECUTOR_CONFIG,
            database: database,
            runCdkCommand: runCdkCommand,
        });

        let executionFinished = false;
        const execution = executor.execute(createDeploymentRequest(action)).finally(() => {
            executionFinished = true;
        });

        await vi.waitFor(() => {
            expect(waitForStackToSettle).toHaveBeenCalledTimes(1);
        });
        expect(executionFinished).toBe(false);
        expect(runCdkCommand).toHaveBeenCalledTimes(1);
        expect(getDeploymentOutputs).not.toHaveBeenCalled();
        expect(await deployments.findOne({_id: DEPLOYMENT_ID})).toEqual(document);

        stackSettled.resolve(true);
        if ("create" === action) {
            await expect(execution).resolves.toEqual(DEPLOYMENT_OUTPUTS);
        } else {
            await expect(execution).resolves.toBeNull();
        }
    },
);

it(
    "recovers from a real MongoDB outage during the deployment read",
    // eslint-disable-next-line max-statements -- Keep outage, recovery, and cleanup together.
    async () => {
        const outageReplicaSet = await MongoMemoryReplSet.create({
            instanceOpts: [{launchTimeout: INTEGRATION_TIMEOUT_MS}],
            replSet: {count: 1},
        });
        const uri = outageReplicaSet.getUri("request-executor-outage");
        const outageMetadataDb = new MetadataDb(`${uri}&heartbeatFrequencyMS=500`);
        let execution: ReturnType<DeploymentRequestExecutor["execute"]> | undefined;

        try {
            await outageMetadataDb.connect();
            const outageDatabase = outageMetadataDb.getDatabase();
            const outageDeployments = outageDatabase.collection<DeploymentDocument>("deployments");
            const document = createDeploymentDocument("create");
            await outageDeployments.insertOne(document);
            const runCdkCommand = vi.fn<CdkCommandRunner>().mockResolvedValue(CDK_SUCCEEDED);
            const executor = new DeploymentRequestExecutor({
                ...EXECUTOR_CONFIG,
                database: outageDatabase,
                runCdkCommand: runCdkCommand,
            });
            const [outageServer] = outageReplicaSet.servers;

            await outageServer.stop({doCleanup: false});
            const heartbeatFailed = once(outageDatabase.client, "serverHeartbeatFailed", {
                signal: AbortSignal.timeout(OUTAGE_DETECTION_TIMEOUT_MS),
            });

            execution = executor.execute(createDeploymentRequest("create"));
            execution.catch(vi.fn());

            await heartbeatFailed;
            expect(outageServer.state).toBe("stopped");
            expect(runCdkCommand).not.toHaveBeenCalled();

            await outageServer.start(true);
            expect(outageReplicaSet.getUri("request-executor-outage")).toBe(uri);
            await expect(execution).resolves.toEqual(DEPLOYMENT_OUTPUTS);

            const stored = await outageDeployments.findOne({_id: DEPLOYMENT_ID});
            expect(stored).toEqual(document);
            expect(runCdkCommand).toHaveBeenCalledTimes(1);
        } finally {
            await outageMetadataDb.close();
            await execution?.catch(vi.fn());
            await outageReplicaSet.stop();
        }
    },
    INTEGRATION_TIMEOUT_MS,
);

it.each(ACTIONS)(
    "logs stack status every 30 seconds while %s runs and stops afterward",
    async (action) => {
        await deployments.insertOne(createDeploymentDocument(action));
        vi.useFakeTimers({toFake: [
            "Date",
            "setInterval",
            "clearInterval",
        ]});
        vi.setSystemTime(EXECUTION_STARTED_AT);
        const log = vi.spyOn(console, "log").mockImplementation(vi.fn());
        const status = "create" === action ?
            "CREATE_IN_PROGRESS" :
            "DELETE_IN_PROGRESS";
        const getStackStatus = vi.fn<GetStackStatus>().mockResolvedValue(status);
        waitForStackToSettle.mockResolvedValue("create" === action ?
            {StackStatus: "CREATE_COMPLETE"} :
            null);
        const runCdkCommand = vi.fn<CdkCommandRunner>(async () => {
            await vi.advanceTimersByTimeAsync(STATUS_POLL_INTERVAL_MS - 1);
            expect(getStackStatus).not.toHaveBeenCalled();

            await vi.advanceTimersByTimeAsync(1);
            expect(getStackStatus).toHaveBeenCalledExactlyOnceWith({
                region: "ca-central-1",
                stackName: DEPLOYMENT_STACK_NAME,
            }, expect.any(AbortSignal));
            await vi.advanceTimersByTimeAsync(STATUS_POLL_INTERVAL_MS);

            return CDK_SUCCEEDED;
        });

        const executor = new DeploymentRequestExecutor({
            ...EXECUTOR_CONFIG,
            database: database,
            getStackStatus: getStackStatus,
            runCdkCommand: runCdkCommand,
        });

        await executor.execute(createDeploymentRequest(action));

        expect(log).toHaveBeenCalledTimes(2);
        expect(log).toHaveBeenLastCalledWith(
            `CloudFormation stack ${DEPLOYMENT_STACK_NAME} during ${action}: ${status}.`,
        );
        await vi.advanceTimersByTimeAsync(STATUS_POLL_INTERVAL_MS);
        expect(getStackStatus).toHaveBeenCalledTimes(2);
        expect(waitForStackToSettle).toHaveBeenCalledExactlyOnceWith({
            region: "ca-central-1",
            stackName: DEPLOYMENT_STACK_NAME,
        });
        expect(log).toHaveBeenCalledTimes(2);
    },
);


it("rejects an invalid deployment without running CDK or changing the document", async () => {
    await deployments.insertOne(createDeploymentDocument("create"));
    await deployments.updateOne({_id: DEPLOYMENT_ID}, {$unset: {"spec.clp_image_tag": ""}});
    const invalidDocument = await deployments.findOne({_id: DEPLOYMENT_ID});
    const runCdkCommand = vi.fn<CdkCommandRunner>();

    const executor = new DeploymentRequestExecutor({
        ...EXECUTOR_CONFIG,
        database: database,
        runCdkCommand: runCdkCommand,
    });

    await expect(executor.execute(createDeploymentRequest("create")))
        .rejects.toThrow("clp_image_tag");

    expect(runCdkCommand).not.toHaveBeenCalled();
    expect(await deployments.findOne({_id: DEPLOYMENT_ID})).toEqual(invalidDocument);
});
