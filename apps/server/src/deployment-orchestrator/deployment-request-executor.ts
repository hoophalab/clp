import {setTimeout as sleep} from "node:timers/promises";

import type {Db} from "mongodb";

import {
    type DeploymentDocument,
    DeploymentDocumentSchema,
    DEPLOYMENTS_COLLECTION,
} from "../metadata-db-schemas/deployment.js";
import {
    type CdkCommandResult,
    type CdkCommandRunner,
    createCdkCommandRunner,
} from "./cdk-command-runner.js";
import {
    type DeploymentOutputs,
    type GetDeploymentOutputs,
    getDeploymentOutputs,
    getStackChangeSet,
    type GetStackStatus,
    getStackStatus,
    StackSettlementTimeoutError,
    type WaitForStackToSettle,
    waitForStackToSettle,
} from "./cloudformation-client.js";
import type {DeploymentRequest} from "./deployment-request.js";


const THROTTLE_JITTER_WINDOW_MS = 30_000;
const MIN_THROTTLE_DELAY_MS = 1_000;
const MAX_THROTTLE_DELAY_MS = 10_000;
const STACK_STATUS_LOG_INTERVAL_MS = 30_000;
const CDK_COMMAND_TIMEOUT_MS = 1_800_000;

type DeploymentRequestExecutorOptions = {
    clusterSecret: string;
    database: Db;
    getDeploymentOutputs?: GetDeploymentOutputs;
    getStackStatus?: GetStackStatus;
    runCdkCommand?: CdkCommandRunner;
    waitForStackToSettle?: WaitForStackToSettle;
};

/**
 * Describes an unsuccessful CDK command without relying on stderr being present.
 *
 * @param result CDK subprocess outcome.
 * @return Error suitable for the deployment status.
 */
const describeCdkFailure = (result: CdkCommandResult): string => (
    result.stderr.trim() || `CDK exited with ${result.signal ?? result.exitCode}.`
);

class DeploymentRequestExecutor {
    private readonly database: Db;

    private readonly getDeploymentOutputs: GetDeploymentOutputs;

    private readonly getStackStatus: GetStackStatus;

    private readonly cdkRunner: CdkCommandRunner;

    private readonly waitForStackToSettle: WaitForStackToSettle;

    private applyJitterUntil = 0;

    /**
     * @param options Shared dependencies and configuration.
     */
    constructor (options: DeploymentRequestExecutorOptions) {
        this.database = options.database;
        this.getDeploymentOutputs = options.getDeploymentOutputs ?? getDeploymentOutputs;
        this.getStackStatus = options.getStackStatus ?? getStackStatus;
        this.waitForStackToSettle = options.waitForStackToSettle ?? waitForStackToSettle;
        this.cdkRunner = options.runCdkCommand ?? createCdkCommandRunner({
            clusterSecret: options.clusterSecret,
        });
    }

    /**
     * Executes create or delete once and checks the settled CloudFormation outcome.
     *
     * @param request Claimed deployment request.
     * @return Deployment outputs for create, or null for delete.
     * @throws {Error} If either:
     * - the requested action is not supported.
     * - the deployment cannot be read, does not exist, or fails validation.
     * - the CloudFormation stack cannot be read.
     * - CDK fails or times out during create and the stack's change set does not match the request.
     * - the settled stack is not in a successful state for the requested action.
     * - the required deployment outputs cannot be read, are missing, or are invalid.
     * @throws {StackSettlementTimeoutError} If the stack does not settle within one hour.
     */
    // eslint-disable-next-line max-statements -- Keep execution and reconciliation together.
    async execute (request: DeploymentRequest): Promise<DeploymentOutputs | null> {
        // Check required for type checker
        if ("create" !== request.action && "delete" !== request.action) {
            throw new Error(`Unsupported deployment action: ${request.action}`);
        }

        const deployment = await this.readDeploymentDocument(request);
        const changeSetName = `request-${request.requestId}`;
        const result = await this.runCdkCommandWithStatusLogging({
            action: request.action,
            deployment: deployment,
            ...("create" === request.action ?
                {changeSetName} :
                {}),
        });
        const commandFailure = 0 === result.exitCode ?
            "" :
            `\n${describeCdkFailure(result)}`;

        if (0 !== result.exitCode) {
            console.error(
                `CDK command for deployment ${request.deploymentId} failed:${commandFailure}`,
            );
        }
        let status;
        try {
            const stack = {
                region: deployment.spec.region,
                stackName: `${deployment.spec.cluster_id}-Deployment-${deployment._id}`,
            };

            /* AWS may keep running after CDK fails or times out, so wait for the stack to settle.
            * For create commands that failed or timed out, match the stack's change set to this
            * request so an older successful deployment cannot be mistaken for this request's
            * result.
            * Deletes do not use change sets; DELETE_COMPLETE or an absent stack confirms the
            * desired outcome, including when the stack was already absent before this request.
            */
            const settledStack = await this.waitForStackToSettle(stack);
            if ("create" === request.action && (result.timedOut || 0 !== result.exitCode) &&
                getStackChangeSet(settledStack) !== changeSetName) {
                throw new Error(`Stack does not record change set ${changeSetName}; ` +
                    "deployment submission could not be confirmed.");
            }
            status = settledStack?.StackStatus ?? null;
        } catch (error: unknown) {
            if (error instanceof StackSettlementTimeoutError) {
                throw error;
            }
            throw new Error(`Stack status lookup failed: ${String(error)}${commandFailure}`);
        }
        let succeeded;
        if ("delete" === request.action) {
            succeeded = null === status || "DELETE_COMPLETE" === status;
        } else {
            succeeded = "CREATE_COMPLETE" === status || "UPDATE_COMPLETE" === status;
        }

        if (!succeeded) {
            throw new Error(
                `CloudFormation ${request.action} status: ` +
                `${status ?? "not found"}.${commandFailure}`,
            );
        }

        if ("create" === request.action) {
            return this.getDeploymentOutputs({
                region: deployment.spec.region,
                stackName: `${deployment.spec.cluster_id}-Deployment-${deployment._id}`,
            });
        }

        return null;
    }

    /**
     * Logs stack status while running CDK, cancelling local work after 30 minutes.
     *
     * @param command CDK operation and deployment configuration.
     * @return CDK exit details and a timedOut flag.
     */
    private async runCdkCommandWithStatusLogging (
        command: Parameters<CdkCommandRunner>[0],
    ): Promise<CdkCommandResult & {timedOut: boolean}> {
        const {action, deployment} = command;
        const controller = new AbortController();
        const stack = {
            region: deployment.spec.region,
            stackName: `${deployment.spec.cluster_id}-Deployment-${deployment._id}`,
        };
        let stopped = false;
        let polling = false;
        const logStackStatus = async () => {
            try {
                const status = await this.getStackStatus(stack, controller.signal);
                if (!stopped) {
                    console.log(
                        `CloudFormation stack ${stack.stackName} during ${action}: ` +
                        `${status ?? "not found"}.`,
                    );
                }
            } finally {
                polling = false;
            }
        };
        const timer = setInterval(() => {
            if (!polling) {
                polling = true;
                logStackStatus().catch((error: unknown) => {
                    if (!stopped) {
                        console.error(`Stack status lookup failed for ${stack.stackName}.`, error);
                    }
                });
            }
        }, STACK_STATUS_LOG_INTERVAL_MS);
        const timeout = setTimeout(() => {
            stopped = true;
            clearInterval(timer);
            controller.abort(new Error("CDK execution timed out (30m)."));
        }, CDK_COMMAND_TIMEOUT_MS);

        try {
            const result = await this.runCdkCommand({...command, signal: controller.signal});

            return {
                ...result,
                stderr: controller.signal.aborted ?
                    `CDK execution timed out (30m).\n${result.stderr}` :
                    result.stderr,
                timedOut: controller.signal.aborted,
            };
        } catch (error: unknown) {
            const timedOut = controller.signal.aborted;

            return {exitCode: null, signal: null, stderr: String(error), timedOut: timedOut};
        } finally {
            stopped = true;
            clearInterval(timer);
            clearTimeout(timeout);
            controller.abort();
        }
    }

    /**
     * Runs a CDK command with jitter while this executor is being throttled.
     *
     * @param command CDK operation, deployment configuration, and cancellation signal.
     * @return CDK command outcome.
     * @throws {unknown} If command.signal is aborted before the CDK subprocess starts.
     * @throws {Error} If the configured CDK runner rejects, including failures to create its
     * output directory, start the subprocess, or terminate the process group after cancellation.
     */
    private async runCdkCommand (
        command: Parameters<CdkCommandRunner>[0],
    ): Promise<CdkCommandResult> {
        if (Date.now() < this.applyJitterUntil) {
            const waitMs = MIN_THROTTLE_DELAY_MS +
                (Math.random() * (MAX_THROTTLE_DELAY_MS - MIN_THROTTLE_DELAY_MS));

            await sleep(waitMs, null, {signal: command.signal});
        }
        command.signal?.throwIfAborted();
        const result = await this.cdkRunner(command);
        if ((/ThrottlingException|Throttling:|Rate exceeded/i).test(result.stderr)) {
            this.applyJitterUntil = Math.max(
                this.applyJitterUntil,
                Date.now() + THROTTLE_JITTER_WINDOW_MS,
            );
        }

        return result;
    }

    /**
     * Reads and validates the deployment.
     *
     * @param request Claimed deployment request.
     * @return Persisted configuration and status for the requested ID.
     * @throws {Error} If the MongoDB read fails or times out, or if the deployment document does
     * not exist or fails schema validation.
     */
    private async readDeploymentDocument (
        request: DeploymentRequest,
    ): Promise<DeploymentDocument> {
        const deployments = this.database.collection<DeploymentDocument>(DEPLOYMENTS_COLLECTION);
        const deploymentDocument = await deployments.findOne(
            {_id: request.deploymentId},
        );

        if (!deploymentDocument) {
            throw new Error(`Deployment ${request.deploymentId} was not found.`);
        }

        const deployment = DeploymentDocumentSchema.safeParse(deploymentDocument);

        if (!deployment.success) {
            throw new Error(
                `Deployment ${request.deploymentId} is invalid: ${deployment.error.message}`,
            );
        }

        return deployment.data;
    }
}

export {DeploymentRequestExecutor};
