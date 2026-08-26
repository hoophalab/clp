import fastifyHttpProxy from "@fastify/http-proxy";
import {CLP_QUERY_ENGINES} from "@webui/common/config";
import fp from "fastify-plugin";

import {
    publicSettings,
    serverSettings,
} from "../../settings.js";


/**
 * Reverse proxy for Presto's native HTTP API.
 */
export default fp(
    async (fastify) => {
        if (CLP_QUERY_ENGINES.PRESTO !== publicSettings.ClpQueryEngine) {
            return;
        }

        const {PrestoHost, PrestoPort} = serverSettings;
        if (null === PrestoHost || null === PrestoPort) {
            fastify.log.warn(
                "Presto query engine is configured but PrestoHost/PrestoPort are not set; " +
                "skipping Presto proxy initialization."
            );

            return;
        }

        await fastify.register(fastifyHttpProxy, {
            prefix: "/api/presto",
            replyOptions: {
                rewriteRequestHeaders: (_request, headers) => ({
                    ...headers,
                    "x-presto-catalog": fastify.config.PRESTO_CATALOG,
                    "x-presto-schema": fastify.config.PRESTO_SCHEMA,
                    "x-presto-user": fastify.config.USER,
                }),
            },
            upstream: `http://${PrestoHost}:${PrestoPort}`,
        });
    }
);
