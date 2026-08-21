import * as z from "zod";


const ErrorCodeSchema = z.enum([
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
