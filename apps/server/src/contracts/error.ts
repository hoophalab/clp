import * as z from "zod";


const ErrorCodeSchema = z.enum([
    "NAME_TAKEN",
    "UNKNOWN_CLUSTER_TARGET",
    "VERSION_NOT_FOUND",
    "forbidden",
    "internal_server_error",
    "invalid_request",
    "not_found",
    "unauthorized",
]);

const ErrorEnvelopeSchema = z.strictObject({
    error: z.strictObject({
        code: ErrorCodeSchema,
        message: z.string().min(1),
    }),
});

type ErrorCode = z.infer<typeof ErrorCodeSchema>;

type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

const PublicErrorMessages = {
    NAME_TAKEN: "The deployment name is already in use.",
    UNKNOWN_CLUSTER_TARGET: "The target cluster is invalid.",
    VERSION_NOT_FOUND: "The chart version doesn't exist.",
    forbidden: "Access to the requested resource is denied.",
    internal_server_error: "An unexpected error occurred.",
    invalid_request: "The request is invalid.",
    not_found: "The requested resource was not found.",
    unauthorized: "Authentication is required.",
} as const satisfies Record<ErrorCode, string>;

/**
 * Creates and runtime-validates the single public error envelope.
 *
 * Messages come from a fixed public mapping so validation details, exception
 * messages, and other internal data cannot be copied into an API response.
 *
 * @param code The stable public error code.
 * @return The validated public error envelope.
 */
const createErrorEnvelope = (code: ErrorCode): ErrorEnvelope => (
    ErrorEnvelopeSchema.parse({
        error: {
            code: code,
            message: PublicErrorMessages[code],
        },
    })
);

export {
    createErrorEnvelope,
    type ErrorCode,
    ErrorCodeSchema,
    type ErrorEnvelope,
    ErrorEnvelopeSchema,
};
