import {Hono} from "hono";
import {requestId} from "hono/request-id";
import {
    afterEach,
    expect,
    it,
    vi,
} from "vitest";

import {createApp} from "../src/app.js";
import type {ServerEnv} from "../src/environment.js";
import {handleAppError} from "../src/errors.js";
import {HTTP_STATUS_INTERNAL_SERVER_ERROR} from "../src/http-status.js";
import {createRejectAllIdentityVerifier} from "./identity-verifier-fixture.js";


const REQUEST_ID_HEADER = "X-Request-Id";
const REQUEST_ID_PATTERN = /^[\w-]+$/u;

const unexpectedErrorTestApp = new Hono<ServerEnv>()
    .use("*", requestId({limitLength: 0}))
    .get("/error", () => {
        throw new Error("unexpected failure");
    })
    .onError(handleAppError);

afterEach(() => {
    vi.restoreAllMocks();
});

it("returns a generated request ID", async () => {
    const response = await createApp({
        identityVerifier: createRejectAllIdentityVerifier(),
    }).request("/api/v1/health");

    expect(response.headers.get(REQUEST_ID_HEADER)).toMatch(REQUEST_ID_PATTERN);
});

it("ignores a caller-supplied request ID", async () => {
    const response = await createApp({
        identityVerifier: createRejectAllIdentityVerifier(),
    }).request("/api/v1/health", {
        headers: {[REQUEST_ID_HEADER]: "caller-chosen-id"},
    });
    const assignedRequestId = response.headers.get(REQUEST_ID_HEADER);

    expect(assignedRequestId).not.toBe("caller-chosen-id");
    expect(assignedRequestId).toMatch(REQUEST_ID_PATTERN);
});

it("gives concurrent requests distinct request IDs", async () => {
    const app = createApp({
        identityVerifier: createRejectAllIdentityVerifier(),
    });
    const responses = await Promise.all([
        app.request("/api/v1/health", {
            headers: {[REQUEST_ID_HEADER]: "shared-id"},
        }),
        app.request("/api/v1/health", {
            headers: {[REQUEST_ID_HEADER]: "shared-id"},
        }),
    ]);
    const assignedRequestIds = responses.map(
        (response) => response.headers.get(REQUEST_ID_HEADER),
    );

    expect(new Set(assignedRequestIds).size).toBe(responses.length);
});

it("logs the request ID that identifies a failing request", async () => {
    const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {
            // Suppress the expected server-side test log.
        });
    const response = await unexpectedErrorTestApp.request("/error");
    const assignedRequestId = response.headers.get(REQUEST_ID_HEADER);

    expect(response.status).toBe(HTTP_STATUS_INTERNAL_SERVER_ERROR);
    expect(assignedRequestId).toMatch(REQUEST_ID_PATTERN);
    expect(consoleError).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({requestId: assignedRequestId}),
    );
});
