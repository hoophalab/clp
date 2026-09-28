import * as z from "zod";


const ALIAS_LENGTH_MAX = 100;

// The selector: 16 random bytes, base64url without padding.
const TOKEN_ID_LENGTH = 22;

const TokenIdSchema = z.string().length(TOKEN_ID_LENGTH)
    .regex(/^[A-Za-z0-9_-]+$/u);

const TokenIdParamSchema = z.strictObject({
    id: TokenIdSchema,
});

const AliasSchema = z.string().trim()
    .min(1)
    .max(ALIAS_LENGTH_MAX);

/**
 * The current status of the token. `revoking` means revocation was requested but
 * a cached copy may still be honoured until `revocation_effective_at`.
 */
const ApiTokenStatusSchema = z.enum([
    "active",
    "revoking",
    "expired",
]);

/**
 * An API token as returned to the client.
 *
 * `user_id` is the full Auth0 subject (`auth0|…`) of whoever created the token.
 */
const ApiTokenResponseSchema = z.strictObject({
    alias: z.string(),
    created_at: z.iso.datetime(),
    deployment_id: z.string(),
    deployment_name: z.string(),
    expires_at: z.iso.datetime(),
    id: TokenIdSchema,
    revocation_effective_at: z.iso.datetime().nullable(),
    revoked_at: z.iso.datetime().nullable(),
    status: ApiTokenStatusSchema,
    user_id: z.string(),
});

const CreateApiTokenRequestSchema = z.strictObject({
    alias: AliasSchema,
    deployment_id: z.string().min(1),
    expires_at: z.iso.datetime(),
});

/**
 * The only time the plaintext token is ever returned.
 */
const CreateApiTokenResponseSchema = ApiTokenResponseSchema.extend({
    plaintext_token: z.string(),
});

const ListApiTokensQuerySchema = z.strictObject({
    deployment: z.string().min(1)
        .optional(),
});

/**
 * `unreachable_regions` is always empty for now: any cluster that cannot be
 * reached fails the whole request instead. The field is in the contract so
 * that reporting partial results later does not change the response shape.
 */
const ListApiTokensResponseSchema = z.strictObject({
    tokens: z.array(ApiTokenResponseSchema),
    unreachable_regions: z.array(z.string()),
});

const UpdateApiTokenRequestSchema = z.strictObject({
    alias: AliasSchema,
});

type ApiTokenResponse = z.infer<typeof ApiTokenResponseSchema>;

type ApiTokenStatus = z.infer<typeof ApiTokenStatusSchema>;

type CreateApiTokenRequest = z.infer<typeof CreateApiTokenRequestSchema>;

type CreateApiTokenResponse = z.infer<typeof CreateApiTokenResponseSchema>;

type ListApiTokensResponse = z.infer<typeof ListApiTokensResponseSchema>;

type UpdateApiTokenRequest = z.infer<typeof UpdateApiTokenRequestSchema>;

export {
    type ApiTokenResponse,
    ApiTokenResponseSchema,
    type ApiTokenStatus,
    ApiTokenStatusSchema,
    type CreateApiTokenRequest,
    CreateApiTokenRequestSchema,
    type CreateApiTokenResponse,
    CreateApiTokenResponseSchema,
    ListApiTokensQuerySchema,
    type ListApiTokensResponse,
    ListApiTokensResponseSchema,
    TokenIdParamSchema,
    type UpdateApiTokenRequest,
    UpdateApiTokenRequestSchema,
};
