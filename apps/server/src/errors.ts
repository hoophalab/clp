import type {
    ErrorHandler,
    NotFoundHandler,
} from "hono";
import {HTTPException} from "hono/http-exception";

import {createErrorEnvelope} from "./contracts/error.js";
import {
    HTTP_STATUS_BAD_REQUEST,
    HTTP_STATUS_INTERNAL_SERVER_ERROR,
    HTTP_STATUS_NOT_FOUND,
} from "./http-status.js";


/**
 * Returns the public not-found response for unmatched top-level routes.
 *
 * @param context The request context.
 * @return The safe not-found response.
 */
const handleNotFound: NotFoundHandler = (context) => context.json(
    createErrorEnvelope("not_found"),
    HTTP_STATUS_NOT_FOUND,
);

/**
 * Maps uncaught errors to the public error contract.
 *
 * Hono's request parser throws an HTTPException for malformed request bodies.
 * That known 400 response is safe to expose as a generic invalid request. All
 * other uncaught errors are logged server-side and sanitized to a generic 500.
 *
 * @param error The uncaught request error.
 * @param context The request context.
 * @return The safe public error response.
 */
const handleAppError: ErrorHandler = (error, context) => {
    if (
        error instanceof HTTPException &&
        HTTP_STATUS_BAD_REQUEST === error.status
    ) {
        return context.json(
            createErrorEnvelope("invalid_request"),
            HTTP_STATUS_BAD_REQUEST,
        );
    }

    console.error("Unhandled application error.", error);

    return context.json(
        createErrorEnvelope("internal_server_error"),
        HTTP_STATUS_INTERNAL_SERVER_ERROR,
    );
};

export {
    handleAppError, handleNotFound,
};
