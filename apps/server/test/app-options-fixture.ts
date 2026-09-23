import {MongoClient} from "mongodb";


/**
 * Creates app options for tests that never reach a database-backed route.
 *
 * The MongoDB client connects lazily, so no connection is attempted unless a
 * test calls one of those routes.
 *
 * @return Options backed by an unreachable database.
 */
const createUnusedAppOptions = () => ({
    database: new MongoClient("mongodb://127.0.0.1:1").db("unused"),
});

export {createUnusedAppOptions};
