import {
    expect,
    it,
    vi,
} from "vitest";

import {createApp} from "../src/app.js";
import {createLocalIdentityVerifier} from "../src/authentication.js";
import {
    createErrorEnvelope,
    type ErrorCode,
} from "../src/contracts/error.js";
import {
    HTTP_STATUS_FORBIDDEN,
    HTTP_STATUS_OK,
    HTTP_STATUS_UNAUTHORIZED,
} from "../src/http-status.js";
import {createRejectAllIdentityVerifier} from "./identity-verifier-fixture.js";


const AUTH0_ISSUER = "https://tenant.auth0.com/";
const CLAIM_NAMESPACE = "https://cloud.yscope.com";

const LOCAL_IDENTITIES = new Map<string, unknown>([
    [
        "foreign-issuer-token",
        {
            [`${CLAIM_NAMESPACE}/email`]: "foreign@example.com",
            [`${CLAIM_NAMESPACE}/roles`]: ["reader"],
            iss: "https://accounts.example.com/",
            sub: "auth0|user",
        },
    ],
    [
        "foreign-subject-token",
        {
            [`${CLAIM_NAMESPACE}/email`]: "foreign@example.com",
            [`${CLAIM_NAMESPACE}/roles`]: ["reader"],
            iss: AUTH0_ISSUER,
            sub: "google-oauth2|user",
        },
    ],
    [
        "malformed-claims-token",
        {
            [`${CLAIM_NAMESPACE}/email`]: "member@example.com",
            [`${CLAIM_NAMESPACE}/roles`]: "reader",
            iss: AUTH0_ISSUER,
            sub: "auth0|member-user",
        },
    ],
    [
        "malformed-email-token",
        {
            [`${CLAIM_NAMESPACE}/email`]: 7,
            [`${CLAIM_NAMESPACE}/roles`]: ["reader"],
            iss: AUTH0_ISSUER,
            sub: "auth0|member-user",
        },
    ],
]);

const unauthorizedAuthorizationCases = [
    "Basic rejected-token",
    "Bearer rejected-token",
    "Bearer token with-spaces",
    "Bearer token!",
    "Bearer foreign-issuer-token",
];

const forbiddenIdentityTokens = [
    "foreign-subject-token",
    "malformed-claims-token",
    "malformed-email-token",
];

/**
 * Creates an app with a test-only route behind the authentication boundary.
 *
 * @return A console API app with the protected probe route.
 */
const createAuthenticationProbeApp = () => {
    const identityVerifier = createLocalIdentityVerifier({
        auth0Issuer: AUTH0_ISSUER,
        identities: LOCAL_IDENTITIES,
    });

    return createApp({identityVerifier: identityVerifier}).get(
        "/api/v1/authentication-probe",
        (context) => context.json({ok: true}, HTTP_STATUS_OK),
    );
};

/**
 * Checks that a response carries the public rejection contract only.
 *
 * @param response The response under test.
 * @param code The expected public error code.
 * @param status The expected HTTP status.
 * @return A promise that resolves after all assertions pass.
 */
const expectRejection = async (
    response: Response,
    code: Extract<ErrorCode, "forbidden" | "unauthorized">,
    status: number,
): Promise<void> => {
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual(createErrorEnvelope(code));
    expect(response.headers.get("WWW-Authenticate")).toBe(
        HTTP_STATUS_UNAUTHORIZED === status ?
            "Bearer" :
            null,
    );
};

it("keeps health public without consulting the identity verifier", async () => {
    const verify = vi.fn(() => Promise.reject(
        new Error("must not verify health requests"),
    ));
    const app = createApp({
        identityVerifier: {
            auth0Issuer: AUTH0_ISSUER,
            verify: verify,
        },
    });

    const response = await app.request("/api/v1/health", {
        headers: {Authorization: "Basic ignored-for-public-health"},
    });

    expect(response.status).toBe(HTTP_STATUS_OK);
    await expect(response.json()).resolves.toEqual({status: "ok"});
    expect(verify).not.toHaveBeenCalled();
});

it("rejects a missing bearer token", async () => {
    const response = await createAuthenticationProbeApp().request(
        "/api/v1/authentication-probe",
    );

    await expectRejection(response, "unauthorized", HTTP_STATUS_UNAUTHORIZED);
});

it.each(unauthorizedAuthorizationCases)(
    "rejects %s as unauthorized",
    async (authorization) => {
        const response = await createAuthenticationProbeApp().request(
            "/api/v1/authentication-probe",
            {headers: {Authorization: authorization}},
        );

        await expectRejection(
            response,
            "unauthorized",
            HTTP_STATUS_UNAUTHORIZED,
        );
    },
);

it.each(forbiddenIdentityTokens)(
    "rejects the non-Auth0 identity in %s as forbidden",
    async (token) => {
        const response = await createAuthenticationProbeApp().request(
            "/api/v1/authentication-probe",
            {headers: {Authorization: `Bearer ${token}`}},
        );

        await expectRejection(response, "forbidden", HTTP_STATUS_FORBIDDEN);
    },
);

it("treats an undefined verifier result as rejected credentials", async () => {
    const app = createApp({
        identityVerifier: {
            auth0Issuer: AUTH0_ISSUER,
            verify: () => Promise.resolve(),
        },
    });
    const response = await app.request("/api/v1/missing", {
        headers: {Authorization: "Bearer rejected-token"},
    });

    await expectRejection(response, "unauthorized", HTTP_STATUS_UNAUTHORIZED);
});

it("rejects every protected request with the unconfigured default verifier", async () => {
    const response = await createApp({
        identityVerifier: createRejectAllIdentityVerifier(),
    }).request("/api/v1/missing", {
        headers: {Authorization: "Bearer any-token"},
    });

    await expectRejection(response, "unauthorized", HTTP_STATUS_UNAUTHORIZED);
});

it("shadows unknown protected routes behind the boundary", async () => {
    const response = await createApp({
        identityVerifier: createRejectAllIdentityVerifier(),
    }).request("/api/v1/missing");

    await expectRejection(response, "unauthorized", HTTP_STATUS_UNAUTHORIZED);
});

it("passes the response's request ID to the verifier", async () => {
    const verify = vi.fn(() => Promise.resolve(null));
    const app = createApp({
        identityVerifier: {
            auth0Issuer: AUTH0_ISSUER,
            verify: verify,
        },
    });

    const response = await app.request("/api/v1/missing", {
        headers: {Authorization: "Bearer rejected-token"},
    });

    expect(verify).toHaveBeenCalledWith(
        "rejected-token",
        response.headers.get("X-Request-Id"),
    );
});
