import {Hono} from "hono";

import {HealthResponseSchema} from "../contracts/health.js";
import {HTTP_STATUS_OK} from "../http-status.js";
import {parseContractResponse} from "../response-validation.js";


const healthRoutes = new Hono()
    .get("/", (context) => {
        const response = parseContractResponse(
            HealthResponseSchema,
            {status: "ok"},
        );

        return context.json(response, HTTP_STATUS_OK);
    });

export {healthRoutes};
