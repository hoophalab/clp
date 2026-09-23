import type {Db} from "mongodb";

import type {
    DeploymentDocument,
    InProgressDeploymentPhase,
    RequestResultDeploymentPhase,
} from "../metadata-db-schemas/deployment.js";
import {
    type DeploymentOutputs,
    StackSettlementTimeoutError,
} from "./cloudformation-client.js";
import type {DeploymentRequest} from "./deployment-request.js";
import type {DeploymentRequestExecutor} from "./deployment-request-executor.js";
import type {DeploymentRequestQueues} from "./deployment-request-queues.js";


const REQUEST_PROCESSING_CONCURRENCY_MIN = 1;
const REQUEST_PROCESSING_CONCURRENCY_MAX = 20;
const REQUEST_PROCESSING_CONCURRENCY_DEFAULT = REQUEST_PROCESSING_CONCURRENCY_MAX;

const ACTION_PHASES = {
    create: {
        inProgress: "CREATING",
        success: "RUNNING",
        failure: "CREATE_FAILED",
    },
    delete: {
        inProgress: "DELETING",
        success: "DELETED",
        failure: "DELETE_FAILED",
    },
} as const;

type DeploymentResult = {
    deploymentNotFunctional: boolean;
    error?: string;
    expectedPhase: InProgressDeploymentPhase;
    outputs?: DeploymentOutputs;
    phase: RequestResultDeploymentPhase;
};

/**
 * Persists a terminal result and its transition timestamp.
 *
 * @param database Metadata database.
 * @param request Completed request.
 * @param result Expected current phase and terminal outcome.
 * @throws {Error} If the write fails or does not modify exactly one document.
 */
const writeDeploymentResult = async (
    database: Db,
    request: DeploymentRequest,
    result: DeploymentResult,
): Promise<void> => {
    const deployments = database.collection<DeploymentDocument>("deployments");
    const completedAt = new Date();
    const transitionPath = `status.phase_transition_records.${result.phase}`;
    const update = {
        $set: {
            "status.phase": result.phase,
            [transitionPath]: completedAt,
            ...("undefined" === typeof result.outputs ?
                {} :
                {
                    "status.archive_bucket": result.outputs.archive_bucket,
                    "status.public_url": result.outputs.public_url,
                    "status.s3_access_role_arn": result.outputs.s3_access_role_arn,
                }),
            ...("undefined" === typeof result.error ?
                {} :
                {"status.error": result.error}),
            ...(result.deploymentNotFunctional ?
                {"status.deploymentNotFunctional": true} :
                {}),
        },
        ...("undefined" === typeof result.error ?
            {$unset: {"status.error": "" as const}} :
            {}),
    };

    const written = await deployments.updateOne(
        {"_id": request.deploymentId, "status.phase": result.expectedPhase},
        update,
    );

    if (1 !== written.modifiedCount) {
        throw new Error(
            `Expected to modify one deployment; modified ${written.modifiedCount}.`,
        );
    }
};

class DeploymentRequestProcessor {
    private readonly database: Db;

    private readonly requestExecutor: DeploymentRequestExecutor;

    private readonly requestQueues: DeploymentRequestQueues;

    /**
     * @param requestQueues The queues from which to pull requests.
     * @param requestExecutor The object used to execute deployment requests.
     * @param database Metadata database in which to persist request outcomes.
     */
    constructor (
        requestQueues: DeploymentRequestQueues,
        requestExecutor: DeploymentRequestExecutor,
        database: Db,
    ) {
        this.database = database;
        this.requestQueues = requestQueues;
        this.requestExecutor = requestExecutor;
    }

    /**
     * Starts workers that continually process deployment requests.
     *
     * @param concurrency The number of requests to process concurrently.
     * @return A promise that only rejects if a worker fails unexpectedly.
     * @throws {RangeError} If concurrency is not a safe integer or is outside the supported range.
     */
    run (
        concurrency: number = REQUEST_PROCESSING_CONCURRENCY_DEFAULT,
    ): Promise<never> {
        if (
            !Number.isSafeInteger(concurrency) ||
            REQUEST_PROCESSING_CONCURRENCY_MIN > concurrency ||
            REQUEST_PROCESSING_CONCURRENCY_MAX < concurrency
        ) {
            throw new RangeError(
                "`concurrency` must be a safe integer between" +
                ` ${REQUEST_PROCESSING_CONCURRENCY_MIN} and ${REQUEST_PROCESSING_CONCURRENCY_MAX}.`,
            );
        }

        const workers = Array.from(
            {length: concurrency},
            () => this.runWorker(),
        );

        return Promise.race(workers);
    }

    private async runWorker (): Promise<never> {
        for (;;) {
            const request = await this.requestQueues.dequeue();

            if ("create" !== request.action && "delete" !== request.action) {
                console.error(
                    "Deployment request processing failed.",
                    new Error(`Unsupported deployment action: ${request.action}`),
                );
                continue;
            }

            const phases = ACTION_PHASES[request.action];
            const result: DeploymentResult = {
                deploymentNotFunctional: false,
                expectedPhase: phases.inProgress,
                phase: phases.success,
            };

            try {
                const outputs = await this.requestExecutor.execute(request);
                if ("create" === request.action) {
                    if (!outputs) {
                        throw new Error(`Missing deployment outputs for ${request.deploymentId}.`);
                    }
                    result.outputs = outputs;
                }
            } catch (error: unknown) {
                console.error("Deployment request executor failed.", error);
                result.error = error instanceof Error ?
                    error.message :
                    String(error);
                result.phase = phases.failure;
                result.deploymentNotFunctional = error instanceof StackSettlementTimeoutError;
            }

            try {
                await writeDeploymentResult(this.database, request, result);
            } catch (error: unknown) {
                console.error(
                    "CRITICAL: Failed to persist deployment request result.",
                    {deploymentId: request.deploymentId, requestId: request.requestId},
                    error,
                );
            }
        }
    }
}

export {
    DeploymentRequestProcessor,
    REQUEST_PROCESSING_CONCURRENCY_MAX,
    REQUEST_PROCESSING_CONCURRENCY_MIN,
};
