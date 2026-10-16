import {
    type DeploymentResponse,
    HTTP_STATUS_CONFLICT,
    HTTP_STATUS_NOT_FOUND,
    IAM_ROLE_ARN_PATTERN,
    type S3AccessFailureReason,
    S3BucketNameSchema,
    S3ObjectKeySchema,
} from "@cloud.yscope.com/server/contracts";

import type {ApiClient} from "~/lib/api-client";


type S3Input = {bucket: string; key: string};

/**
 * UI capability for an authorized, running deployment with its assigned S3 role. `verify` honors
 * cancellation, rejects API failures and unexpected responses, and resolves only after bucket
 * listing and object reads succeed.
 */
type S3Verifier = {
    deploymentId: string;
    roleArn: string;
    verify: (input: S3Input, signal: AbortSignal) => Promise<void>;
};

const HEX_RADIX = 16;

/**
 * Validates general purpose bucket names without changing exact object keys.
 *
 * @param input
 * @param input.bucket
 * @param input.key
 * @return Field-specific errors; empty strings indicate valid fields.
 */
const validateS3Input = ({bucket, key}: S3Input) => ({
    bucket: S3BucketNameSchema.safeParse(bucket).success ?
        "" :
        "Enter a general purpose bucket name, without s3:// or a path.",
    key: S3ObjectKeySchema.safeParse(key).success ?
        "" :
        "Enter an object key of 1 to 1,024 UTF-8 bytes.",
});

/**
 * Creates a deployment-specific bucket policy statement, adapted from dogfood.
 *
 * @param bucket The validated bucket name.
 * @param roleArn The deployment's AWS IAM role, never a wildcard principal.
 * @param deploymentId The deployment identity used to keep policy updates idempotent.
 * @return The JSON statement to merge into an existing policy.
 * @throws {Error} If the bucket, role ARN, or deployment identity is invalid.
 */
const buildS3PolicyStatement = (
    bucket: string,
    roleArn: string,
    deploymentId: string,
): string => {
    if (
        validateS3Input({bucket: bucket, key: "example"}).bucket ||
        !IAM_ROLE_ARN_PATTERN.test(roleArn) ||
        !deploymentId
    ) {
        throw new Error("A valid bucket and deployment role are required.");
    }
    const sid = Array.from(
        new TextEncoder().encode(deploymentId),
        (byte) => byte.toString(HEX_RADIX).padStart(2, "0"),
    ).join("");

    return JSON.stringify(
        {
            Action: ["s3:GetObject",
                "s3:ListBucket"],
            Effect: "Allow",
            Principal: {AWS: roleArn},
            Resource: [`arn:aws:s3:::${bucket}`,
                `arn:aws:s3:::${bucket}/*`],
            Sid: `AllowYScopeLogRead${sid}`,
        },
        null,
        2,
    );
};

/**
 * Builds a CLI workflow that preserves unrelated statements and uses temporary files.
 *
 * @param bucket The validated bucket name.
 * @param statement
 * @return A shell command for the user to review and run in their AWS environment.
 * @throws {Error} If the bucket is invalid or the statement is not JSON.
 */
const buildS3PolicyCommand = (bucket: string, statement: string): string => {
    if (validateS3Input({bucket: bucket, key: "example"}).bucket) {
        throw new Error("A valid bucket name is required.");
    }

    return [
        "(",
        "set -eu",
        "policy_dir=$(mktemp -d)",
        "trap 'rm -rf \"$policy_dir\"' EXIT",
        "cat > \"$policy_dir/statement.json\" <<'JSON'",
        JSON.stringify(JSON.parse(statement), null, 2),
        "JSON",
        "",
        `if aws s3api get-bucket-policy --bucket '${bucket}' \\`,
        '  --query Policy --output text > "$policy_dir/policy.json" 2> "$policy_dir/error"; then',
        "  :",
        'elif grep -q NoSuchBucketPolicy "$policy_dir/error"; then',
        '  printf \'%s\\n\' \'{"Version":"2012-10-17","Statement":[]}\' >' +
            ' "$policy_dir/policy.json"',
        "else",
        '  cat "$policy_dir/error" >&2',
        "  exit 1",
        "fi",
        "",
        'jq --slurpfile statement "$policy_dir/statement.json" \\',
        '  \'(.Statement // []) as $existing | .Version //= "2012-10-17" |',
        '   .Statement = ((if ($existing | type) == "array" then $existing else [$existing] end) |',
        "     map(select(.Sid != $statement[0].Sid)) + [$statement[0]])' \\",
        '  "$policy_dir/policy.json" > "$policy_dir/merged.json"',
        "",
        `aws s3api put-bucket-policy --bucket '${bucket}' \\`,
        '  --policy "file://$policy_dir/merged.json"',
        ")",
    ].join("\n");
};

const S3_ACCESS_FAILURE_MESSAGES = {
    access_denied: "The deployment role could not list the bucket or read the object." +
        " Check that the bucket policy grants s3:ListBucket and s3:GetObject to the role.",
    bucket_not_found: "The bucket does not exist.",
    object_archived: "The object is in an archive storage class and cannot be read." +
        " Choose an object in a readable storage class.",
    object_empty: "The object is empty. Choose a non-empty log object.",
    object_not_found: "The bucket is readable, but the object key does not exist." +
        " Use the object's exact key.",
    timed_out: "S3 did not respond in time. Try again.",
    unsupported_encryption: "The object uses encryption that the deployment role cannot" +
        " decrypt. SSE-KMS is not supported.",
} as const satisfies Record<S3AccessFailureReason, string>;

/**
 * Explains a rejected verification request without exposing response details.
 *
 * @param status The HTTP status of the rejected request.
 * @return A message the form can show as-is.
 */
const getVerificationErrorMessage = (status: number): string => {
    if (HTTP_STATUS_NOT_FOUND === status) {
        return "This deployment was not found. It may have been deleted.";
    }
    if (HTTP_STATUS_CONFLICT === status) {
        return "This deployment is not running. Try again once it is running.";
    }

    return "Unable to verify S3 access. Try again.";
};

/**
 * Binds the verification form to a deployment through the console API.
 *
 * @param apiClient
 * @param deployment The deployment whose S3 access role is checked.
 * @return The verifier, or null until the deployment is running with a role.
 */
const createS3Verifier = (
    apiClient: ApiClient,
    deployment: DeploymentResponse,
): S3Verifier | null => {
    const roleArn = deployment.status.s3_access_role_arn;
    if ("RUNNING" !== deployment.status.phase || "undefined" === typeof roleArn) {
        return null;
    }

    return {
        deploymentId: deployment._id,
        roleArn: roleArn,
        verify: async (input, signal) => {
            const response = await apiClient.api.v1.deployments[":id"]["verify-s3-access"].$post(
                {json: input, param: {id: deployment._id}},
                {init: {signal}},
            );

            if (!response.ok) {
                throw new Error(getVerificationErrorMessage(response.status));
            }

            const result = await response.json();
            if ("failed" === result.status) {
                throw new Error(S3_ACCESS_FAILURE_MESSAGES[result.reason]);
            }
        },
    };
};

export {
    buildS3PolicyCommand,
    buildS3PolicyStatement,
    createS3Verifier,
    type S3Input,
    type S3Verifier,
    validateS3Input,
};
