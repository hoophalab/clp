import type {
    Context,
    MiddlewareHandler,
} from "hono";
import * as z from "zod";

import {createErrorEnvelope} from "./contracts/error.js";
import type {ServerEnv} from "./environment.js";
import {
    HTTP_STATUS_FORBIDDEN,
    HTTP_STATUS_UNAUTHORIZED,
} from "./http-status.js";


const ADMIN_ROLE = "admin";

/**
 * Namespace prefixing the tenant's custom claims.
 *
 * This must match the Auth0 post-login Action byte for byte, or the claim
 * lookups below silently miss and every identity reads as an admin-less user
 * with no email. The Action declares the namespace with a trailing slash and
 * concatenates the claim name onto it, so the separator belongs to the claim
 * constants here rather than to the namespace.
 */
const CLAIM_NAMESPACE = "https://cloud.yscope.com";
const EMAIL_CLAIM = `${CLAIM_NAMESPACE}/email`;

/**
 * Roles claim backing {@link ADMIN_ROLE}.
 *
 * The tenant's post-login Action fills this from `event.authorization.roles`,
 * so a role must be named exactly {@link ADMIN_ROLE} — the membership test is
 * case-sensitive, and `Admin` would leave an administrator without access.
 *
 * Auth0 populates `event.authorization` only when RBAC is enabled on the API
 * the token was requested for. Where it is absent the Action sets no custom
 * claims at all, and every identity then reads as an admin-less user with no
 * email rather than failing outright.
 */
const ROLES_CLAIM = `${CLAIM_NAMESPACE}/roles`;
const bearerAuthorizationPattern = /^Bearer ([A-Za-z0-9._~+/-]+=*)$/iu;
const auth0SubjectPattern = /^auth0\|([^|]+)$/u;

const VerifiedTokenClaimsSchema = z.object({
    iss: z.string().min(1),
    sub: z.string().min(1),
});

const IdentityAttributesSchema = z.object({
    [EMAIL_CLAIM]: z.string().default(""),
    [ROLES_CLAIM]: z.array(z.string()).default([]),
});

type IdentityVerifier = {
    readonly auth0Issuer: string;

    /**
     * Verifies a bearer token.
     *
     * @param token The bearer token presented by the caller.
     * @param requestId Correlates a rejection the verifier reports with the
     * request that carried the token. Observability only; a verifier must never
     * let it influence the verification decision.
     * @return The verified claims, or a nullish value when the token is
     * rejected.
     */
    verify: (token: string, requestId: string) => Promise<unknown>;
};

type LocalIdentityVerifierOptions = {
    auth0Issuer: string;
    identities: ReadonlyMap<string, unknown>;
};

/**
 * Creates an in-memory identity verifier for deterministic local use and tests.
 *
 * @param options The trusted issuer and token-to-claims mapping.
 * @param options.auth0Issuer The exact Auth0 issuer to trust.
 * @param options.identities The local token-to-claims mapping.
 * @return A side-effect-free identity verifier.
 */
const createLocalIdentityVerifier = (
    {auth0Issuer, identities}: LocalIdentityVerifierOptions,
): IdentityVerifier => ({
    auth0Issuer: auth0Issuer,
    verify: (token) => Promise.resolve(identities.get(token) ?? null),
});

/**
 * Returns the public authentication error without exposing credential details.
 *
 * @param context The active Hono request context.
 * @return The safe unauthorized response.
 */
const rejectUnauthorized = (context: Context<ServerEnv>) => context.json(
    createErrorEnvelope("unauthorized"),
    HTTP_STATUS_UNAUTHORIZED,
    {"WWW-Authenticate": "Bearer"},
);

/**
 * Returns the public authorization error without exposing identity details.
 *
 * @param context The active Hono request context.
 * @return The safe forbidden response.
 */
const rejectForbidden = (context: Context<ServerEnv>) => context.json(
    createErrorEnvelope("forbidden"),
    HTTP_STATUS_FORBIDDEN,
);

/**
 * Creates the protected API boundary for a supplied identity verifier.
 *
 * @param identityVerifier The verifier used to authenticate bearer tokens.
 * @return Hono middleware that establishes the authenticated request context.
 */
const createAuthenticationMiddleware = (
    identityVerifier: IdentityVerifier,
): MiddlewareHandler<ServerEnv> => async (context, next) => {
    const authorization = context.req.header("Authorization");
    const token = authorization ?
        (bearerAuthorizationPattern.exec(authorization)?.[1] ?? null) :
        null;

    if (null === token) {
        return rejectUnauthorized(context);
    }

    const verificationResult = await identityVerifier.verify(
        token,
        context.get("requestId"),
    );

    if (null === verificationResult || "undefined" === typeof verificationResult) {
        return rejectUnauthorized(context);
    }

    const parsedTokenClaims = VerifiedTokenClaimsSchema.safeParse(verificationResult);
    if (
        !parsedTokenClaims.success ||
        identityVerifier.auth0Issuer !== parsedTokenClaims.data.iss
    ) {
        return rejectUnauthorized(context);
    }

    const parsedAttributes = IdentityAttributesSchema.safeParse(verificationResult);
    const subjectMatch = auth0SubjectPattern.exec(parsedTokenClaims.data.sub);
    const userId = subjectMatch?.[1];
    if (!parsedAttributes.success || "undefined" === typeof userId) {
        return rejectForbidden(context);
    }

    context.set("email", parsedAttributes.data[EMAIL_CLAIM]);
    context.set(
        "isAdmin",
        parsedAttributes.data[ROLES_CLAIM].includes(ADMIN_ROLE),
    );
    context.set("userId", userId);

    return next();
};

export {
    createAuthenticationMiddleware,
    createLocalIdentityVerifier,
};
export type {IdentityVerifier};
