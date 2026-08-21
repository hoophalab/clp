import type {MiddlewareHandler} from "hono";

import {createErrorEnvelope} from "./contracts/error.js";
import type {ServerEnv} from "./environment.js";
import {HTTP_STATUS_FORBIDDEN} from "./http-status.js";


/**
 * Restricts a route to an authenticated administrator.
 * Must be mounted after authentication has populated `isAdmin`.
 *
 * @param context The authenticated request context.
 * @param next The protected route continuation.
 * @return The safe forbidden response when the identity lacks the admin role.
 */
const requireAdmin: MiddlewareHandler<ServerEnv> = async (context, next) => {
    if (!context.get("isAdmin")) {
        return context.json(
            createErrorEnvelope("forbidden"),
            HTTP_STATUS_FORBIDDEN,
        );
    }

    return next();
};

export {requireAdmin};
