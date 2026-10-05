import {
    createHash,
    randomBytes,
} from "node:crypto";

import type {ApiTokenStatus} from "../contracts/api-token.js";


// The byte sizes of the token's ID and secret. Changing these will break the
// auth server's validation regex.
const SELECTOR_BYTES = 16;
const SECRET_BYTES = 32;
const TOKEN_PREFIX = "ysclp_";

/**
 * The auth server's cache TTL. Revoked tokens may still be accepted during this window.
 *
 * WARNING: This must be kept in sync with:
 * - `accessCache.ttlSeconds` in `infra/auth-server/chart/values.yaml`
 * - `DEFAULT_ACCESS_CACHE_TTL_SECONDS` in `infra/auth-server/src/main.rs`
 * - `REVOKE_WARNING` in `apps/web/src/components/api-token-row-actions.tsx`
 */
const AUTH_SERVER_CACHE_TTL_SECONDS = 60;
const MILLISECONDS_PER_SECOND = 1000;

type GeneratedToken = {
    /** The plaintext token, shown to the user once. */
    plaintext: string;

    /** SHA-256 of the secret half; what the database stores. */
    secretHash: Buffer;

    /** The public half; the row's primary key. */
    selector: Buffer;
};

/**
 * Generates a new token.
 *
 * The token is ysclp_<selector><secret>
 *
 * @return The plaintext and the two values to persist.
 */
const generateToken = (): GeneratedToken => {
    const selector = randomBytes(SELECTOR_BYTES);
    const secret = randomBytes(SECRET_BYTES);
    const plaintext = TOKEN_PREFIX +
        selector.toString("base64url") +
        secret.toString("base64url");

    return {
        plaintext: plaintext,
        secretHash: createHash("sha256").update(secret)
            .digest(),
        selector: selector,
    };
};

/**
 * Encodes a selector as the token's public ID.
 *
 * @param selector
 * @return 22 base64url characters; the first half of the plaintext token.
 */
const encodeTokenId = (selector: Buffer): string => selector.toString("base64url");

/**
 * Decodes a public token ID back to its selector.
 *
 * @param id
 * @return The selector, or null when the ID is not a well-formed selector.
 */
const decodeTokenId = (id: string): Buffer | null => {
    const selector = Buffer.from(id, "base64url");

    // Buffer.from silently drops invalid characters, so round-trip to be sure
    // the input was exactly one selector.
    return SELECTOR_BYTES === selector.length && encodeTokenId(selector) === id ?
        selector :
        null;
};

type TokenTimestamps = {
    expiresAt: Date;
    revokedAt: Date | null;
};

/**
 * When the auth server stops honouring a token, given when it was revoked.
 *
 * @param timestamps
 * @param timestamps.expiresAt The expiry the token was created with.
 * @param timestamps.revokedAt When revocation was requested, if it was.
 * @return The earlier of the expiry and the end of the revocation grace
 * window, or null when the token has not been revoked.
 */
const computeRevocationEffectiveAt = (
    {expiresAt, revokedAt}: TokenTimestamps,
): Date | null => {
    if (null === revokedAt) {
        return null;
    }

    const graceEndsAt = new Date(
        revokedAt.getTime() + (AUTH_SERVER_CACHE_TTL_SECONDS * MILLISECONDS_PER_SECOND),
    );

    return graceEndsAt < expiresAt ?
        graceEndsAt :
        expiresAt;
};

/**
 * Where a token is in its life, as of `now`.
 *
 * @param timestamps
 * @param now
 * @return `expired` once nothing will honour the token, `revoking` while a
 * revoked token may still be cached somewhere, otherwise `active`.
 */
const computeTokenStatus = (
    timestamps: TokenTimestamps,
    now: Date,
): ApiTokenStatus => {
    const honouredUntil = computeRevocationEffectiveAt(timestamps) ?? timestamps.expiresAt;

    if (honouredUntil <= now) {
        return "expired";
    }

    return null === timestamps.revokedAt ?
        "active" :
        "revoking";
};

export {
    AUTH_SERVER_CACHE_TTL_SECONDS,
    computeRevocationEffectiveAt,
    computeTokenStatus,
    decodeTokenId,
    encodeTokenId,
    generateToken,
};
