import {
    createLocalIdentityVerifier,
    type IdentityVerifier,
} from "../src/authentication.js";


const UNREACHABLE_ISSUER = "urn:yscope:test:unconfigured";

/**
 * Creates a verifier that rejects every credential.
 *
 * @return A verifier holding no identities, pinned to an issuer no token uses.
 */
const createRejectAllIdentityVerifier = (): IdentityVerifier => (
    createLocalIdentityVerifier({
        auth0Issuer: UNREACHABLE_ISSUER,
        identities: new Map<string, unknown>(),
    })
);

export {createRejectAllIdentityVerifier};
