import * as z from "zod";


const S3_OBJECT_KEY_BYTES_MAX = 1024;

const IAM_ROLE_ARN_PATTERN = /^arn:aws(?:-[a-z]+)*:iam::\d{12}:role\/[\w+=,.@/-]+$/u;

const S3BucketNameSchema = z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/u)
    .refine((bucket) => !bucket.includes(".."))
    .refine((bucket) => !(/^\d+\.\d+\.\d+\.\d+$/u).test(bucket))
    .refine((bucket) => !(/^(?:xn--|sthree-|amzn-s3-demo-)/u).test(bucket))
    .refine((bucket) => !(/(?:-s3alias|--ol-s3|\.mrap|--x-s3|--table-s3)$/u).test(bucket));

const S3ObjectKeySchema = z.string().min(1)
    .refine((key) => S3_OBJECT_KEY_BYTES_MAX >= new TextEncoder().encode(key).length);

const S3AccessFailureReasonSchema = z.enum([
    "access_denied",
    "bucket_not_found",
    "object_archived",
    "object_empty",
    "object_not_found",
    "timed_out",
    "unsupported_encryption",
]);

const VerifyS3AccessRequestSchema = z.strictObject({
    bucket: S3BucketNameSchema,
    key: S3ObjectKeySchema,
});

const VerifyS3AccessResponseSchema = z.discriminatedUnion("status", [
    z.strictObject({
        status: z.literal("verified"),
    }),
    z.strictObject({
        reason: S3AccessFailureReasonSchema,
        status: z.literal("failed"),
    }),
]);

type S3AccessFailureReason = z.infer<typeof S3AccessFailureReasonSchema>;

type VerifyS3AccessRequest = z.infer<typeof VerifyS3AccessRequestSchema>;

type VerifyS3AccessResponse = z.infer<typeof VerifyS3AccessResponseSchema>;

export {
    IAM_ROLE_ARN_PATTERN,
    type S3AccessFailureReason,
    S3AccessFailureReasonSchema,
    S3BucketNameSchema,
    S3ObjectKeySchema,
    type VerifyS3AccessRequest,
    VerifyS3AccessRequestSchema,
    type VerifyS3AccessResponse,
    VerifyS3AccessResponseSchema,
};
