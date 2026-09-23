import {setTimeout as sleep} from "node:timers/promises";

import {CloudFormationClient} from "@aws-sdk/client-cloudformation";
import {
    afterEach,
    beforeEach,
    expect,
    it,
    vi,
} from "vitest";

import {
    getDeploymentOutputs,
    getStackStatus,
    waitForStackToSettle,
} from "../../src/deployment-orchestrator/cloudformation-client.js";


vi.mock(import("node:timers/promises"), async (importOriginal) => {
    const actual = await importOriginal();

    return {...actual, setTimeout: vi.fn(actual.setTimeout) as typeof actual.setTimeout};
});

const STACK_STATUS_POLL_INTERVAL_MILLISECS = 30_000;
const STACK = {region: "us-west-1", stackName: "yscope1-Deployment-bench-005"};
const OUTPUTS = [
    {OutputKey: "ArchiveBucketName", OutputValue: "deployment-archives"},
    {OutputKey: "PublicUrl", OutputValue: "https://bench-005.yscope1.cloud.yscope.com"},
    {OutputKey: "S3AccessRoleArn", OutputValue: "arn:aws:iam::123456789012:role/deployment-s3"},
];

beforeEach(() => {
    vi.mocked(sleep).mockImplementation(() => Promise.resolve());
    vi.spyOn(console, "log").mockImplementation(vi.fn());
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(sleep).mockReset();
});

it("maps required stack outputs to deployment status fields", async () => {
    const send = vi.spyOn(CloudFormationClient.prototype, "send")
        .mockImplementation(vi.fn().mockResolvedValue({Stacks: [{Outputs: OUTPUTS}]}));
    const destroy = vi.spyOn(CloudFormationClient.prototype, "destroy");

    await expect(getDeploymentOutputs(STACK)).resolves.toEqual({
        archive_bucket: "deployment-archives",
        public_url: "https://bench-005.yscope1.cloud.yscope.com",
        s3_access_role_arn: "arn:aws:iam::123456789012:role/deployment-s3",
    });

    expect(send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
        input: {StackName: STACK.stackName},
    }), expect.any(Object));
    expect(destroy).toHaveBeenCalledTimes(1);
});

it.each([
    "ArchiveBucketName",
    "PublicUrl",
    "S3AccessRoleArn",
])("rejects a stack missing required output %s", async (key) => {
    vi.spyOn(CloudFormationClient.prototype, "send").mockImplementation(vi.fn().mockResolvedValue({
        Stacks: [{Outputs: OUTPUTS.filter((output) => key !== output.OutputKey)}],
    }));

    await expect(getDeploymentOutputs(STACK)).rejects.toThrow(
        `CloudFormation stack ${STACK.stackName} is missing required output ${key}.`,
    );
});

it.each([
    "",
    "   ",
])("rejects an empty or blank output value %j", async (value) => {
    vi.spyOn(CloudFormationClient.prototype, "send").mockImplementation(vi.fn().mockResolvedValue({
        Stacks: [{Outputs: OUTPUTS.map((output) => (
            "ArchiveBucketName" === output.OutputKey ?
                {...output, OutputValue: value} :
                output
        ))}],
    }));

    await expect(getDeploymentOutputs(STACK))
        .rejects.toThrow("missing required output ArchiveBucketName");
});

it("rejects an invalid public URL", async () => {
    vi.spyOn(CloudFormationClient.prototype, "send").mockImplementation(vi.fn().mockResolvedValue({
        Stacks: [{Outputs: OUTPUTS.map((output) => (
            "PublicUrl" === output.OutputKey ?
                {...output, OutputValue: "not a URL"} :
                output
        ))}],
    }));

    await expect(getDeploymentOutputs(STACK)).rejects.toThrow(
        `CloudFormation stack ${STACK.stackName} has an invalid PublicUrl output.`,
    );
});

it("rejects missing deployment stacks while status lookup still returns null", async () => {
    const error = new Error(`Stack with id ${STACK.stackName} does not exist`);
    error.name = "ValidationError";
    vi.spyOn(CloudFormationClient.prototype, "send").mockRejectedValue(error);

    await expect(getStackStatus(STACK)).resolves.toBeNull();
    await expect(getDeploymentOutputs(STACK))
        .rejects.toThrow(`CloudFormation stack ${STACK.stackName} was not found.`);
});

it.each([
    {initial: "REVIEW_IN_PROGRESS", settled: "CREATE_COMPLETE"},
    {initial: "CREATE_IN_PROGRESS", settled: "CREATE_COMPLETE"},
    {initial: "UPDATE_IN_PROGRESS", settled: "UPDATE_COMPLETE"},
    {initial: "UPDATE_COMPLETE_CLEANUP_IN_PROGRESS", settled: "UPDATE_COMPLETE"},
    {initial: "ROLLBACK_IN_PROGRESS", settled: "ROLLBACK_COMPLETE"},
    {initial: "UPDATE_ROLLBACK_IN_PROGRESS", settled: "UPDATE_ROLLBACK_COMPLETE"},
    {initial: "UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS", settled: "UPDATE_ROLLBACK_COMPLETE"},
    {initial: "DELETE_IN_PROGRESS", settled: null},
    {initial: "IMPORT_IN_PROGRESS", settled: "IMPORT_COMPLETE"},
    {initial: "IMPORT_ROLLBACK_IN_PROGRESS", settled: "IMPORT_ROLLBACK_COMPLETE"},
])("polls $initial until it settles", async ({initial, settled}) => {
    const send = vi.fn()
        .mockResolvedValueOnce({Stacks: [{StackStatus: initial}]})
        .mockResolvedValue({Stacks: null === settled ?
            [] :
            [{StackStatus: settled}]});

    vi.spyOn(CloudFormationClient.prototype, "send").mockImplementation(send);

    await expect(waitForStackToSettle(STACK)).resolves.toEqual(null === settled ?
        null :
        {StackStatus: settled});

    expect(send).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledExactlyOnceWith(
        STACK_STATUS_POLL_INTERVAL_MILLISECS,
        null,
        expect.any(Object),
    );
    expect(vi.mocked(sleep).mock.calls[0]?.[2]?.signal).toBeInstanceOf(AbortSignal);
});
