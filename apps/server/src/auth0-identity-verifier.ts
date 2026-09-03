import {
    createRemoteJWKSet,
    jwtVerify,
    type JWTVerifyGetKey,
} from "jose";

import type {IdentityVerifier} from "./authentication.js";


type Auth0IdentityVerifierOptions = {
    audience: string;
    domain: string;
};

/**
 * Creates a verifier backed by an Auth0 tenant's remote JSON Web Key Set.
 *
 * @param options The trusted Auth0 API token contract.
 * @param options.audience The exact Auth0 API audience to accept.
 * @param options.domain The Auth0 tenant domain without a URL scheme.
 * @param createJwkSet Creates the tenant's remote-key resolver.
 * @return An identity verifier for production bearer tokens.
 * @throws {Error} When the tenant domain is not a bare hostname.
 */
const createAuth0IdentityVerifier = (
    {audience, domain}: Auth0IdentityVerifierOptions,
    createJwkSet: (url: URL) => JWTVerifyGetKey = createRemoteJWKSet,
): IdentityVerifier => {
    const auth0Issuer = `https://${domain.toLowerCase()}/`;
    const parsedIssuer = URL.canParse(auth0Issuer) ?
        new URL(auth0Issuer) :
        null;

    if (
        null === parsedIssuer ||
        parsedIssuer.href !== auth0Issuer ||
        parsedIssuer.hostname !== domain.toLowerCase()
    ) {
        throw new Error("AUTH0_DOMAIN must be a hostname without a URL scheme or path.");
    }
    const keySet = createJwkSet(
        new URL(".well-known/jwks.json", auth0Issuer),
    );

    return {
        auth0Issuer: auth0Issuer,
        verify: async (token) => {
            try {
                const {payload} = await jwtVerify(token, keySet, {
                    algorithms: ["RS256"],
                    audience: audience,
                    issuer: auth0Issuer,
                    requiredClaims: [
                        "exp",
                        "sub",
                    ],
                });

                return payload;
            } catch {
                return null;
            }
        },
    };
};

export {createAuth0IdentityVerifier};
export type {Auth0IdentityVerifierOptions};
