import {
    expect,
    it,
} from "vitest";

import {createApp} from "../src/app.js";
import {createLocalIdentityVerifier} from "../src/authentication.js";
import {HTTP_STATUS_OK} from "../src/http-status.js";


const AUTH0_ISSUER = "https://tenant.auth0.com/";
const CLAIM_NAMESPACE = "https://cloud.yscope.com";

const LOCAL_IDENTITIES = new Map<string, unknown>([
    [
        "admin-token",
        {
            [`${CLAIM_NAMESPACE}/email`]: "admin@example.com",
            [`${CLAIM_NAMESPACE}/roles`]: [
                "admin",
                "reader",
            ],
            iss: AUTH0_ISSUER,
            sub: "auth0|admin-user",
        },
    ],
    [
        "member-token",
        {
            [`${CLAIM_NAMESPACE}/email`]: "member@example.com",
            [`${CLAIM_NAMESPACE}/roles`]: ["reader"],
            iss: AUTH0_ISSUER,
            sub: "auth0|member-user",
        },
    ],
    [
        "claimless-token",
        {
            iss: AUTH0_ISSUER,
            sub: "auth0|claimless-user",
        },
    ],
]);

const authenticatedContextCases = [
    {
        expected: {
            email: "admin@example.com",
            isAdmin: true,
            userId: "admin-user",
        },
        name: "an admin identity",
        token: "admin-token",
    },
    {
        expected: {
            email: "member@example.com",
            isAdmin: false,
            userId: "member-user",
        },
        name: "a member identity",
        token: "member-token",
    },
    {
        expected: {
            email: "",
            isAdmin: false,
            userId: "claimless-user",
        },
        name: "an identity without optional attribute claims",
        token: "claimless-token",
    },
] as const;

/**
 * Creates an app with a test-only route that returns authenticated context.
 *
 * @return A console API app with the protected probe route.
 */
const createContextProbeApp = () => {
    const identityVerifier = createLocalIdentityVerifier({
        auth0Issuer: AUTH0_ISSUER,
        identities: LOCAL_IDENTITIES,
    });

    return createApp({identityVerifier: identityVerifier}).get(
        "/api/v1/authentication-probe",
        (context) => context.json(
            {
                email: context.get("email"),
                isAdmin: context.get("isAdmin"),
                userId: context.get("userId"),
            },
            HTTP_STATUS_OK,
        ),
    );
};

it.each(authenticatedContextCases)(
    "establishes the authenticated context for $name",
    async ({expected, token}) => {
        const response = await createContextProbeApp().request(
            "/api/v1/authentication-probe",
            {headers: {Authorization: `Bearer ${token}`}},
        );

        expect(response.status).toBe(HTTP_STATUS_OK);
        await expect(response.json()).resolves.toEqual(expected);
    },
);

it("reads the exact claim key the tenant's Action writes", async () => {
    const identityVerifier = createLocalIdentityVerifier({
        auth0Issuer: AUTH0_ISSUER,
        identities: new Map<string, unknown>([
            [
                "action-shaped-token",

                // Spelled out rather than built from CLAIM_NAMESPACE: this
                // pins the wire format, so renaming the constant in the source
                // and the tests together can no longer hide a mismatch with
                // the Auth0 Action.
                {
                    "https://cloud.yscope.com/email": "member@example.com",
                    "iss": AUTH0_ISSUER,
                    "sub": "auth0|member-user",
                },
            ],
        ]),
    });
    const app = createApp({identityVerifier: identityVerifier}).get(
        "/api/v1/authentication-probe",
        (context) => context.json(
            {email: context.get("email")},
            HTTP_STATUS_OK,
        ),
    );

    const response = await app.request("/api/v1/authentication-probe", {
        headers: {Authorization: "Bearer action-shaped-token"},
    });

    expect(response.status).toBe(HTTP_STATUS_OK);
    await expect(response.json()).resolves.toEqual({
        email: "member@example.com",
    });
});
