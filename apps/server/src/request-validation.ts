import {sValidator} from "@hono/standard-validator";
import type {ValidationTargets} from "hono";
import type * as z from "zod";

import {createErrorEnvelope} from "./contracts/error.js";
import {HTTP_STATUS_BAD_REQUEST} from "./http-status.js";


/**
 * Creates request validation middleware with the public 400 error contract.
 *
 * The Standard Schema hook intentionally discards validator issues. Callers
 * receive a stable error code and message while validated data remains
 * available through context.req.valid(target).
 *
 * @param target The Hono request value to validate.
 * @param schema The Zod Standard Schema contract.
 * @return Typed Hono validation middleware.
 */
const requestValidator = <
    Target extends keyof ValidationTargets,
    Schema extends z.ZodType,
>(
    target: Target,
    schema: Schema,
) => sValidator(
    target,
    schema,
    (result, context) => {
        if (result.success) {
            return Promise.resolve();
        }

        return Promise.resolve(context.json(
            createErrorEnvelope("invalid_request"),
            HTTP_STATUS_BAD_REQUEST,
        ));
    },
);

export {requestValidator};
