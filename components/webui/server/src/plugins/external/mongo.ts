import fastifyMongoDb from "@fastify/mongodb";

import settings from "../../../settings.json" with {type: "json"};


export const autoConfig = () => {
    const params: Record<string, string> = {};
    if (settings.MongoDbTls) {
        params["tls"] = "true";
        if (settings.MongoDbTlsCaFile) {
            params["tlsCAFile"] = settings.MongoDbTlsCaFile;
        }
    } else {
        // For the bundled MongoDB (single-node replica set in Docker),
        // directConnection avoids DNS resolution issues with Docker internal
        // hostnames, and replicaSet is known.
        params["directConnection"] = "true";
        params["replicaSet"] = "rs0";
    }
    params["retryWrites"] = "false";

    const authority = `${settings.MongoDbHost}:${settings.MongoDbPort}`;
    const path = settings.MongoDbName;
    const query = new URLSearchParams(params).toString();
    const url = `mongodb://${authority}/${path}?${query}`;

    return {
        forceClose: true,
        url: url,
        authMechanism: "SCRAM-SHA-1",
    };
};

export default fastifyMongoDb;
