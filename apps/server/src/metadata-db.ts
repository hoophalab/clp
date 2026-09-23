import {
    type Db,
    MongoClient,
} from "mongodb";


const MONGO_MAX_ADAPTIVE_RETRIES = 10;
const MONGO_OPERATION_TIMEOUT_MS = 120_000;

/**
 * Holds the process-wide MongoDB client and selected metadata database.
 */
class MetadataDb {
    readonly #client: MongoClient;

    readonly #database: Db;

    /**
     * @param uri Complete MongoDB connection URI.
     */
    constructor (uri: string) {
        this.#client = new MongoClient(uri, {
            maxAdaptiveRetries: MONGO_MAX_ADAPTIVE_RETRIES,
            retryReads: true,
            retryWrites: true,
            serverSelectionTimeoutMS: MONGO_OPERATION_TIMEOUT_MS,
            timeoutMS: MONGO_OPERATION_TIMEOUT_MS,
        });
        this.#database = this.#client.db();
    }

    /**
     * Connects the retained MongoDB client.
     */
    async connect (): Promise<void> {
        await this.#client.connect();
    }

    /**
     * Returns the selected database handle.
     *
     * @return Metadata database handle.
     */
    getDatabase (): Db {
        return this.#database;
    }

    /**
     * Closes the retained MongoDB client.
     */
    async close (): Promise<void> {
        await this.#client.close();
    }
}

export {MetadataDb};
