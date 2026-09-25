import {randomUUID} from "node:crypto";

import type {
    Collection,
    Db,
} from "mongodb";

import {
    type DeploymentDocument,
    DeploymentDocumentSchema,
    DEPLOYMENTS_COLLECTION,
    type InProgressDeploymentPhase,
    type RequestedDeploymentPhase,
    RequestedDeploymentPhaseSchema,
} from "../metadata-db-schemas/index.js";
import type {
    DeploymentAction,
    DeploymentId,
    DeploymentRequest,
} from "./deployment-request.js";
import type {DeploymentRequestExecutor} from "./deployment-request-executor.js";
import {DeploymentRequestProcessor} from "./deployment-request-processor.js";
import {DeploymentRequestQueues} from "./deployment-request-queues.js";


type RequestProperties = Readonly<{
    action: DeploymentAction;
    inProgressPhase: InProgressDeploymentPhase;
}>;

const REQUESTED_PHASE_TO_PROPERTIES: Readonly<Record<
    RequestedDeploymentPhase,
    RequestProperties
>> = {
    CONFIG_REQUESTED: {
        action: "config",
        inProgressPhase: "CONFIGURING",
    },
    CREATE_REQUESTED: {
        action: "create",
        inProgressPhase: "CREATING",
    },
    DELETE_REQUESTED: {
        action: "delete",
        inProgressPhase: "DELETING",
    },
    RESUME_REQUESTED: {
        action: "resume",
        inProgressPhase: "RESUMING",
    },
    SUSPEND_REQUESTED: {
        action: "suspend",
        inProgressPhase: "SUSPENDING",
    },
};

/**
 * Accepts deployment requests and dispatches them for processing.
 */
class DeploymentOrchestrator {
    private readonly deployments: Collection<DeploymentDocument>;

    private hasStartedProcessor = false;

    private readonly requestProcessor: DeploymentRequestProcessor;

    private readonly requestQueues: DeploymentRequestQueues;

    /**
     * @param database The metadata database containing deployment documents.
     * @param requestExecutor The object used to execute deployment requests.
     */
    constructor (
        database: Db,
        requestExecutor: DeploymentRequestExecutor,
    ) {
        this.deployments = database.collection<DeploymentDocument>(
            DEPLOYMENTS_COLLECTION,
        );
        this.requestQueues = new DeploymentRequestQueues();
        this.requestProcessor = new DeploymentRequestProcessor(
            this.requestQueues,
            requestExecutor,
            database,
        );
    }

    /**
     * Copies and updates the given deployment document to be in progress, indicating the request
     * has been claimed.
     *
     * @param deployment The current deployment document.
     * @param requestedPhase The requested phase to transition into progress.
     * @return The validated in-progress deployment document.
     */
    private static createInProgressDeploymentDocument (
        deployment: DeploymentDocument,
        requestedPhase: RequestedDeploymentPhase,
    ): DeploymentDocument {
        const {inProgressPhase} = REQUESTED_PHASE_TO_PROPERTIES[requestedPhase];

        return DeploymentOrchestrator.parseDeploymentDocument(
            {
                ...deployment,
                status: {
                    ...deployment.status,
                    phase: inProgressPhase,
                    phase_transition_records: {
                        ...deployment.status.phase_transition_records,
                        [inProgressPhase]: new Date(),
                    },
                },
            },
            deployment._id,
        );
    }

    /**
     * Parses and validates a deployment document.
     *
     * @param deploymentDoc The deployment document to validate.
     * @param deploymentId
     * @return The validated deployment document.
     * @throws {Error} If validation fails, with the original Zod error retained as the cause.
     */
    private static parseDeploymentDocument (
        deploymentDoc: unknown,
        deploymentId: DeploymentId,
    ): DeploymentDocument {
        const parsedDeployment = DeploymentDocumentSchema.safeParse(deploymentDoc);
        if (!parsedDeployment.success) {
            throw new Error(
                `Deployment "${deploymentId}" failed validation.`,
                {cause: parsedDeployment.error},
            );
        }

        return parsedDeployment.data;
    }

    /**
     * Starts the deployment request processor.
     *
     * @return A promise that only rejects if a worker fails unexpectedly.
     */
    runProcessor (): Promise<never> {
        if (this.hasStartedProcessor) {
            return Promise.reject(new Error(
                "The deployment request processor has already been started.",
            ));
        }

        const processorExecution = this.requestProcessor.run();
        this.hasStartedProcessor = true;

        return processorExecution;
    }

    /**
     * Claims and enqueues the pending request for the given deployment.
     *
     * @param deploymentId The deployment to schedule the pending request for.
     */
    async schedule (deploymentId: DeploymentId): Promise<void> {
        const request = await this.claimDeploymentRequest(deploymentId);

        this.requestQueues.enqueue(request);
    }

    /**
     * Atomically claims a deployment request and marks it as in progress.
     *
     * @param deploymentId
     * @return A `DeploymentRequest` for the claimed deployment action.
     * @throws {Error} If either:
     * - the deployment does not exist.
     * - the deployment document fails validation.
     * - the deployment is not in a requested phase.
     * - the requested action is not supported.
     * - the deployment status could not be updated.
     */
    private async claimDeploymentRequest (
        deploymentId: DeploymentId,
    ): Promise<DeploymentRequest> {
        const deploymentDoc = await this.deployments.findOne({
            _id: deploymentId,
        });

        if (null === deploymentDoc) {
            throw new Error(`Deployment "${deploymentId}" does not exist.`);
        }

        const deployment = DeploymentOrchestrator.parseDeploymentDocument(
            deploymentDoc,
            deploymentId,
        );

        const requestedPhaseParsed = RequestedDeploymentPhaseSchema.safeParse(
            deployment.status.phase,
        );

        if (!requestedPhaseParsed.success) {
            throw new Error(
                `Deployment "${deploymentId}" is not in a \`_REQUESTED\` phase.`,
            );
        }

        const requestedPhase = requestedPhaseParsed.data;
        const {action} = REQUESTED_PHASE_TO_PROPERTIES[requestedPhase];
        if ("create" !== action && "delete" !== action) {
            throw new Error(`Unsupported deployment action: ${action}`);
        }

        const requestedAt = deployment.status
            .phase_transition_records[requestedPhase] as Date;

        const inProgressDeployment = DeploymentOrchestrator.createInProgressDeploymentDocument(
            deployment,
            requestedPhase,
        );

        const claimResult = await this.deployments.replaceOne(
            {
                "_id": deploymentId,
                "status.phase": requestedPhase,
            },
            inProgressDeployment,
        );

        if (1 !== claimResult.modifiedCount) {
            throw new Error(
                `Deployment "${deploymentId}" status could not be updated.`,
            );
        }

        return {
            action: action,
            deploymentId: deployment._id,
            requestId: randomUUID(),
            requestedAt: requestedAt,
            tenantId: deployment.metadata.owner_id,
        };
    }
}

export {DeploymentOrchestrator};
