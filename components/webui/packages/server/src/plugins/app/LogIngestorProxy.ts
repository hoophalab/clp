import fastifyHttpProxy from "@fastify/http-proxy";
import fp from "fastify-plugin";

import {serverSettings} from "../../settings.js";


/**
 * Reverse proxy that forwards `/api/log-ingestor/*` requests to the log ingestor. The
 * `/api/log-ingestor` prefix is stripped before forwarding since the log ingestor's routes live at
 * its root. Nothing is registered when the deployment doesn't enable the log ingestor.
 */
export default fp(
    async (fastify) => {
        if (null === serverSettings.LogIngestorUrl) {
            return;
        }
        await fastify.register(fastifyHttpProxy, {
            prefix: "/api/log-ingestor",
            upstream: serverSettings.LogIngestorUrl,
        });
    },
);
