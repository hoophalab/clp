import {
    createLocalJWKSet,
    exportJWK,
    generateKeyPair,
    type JWK,
    type JWTVerifyGetKey,
    SignJWT,
} from "jose";
import {
    beforeAll,
    expect,
    it,
    vi,
} from "vitest";

import {createAuth0IdentityVerifier} from "../src/auth0-identity-verifier.js";


const AUTH0_AUDIENCE = "https://api.example.test";
const AUTH0_DOMAIN = "tenant.auth0.com";
const AUTH0_ISSUER = `https://${AUTH0_DOMAIN}/`;
const REQUEST_ID = "test-request-id";
const SUBJECT = "auth0|user-id";

const AUTH0_OPTIONS = {
    audience: AUTH0_AUDIENCE,
    domain: AUTH0_DOMAIN,
};

type TokenOptions = {
    audience?: string | string[];
    expirationTime?: null | number | string;
    issuer?: string;
    subject?: null | string;
};

/**
 * Creates a local RSA signer and matching JWKS for deterministic JWT tests.
 *
 * @param keyId The key ID placed in both the JWT and JWKS.
 * @return A token signer and local JWKS resolver.
 */
const createSigningFixture = async (keyId: string) => {
    const {privateKey, publicKey} = await generateKeyPair("RS256", {
        extractable: true,
    });
    const publicJwk: JWK = {
        ...await exportJWK(publicKey),
        alg: "RS256",
        kid: keyId,
        use: "sig",
    };

    return {
        createToken: ({
            audience = AUTH0_AUDIENCE,
            expirationTime = "5m",
            issuer = AUTH0_ISSUER,
            subject = SUBJECT,
        }: TokenOptions = {}) => {
            let token = new SignJWT({})
                .setProtectedHeader({alg: "RS256", kid: keyId})
                .setIssuer(issuer)
                .setAudience(audience)
                .setIssuedAt();

            if (null !== expirationTime) {
                token = token.setExpirationTime(expirationTime);
            }
            if (null !== subject) {
                token = token.setSubject(subject);
            }

            return token.sign(privateKey);
        },
        keySet: createLocalJWKSet({keys: [publicJwk]}),
    };
};

let createTrustedToken: (options?: TokenOptions) => Promise<string>;
let createUntrustedToken: () => Promise<string>;
let trustedKeySet: JWTVerifyGetKey;

beforeAll(async () => {
    const trustedFixture = await createSigningFixture("trusted-key");
    const untrustedFixture = await createSigningFixture("trusted-key");

    ({
        createToken: createTrustedToken,
        keySet: trustedKeySet,
    } = trustedFixture);
    ({createToken: createUntrustedToken} = untrustedFixture);
});

it("uses the tenant JWKS and verifies the required Auth0 token contract", async () => {
    const createJwkSet = vi.fn(() => trustedKeySet);
    const verifier = createAuth0IdentityVerifier(
        AUTH0_OPTIONS,
        createJwkSet,
    );
    const token = await createTrustedToken();

    await expect(verifier.verify(token, REQUEST_ID)).resolves.toMatchObject({
        aud: AUTH0_AUDIENCE,
        iss: AUTH0_ISSUER,
        sub: SUBJECT,
    });
    expect(verifier.auth0Issuer).toBe(AUTH0_ISSUER);
    expect(createJwkSet).toHaveBeenCalledWith(
        new URL(`${AUTH0_ISSUER}.well-known/jwks.json`),
    );
});

it("accepts the multi-valued audience Auth0 actually issues", async () => {
    const verifier = createAuth0IdentityVerifier(
        AUTH0_OPTIONS,
        () => trustedKeySet,
    );

    // Requesting the `openid` scope makes Auth0 add the tenant's userinfo
    // endpoint alongside the API, so a real access token carries an array here
    // rather than the bare string the other cases sign.
    const token = await createTrustedToken({
        audience: [
            AUTH0_AUDIENCE,
            `${AUTH0_ISSUER}userinfo`,
        ],
    });

    await expect(verifier.verify(token, REQUEST_ID)).resolves.not.toBeNull();
});

const invalidTokenCases = [
    {
        name: "issuer",
        token: () => createTrustedToken({
            issuer: "https://other.auth0.com/",
        }),
    },
    {
        name: "audience",
        token: () => createTrustedToken({
            audience: "https://other-api.example.com",
        }),
    },
    {
        name: "signature",
        token: () => createUntrustedToken(),
    },
    {
        name: "subject",
        token: () => createTrustedToken({subject: null}),
    },
    {
        name: "expiration claim",
        token: () => createTrustedToken({expirationTime: null}),
    },
    {
        name: "expiration time",
        token: () => createTrustedToken({expirationTime: 0}),
    },
];

it.each(invalidTokenCases)(
    "rejects a token with an invalid $name",
    async ({token}) => {
        const verifier = createAuth0IdentityVerifier(
            AUTH0_OPTIONS,
            () => trustedKeySet,
        );

        await expect(verifier.verify(await token(), REQUEST_ID)).resolves.toBeNull();
    },
);

it.each([
    "[",
    "https://tenant.auth0.com",
])("rejects non-hostname Auth0 domain %s", (domain) => {
    const createJwkSet = vi.fn(() => trustedKeySet);

    expect(() => createAuth0IdentityVerifier(
        {
            audience: AUTH0_AUDIENCE,
            domain: domain,
        },
        createJwkSet,
    )).toThrow("AUTH0_DOMAIN must be a hostname without a URL scheme or path.");
    expect(createJwkSet).not.toHaveBeenCalled();
});
