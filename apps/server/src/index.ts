import process from "node:process";

import {serve} from "@hono/node-server";

import {createApp} from "./app.js";
import {createLocalIdentityVerifier} from "./authentication.js";
import {readMetadataDbUri} from "./configuration.js";
import {MetadataDb} from "./metadata-db.js";


const DEFAULT_HOSTNAME = "0.0.0.0";
const DEFAULT_PORT = 5000;
const MAX_PORT = 65_535;

const hostname = process.env.BACKEND_HOST ?? DEFAULT_HOSTNAME;
const port = Number(process.env.BACKEND_PORT ?? DEFAULT_PORT);

if (false === Number.isInteger(port) || 1 > port || MAX_PORT < port) {
    throw new RangeError(`BACKEND_PORT must be an integer between 1 and ${MAX_PORT}.`);
}

const metadataDb = new MetadataDb(
    readMetadataDbUri(process.env),
);

await metadataDb.connect();

// The Auth0-backed verifier arrives with the adapter that binds this boundary
// to the tenant; until then no credential is accepted.
const app = createApp({
    identityVerifier: createLocalIdentityVerifier({
        auth0Issuer: "urn:yscope:auth0:unconfigured",
        identities: new Map<string, unknown>(),
    }),
});
const server = serve(
    {
        fetch: app.fetch,
        hostname: hostname,
        port: port,
    },
    (info) => {
        console.log(`Server is listening on http://${hostname}:${info.port}`);
    },
);

let isShuttingDown = false;

/**
 * Gracefully stops the HTTP server after a termination signal.
 *
 * @param signal The signal that initiated shutdown.
 */
const shutDown = (signal: NodeJS.Signals) => {
    if (isShuttingDown) {
        return;
    }

    isShuttingDown = true;
    console.log(`Received ${signal}; shutting down.`);

    server.close((error) => {
        if (error) {
            console.error("Failed to close the server cleanly.", error);
            process.exitCode = 1;
        } else {
            console.log("Server stopped.");
        }

        metadataDb.close().catch((metadataDbError: unknown) => {
            console.error(
                "Failed to close MongoDB cleanly.",
                metadataDbError,
            );
            process.exitCode = 1;
        });
    });
};

process.once("SIGINT", shutDown);
process.once("SIGTERM", shutDown);
