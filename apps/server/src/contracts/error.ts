import * as z from "zod";


const ErrorCodeSchema = z.enum([
    "internal_server_error",
    "invalid_request",
    "not_found",
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
    internal_server_error: "An unexpected error occurred.",
    invalid_request: "The request is invalid.",
    not_found: "The requested resource was not found.",
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
