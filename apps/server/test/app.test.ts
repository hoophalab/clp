import {Hono} from "hono";
import {
    hc,
    type InferRequestType,
    type InferResponseType,
} from "hono/client";
import {
    afterEach,
    expect,
    expectTypeOf,
    it,
    vi,
} from "vitest";
import * as z from "zod";

import {createApp} from "../src/app.js";
import {createErrorEnvelope} from "../src/contracts/error.js";
import {
    type AppType,
    type ErrorEnvelope,
    ErrorEnvelopeSchema,
    type HealthResponse,
    HealthResponseSchema,
} from "../src/contracts/index.js";
import type {ServerEnv} from "../src/environment.js";
import {
    handleAppError,
    handleNotFound,
} from "../src/errors.js";
import {
    HTTP_STATUS_BAD_REQUEST,
    HTTP_STATUS_INTERNAL_SERVER_ERROR,
    HTTP_STATUS_NOT_FOUND,
    HTTP_STATUS_OK,
} from "../src/http-status.js";
import {requestValidator} from "../src/request-validation.js";
import {parseContractResponse} from "../src/response-validation.js";


const HTTP_STATUS_CREATED = 201;
const TestParamsSchema = z.strictObject({
    resourceId: z.string().min(1),
});
const TestRequestSchema = z.strictObject({
    name: z.string().min(1),
});
const TestResponseSchema = z.strictObject({
    name: z.string(),
    resourceId: z.string(),
});

const validationTestApp = new Hono<ServerEnv>()
    .post(
        "/resources/:resourceId",
        requestValidator("param", TestParamsSchema),
        requestValidator("json", TestRequestSchema),
        (context) => {
            const {resourceId} = context.req.valid("param");
            const {name} = context.req.valid("json");
            const response = parseContractResponse(
                TestResponseSchema,
                {
                    name: name,
                    resourceId: resourceId,
                },
            );

            return context.json(response, HTTP_STATUS_CREATED);
        },
    )
    .notFound(handleNotFound)
    .onError(handleAppError);

const unexpectedErrorTestApp = new Hono<ServerEnv>()
    .get("/error", () => {
        throw new Error("database-password=secret");
    })
    .onError(handleAppError);

afterEach(() => {
    vi.restoreAllMocks();
});

it("returns a runtime-validated health response", async () => {
    const response = await createApp().request("/api/v1/health");
    const body: unknown = await response.json();

    expect(response.status).toBe(HTTP_STATUS_OK);
    expect(HealthResponseSchema.parse(body)).toEqual({status: "ok"});
});

it("returns the safe error envelope for unknown routes", async () => {
    const response = await createApp().request("/api/v1/missing");
    const body: unknown = await response.json();

    expect(response.status).toBe(HTTP_STATUS_NOT_FOUND);
    expect(ErrorEnvelopeSchema.parse(body)).toEqual(
        createErrorEnvelope("not_found"),
    );
});

it("passes validated values to the test-only handler", async () => {
    const response = await validationTestApp.request(
        "/resources/example",
        {
            body: JSON.stringify({name: "Example"}),
            headers: {"Content-Type": "application/json"},
            method: "POST",
        },
    );

    expect(response.status).toBe(HTTP_STATUS_CREATED);
    expect(await response.json()).toEqual({
        name: "Example",
        resourceId: "example",
    });
});

it("maps request schema failures without exposing validator details", async () => {
    const response = await validationTestApp.request(
        "/resources/example",
        {
            body: JSON.stringify({name: ""}),
            headers: {"Content-Type": "application/json"},
            method: "POST",
        },
    );
    const bodyText = await response.text();

    expect(response.status).toBe(HTTP_STATUS_BAD_REQUEST);
    expect(JSON.parse(bodyText)).toEqual(
        createErrorEnvelope("invalid_request"),
    );
    expect(bodyText).not.toContain("name");
    expect(bodyText).not.toContain("too_small");
});

it("maps malformed JSON through the same safe request error", async () => {
    const response = await validationTestApp.request(
        "/resources/example",
        {
            body: "{",
            headers: {"Content-Type": "application/json"},
            method: "POST",
        },
    );

    expect(response.status).toBe(HTTP_STATUS_BAD_REQUEST);
    expect(await response.json()).toEqual(
        createErrorEnvelope("invalid_request"),
    );
});

it("sanitizes unexpected errors", async () => {
    const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {
            // Suppress the expected server-side test log.
        });
    const response = await unexpectedErrorTestApp.request("/error");
    const bodyText = await response.text();

    expect(response.status).toBe(HTTP_STATUS_INTERNAL_SERVER_ERROR);
    expect(JSON.parse(bodyText)).toEqual(
        createErrorEnvelope("internal_server_error"),
    );
    expect(bodyText).not.toContain("database-password");
    expect(bodyText).not.toContain("secret");
    expect(consoleError).toHaveBeenCalledOnce();
});

it("rejects responses that drift from their runtime contract", () => {
    expect(() => parseContractResponse(
        HealthResponseSchema,
        {status: "degraded"} as never,
    )).toThrow();
    expect(() => parseContractResponse(
        ErrorEnvelopeSchema,
        {
            error: {
                code: "not_found",
                message: "Not found.",
                stack: "private",
            },
        } as never,
    )).toThrow();
});

it("preserves production RPC response and status inference", () => {
    type ApiClient = ReturnType<typeof hc<AppType>>;

    type HealthGet = ApiClient["api"]["v1"]["health"]["$get"];

    type Health200 = InferResponseType<
        HealthGet,
            typeof HTTP_STATUS_OK
    >;

    type Health400 = InferResponseType<
        HealthGet,
            typeof HTTP_STATUS_BAD_REQUEST
    >;

    type Health500 = InferResponseType<
        HealthGet,
            typeof HTTP_STATUS_INTERNAL_SERVER_ERROR
    >;

    type HealthStatus = Awaited<
        ReturnType<HealthGet>
    >["status"];

    expectTypeOf<Health200>().toEqualTypeOf<HealthResponse>();
    expectTypeOf<Health400>().toEqualTypeOf<ErrorEnvelope>();
    expectTypeOf<Health500>().toEqualTypeOf<ErrorEnvelope>();
    expectTypeOf<HealthStatus>().toEqualTypeOf<
            | typeof HTTP_STATUS_OK |
            typeof HTTP_STATUS_BAD_REQUEST |
            typeof HTTP_STATUS_INTERNAL_SERVER_ERROR
    >();
});

it("preserves validated RPC request and response inference", () => {
    type ValidationClient = ReturnType<
            typeof hc<typeof validationTestApp>
    >;

    type TestPost = ValidationClient[
        "resources"
    ][":resourceId"]["$post"];

    type TestRequest = InferRequestType<TestPost>;

    type Test201 = InferResponseType<
        TestPost,
            typeof HTTP_STATUS_CREATED
    >;

    type Test400 = InferResponseType<
        TestPost,
            typeof HTTP_STATUS_BAD_REQUEST
    >;

    type TestStatus = Awaited<ReturnType<TestPost>>["status"];

    expectTypeOf<TestRequest["json"]>()
        .toEqualTypeOf<{name: string}>();
    expectTypeOf<TestRequest["param"]>()
        .toEqualTypeOf<{resourceId: string}>();
    expectTypeOf<Test201>().toEqualTypeOf<{
        name: string;
        resourceId: string;
    }>();
    expectTypeOf<Test400>().toEqualTypeOf<ErrorEnvelope>();
    expectTypeOf<TestStatus>().toEqualTypeOf<
            | typeof HTTP_STATUS_CREATED |
            typeof HTTP_STATUS_BAD_REQUEST
    >();
});
