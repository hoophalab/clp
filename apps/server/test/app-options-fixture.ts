import {MongoClient} from "mongodb";

import {ClusterDatabaseManager} from "../src/cluster-databases.js";
import {
    DeploymentOrchestrator,
    DeploymentRequestExecutor,
} from "../src/deployment-orchestrator/index.js";


/**
 * Creates app options for tests that never reach a database-backed route.
 *
 * The MongoDB client connects lazily, so no connection is attempted unless a
 * test calls one of those routes.
 *
 * @return Options backed by an unreachable database.
 */
const createUnusedAppOptions = () => {
    const database = new MongoClient("mongodb://127.0.0.1:1").db("unused");

    return {
        clusterDatabaseManager: new ClusterDatabaseManager(),
        database: database,
        deploymentOrchestrator: new DeploymentOrchestrator(
            database,
            new DeploymentRequestExecutor({
                clusterSecret: "unused",
                database: database,
            }),
        ),
    };
};

export {createUnusedAppOptions};
