import fastifyMongoDb from "@fastify/mongodb";

import settings from "../../../settings.json" with {type: "json"};


export const autoConfig = () => {
    const params: Record<string, string> = {directConnection: "true"};
    if (settings.MongoDbTls) {
        params["tls"] = "true";
        if (settings.MongoDbTlsCaFile) {
            params["tlsCAFile"] = settings.MongoDbTlsCaFile;
        }
    }

    const authority = `${settings.MongoDbHost}:${settings.MongoDbPort}`;
    const path = settings.MongoDbName;
    const query = new URLSearchParams(params).toString();
    const url = `mongodb://${authority}/${path}?${query}`;

    return {
        forceClose: true,
        url: url,
    };
};

export default fastifyMongoDb;
