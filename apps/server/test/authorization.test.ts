import {Hono} from "hono";
import {
    expect,
    it,
} from "vitest";

import {requireAdmin} from "../src/authorization.js";
import {createErrorEnvelope} from "../src/contracts/error.js";
import type {ServerEnv} from "../src/environment.js";
import {
    HTTP_STATUS_FORBIDDEN,
    HTTP_STATUS_OK,
} from "../src/http-status.js";


/**
 * Creates a probe route with an authenticated authorization context.
 *
 * @param isAdmin Whether the request identity has the admin role, or `null` to
 * omit the authentication context.
 * @return The probe application.
 */
const createAuthorizationProbeApp = (isAdmin: boolean | null) => new Hono<ServerEnv>()
    .use("*", async (context, next) => {
        if (null !== isAdmin) {
            context.set("isAdmin", isAdmin);
        }
        await next();
    })
    .get(
        "/admin",
        requireAdmin,
        (context) => context.json({ok: true}, HTTP_STATUS_OK),
    );

it("continues an admin request", async () => {
    const response = await createAuthorizationProbeApp(true).request("/admin");

    expect(response.status).toBe(HTTP_STATUS_OK);
    await expect(response.json()).resolves.toEqual({ok: true});
});

it.each([
    {
        isAdmin: false,
        name: "a non-admin identity",
    },
    {
        isAdmin: null,
        name: "an unpopulated admin flag",
    },
])("rejects $name with the public forbidden error", async ({isAdmin}) => {
    const response = await createAuthorizationProbeApp(isAdmin).request(
        "/admin",
    );

    expect(response.status).toBe(HTTP_STATUS_FORBIDDEN);
    await expect(response.json()).resolves.toEqual(
        createErrorEnvelope("forbidden"),
    );
});
