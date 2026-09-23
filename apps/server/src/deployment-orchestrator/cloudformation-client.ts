import {setTimeout as sleep} from "node:timers/promises";

import {
    CloudFormationClient,
    DescribeStacksCommand,
    type Stack,
    type StackStatus,
} from "@aws-sdk/client-cloudformation";
import {z} from "zod";

import type {DeploymentDocument} from "../metadata-db-schemas/deployment.js";


const STACK_STATUS_POLL_INTERVAL_MILLISECS = 30_000;
const STACK_SETTLEMENT_TIMEOUT_MILLISECS = 3_600_000;
const IN_PROGRESS_STACK_STATUSES = new Set([
    "REVIEW_IN_PROGRESS",
    "CREATE_IN_PROGRESS",
    "UPDATE_IN_PROGRESS",
    "UPDATE_COMPLETE_CLEANUP_IN_PROGRESS",
    "ROLLBACK_IN_PROGRESS",
    "UPDATE_ROLLBACK_IN_PROGRESS",
    "UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS",
    "DELETE_IN_PROGRESS",
    "IMPORT_IN_PROGRESS",
    "IMPORT_ROLLBACK_IN_PROGRESS",
]);

type StackIdentity = {
    region: string;
    stackName: string;
};

type GetStackStatus = (
    stackIdentity: StackIdentity,
    signal?: AbortSignal,
) => Promise<StackStatus | null>;

type WaitForStackToSettle = (
    stackIdentity: StackIdentity,
) => Promise<Pick<Stack, "StackStatus" | "ChangeSetId"> | null>;

type DeploymentOutputs = Required<Pick<
    DeploymentDocument["status"],
    "archive_bucket" | "public_url" | "s3_access_role_arn"
>>;

type GetDeploymentOutputs = (stackIdentity: StackIdentity) => Promise<DeploymentOutputs>;

class StackSettlementTimeoutError extends Error {
    /**
     * @param stackName Stack that could not be reconciled within the deadline.
     */
    constructor (stackName: string) {
        super(`CloudFormation stack ${stackName} did not settle within 1 hour.`);
        this.name = "StackSettlementTimeoutError";
    }
}

/**
 * Reads a stack from CloudFormation.
 *
 * @param stackIdentity Region and name of the stack to look up.
 * @param signal Cancels a pending stack lookup.
 * @return Stack description, or null if the stack does not exist.
 * @throws {Error} If the CloudFormation stack lookup fails.
 * @throws {unknown} If signal is aborted, rejects with signal.reason.
 */
const getStack = async (
    stackIdentity: StackIdentity,
    signal?: AbortSignal,
): Promise<Stack | null> => {
    signal?.throwIfAborted();
    const client = new CloudFormationClient({region: stackIdentity.region});
    try {
        const result = await client.send(
            new DescribeStacksCommand({StackName: stackIdentity.stackName}),
            {abortSignal: signal},
        );

        signal?.throwIfAborted();

        return result.Stacks?.[0] ?? null;
    } catch (error: unknown) {
        signal?.throwIfAborted();
        if (error instanceof Error && "ValidationError" === error.name &&
            (/does not exist/i).test(error.message)) {
            return null;
        }

        throw error;
    } finally {
        client.destroy();
    }
};

/**
 * Reads the stack's current status from CloudFormation.
 *
 * @param stackIdentity Region and name of the stack to look up.
 * @param signal Cancels a pending stack lookup.
 * @return Current status, or null if the stack does not exist.
 * @throws {Error} If the CloudFormation stack lookup fails.
 * @throws {unknown} If signal is aborted, rejects with signal.reason.
 */
const getStackStatus: GetStackStatus = async (stackIdentity, signal) => (
    (await getStack(stackIdentity, signal))?.StackStatus ?? null
);

/**
 * Gets the change-set name recorded on the settled stack.
 *
 * @param stackDescription Stack description returned after the stack has settled.
 * @return Recorded change-set name, or null if it is unavailable.
 */
const getStackChangeSet = (
    stackDescription: Pick<Stack, "ChangeSetId"> | null,
): string | null => stackDescription?.ChangeSetId?.split("/")[1] ?? null;

/**
 * Waits for an active CloudFormation operation to settle.
 *
 * @param stackIdentity Region and name of the stack to look up.
 * @return Final stack description, or null if the stack does not exist.
 * @throws {Error} If the initial CloudFormation stack lookup fails.
 * @throws {StackSettlementTimeoutError} If this call does not finish within one hour.
 */
const waitForStackToSettle: WaitForStackToSettle = async (stackIdentity) => {
    const controller = new AbortController();
    const {signal} = controller;
    const timer = setTimeout(() => {
        controller.abort(new StackSettlementTimeoutError(stackIdentity.stackName));
    }, STACK_SETTLEMENT_TIMEOUT_MILLISECS);

    try {
        let description = await getStack(stackIdentity, signal);

        while (description && IN_PROGRESS_STACK_STATUSES.has(description.StackStatus ?? "")) {
            console.log(`Waiting for CloudFormation stack ${stackIdentity.stackName}: ` +
                `${description.StackStatus}.`);
            await sleep(STACK_STATUS_POLL_INTERVAL_MILLISECS, null, {signal});
            try {
                description = await getStack(stackIdentity, signal);
            } catch (error: unknown) {
                signal.throwIfAborted();

                // A lookup failure does not mean the operation stopped running in AWS.
                console.error(
                    `Stack status lookup failed for ${stackIdentity.stackName}; retrying.`,
                    error,
                );
            }
        }

        return description;
    } catch (error: unknown) {
        signal.throwIfAborted();
        throw error;
    } finally {
        clearTimeout(timer);
    }
};

/**
 * Reads the required outputs from a completed deployment stack.
 *
 * @param stackIdentity Region and name of the stack to look up.
 * @return Deployment metadata to persist alongside its successful status.
 * @throws {Error} If either:
 * - the CloudFormation stack lookup fails or the stack does not exist.
 * - deployment outputs are missing or invalid.
 */
const getDeploymentOutputs: GetDeploymentOutputs = async (stackIdentity) => {
    const description = await getStack(stackIdentity);
    if (!description) {
        throw new Error(`CloudFormation stack ${stackIdentity.stackName} was not found.`);
    }

    const requiredOutput = (key: string): string => {
        const value = description.Outputs?.find((output) => output.OutputKey === key)?.OutputValue;
        if (!value?.trim()) {
            throw new Error(
                `CloudFormation stack ${stackIdentity.stackName} ` +
                `is missing required output ${key}.`,
            );
        }

        return value;
    };
    const publicUrl = z.httpUrl().safeParse(requiredOutput("PublicUrl"));
    if (!publicUrl.success) {
        throw new Error(
            `CloudFormation stack ${stackIdentity.stackName} has an invalid PublicUrl output.`,
        );
    }

    return {
        archive_bucket: requiredOutput("ArchiveBucketName"),
        public_url: publicUrl.data,
        s3_access_role_arn: requiredOutput("S3AccessRoleArn"),
    };
};

export {
    type DeploymentOutputs,
    type GetDeploymentOutputs,
    getDeploymentOutputs,
    getStackChangeSet,
    type GetStackStatus,
    getStackStatus,
    StackSettlementTimeoutError,
    type WaitForStackToSettle,
    waitForStackToSettle,
};
