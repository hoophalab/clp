import {QueryId} from "@webui/common/socket";
import {FastifyBaseLogger} from "fastify";
import type {
    Collection,
    Db,
} from "mongodb";

import {
    CLIENT_UPDATE_TIMEOUT_MILLIS,
    MongoCustomSocket,
    QueryParameters,
    Watcher,
} from "./typings.js";
import {
    convertQueryToChangeStreamFormat,
    removeItemFromArray,
} from "./utils.js";


/**
 * Provides watchers for MongoDB queries to a specific collection.
 */
class MongoWatcherCollection {
    #collection: Collection;

    #logger: FastifyBaseLogger;

    #mongoDb: Db;

    // Active watchers
    #queryIdtoWatcherMap: Map<QueryId, Watcher> = new Map();

    // Whether change streams have been enabled for this collection (DocumentDB).
    #changeStreamsEnabled: boolean = false;

    /**
     * @param collectionName
     * @param logger
     * @param mongoDb
     */
    constructor (collectionName: string, logger: FastifyBaseLogger, mongoDb: Db) {
        this.#collection = mongoDb.collection(collectionName);
        this.#logger = logger;
        this.#mongoDb = mongoDb;
    }

    /**
     * Enables change streams for this collection on DocumentDB.
     *
     * On Amazon DocumentDB, change streams must be explicitly enabled using the
     * `modifyChangeStreams` command before `.watch()` can be used. On standard
     * MongoDB, this command doesn't exist and will fail with code 303, which is
     * caught and ignored since change streams work natively with a replica set.
     */
    async #enableChangeStreams (): Promise<void> {
        if (this.#changeStreamsEnabled) {
            return;
        }
        return;

        try {
            await this.#mongoDb.command({
                modifyChangeStreams: 1,
                collection: this.#collection.collectionName,
                allow: {operations: ["insert", "update", "delete", "replace"]},
                enable: 1,
            });
        } catch (err: unknown) {
            const error = err as {code?: number};
            if (303 === error.code) {
                this.#logger.info(
                    "modifyChangeStreams command not supported " +
                    "(standard MongoDB); skipping."
                );
            } else {
                throw err;
            }
        }

        this.#changeStreamsEnabled = true;
    }

    /**
     * Checks if the collection is currently being referenced by any clients.
     *
     * @return True if the collection is referenced, false otherwise.
     */
    isReferenced (): boolean {
        return 0 !== this.#queryIdtoWatcherMap.size;
    }

    /**
     * Checks if a watcher exists for the given query ID.
     *
     * @param queryId
     * @return True if a watcher exists, false otherwise.
     */
    hasWatcher (
        queryId: QueryId,
    ): boolean {
        if ("undefined" === typeof this.#queryIdtoWatcherMap.get(queryId)) {
            return false;
        }

        return true;
    }

    /**
     * Unsubscribes a connection from a watcher. If the watcher has no more subscribers, it closes
     * the change stream.
     *
     * @param queryId
     * @param connectionId
     * @return True if connection is last subcriber, false otherwise.
     */
    unsubscribe (queryId: number, connectionId: string): boolean {
        const watcher = this.#queryIdtoWatcherMap.get(queryId);

        if ("undefined" === typeof watcher) {
            this.#logger.warn(`No watcher found for queryID:${queryId}`);

            return false;
        }

        if (1 < watcher.subscribers.length) {
            removeItemFromArray(watcher.subscribers, connectionId);

            return false;
        }

        watcher.changeStream.close().catch((err: unknown) => {
            this.#logger.error(err, `Error closing watcher for queryID:${queryId}`);
        });
        this.#queryIdtoWatcherMap.delete(queryId);

        return true;
    }

    /**
     * Adds connection to an existing watcher and joins the the room for the given query ID.
     *
     * @param queryId
     * @param socket
     */
    async subscribe (
        queryId: QueryId,
        socket: MongoCustomSocket
    ) {
        const watcher = this.#queryIdtoWatcherMap.get(queryId);

        if ("undefined" === typeof watcher) {
            throw new Error(`No watcher found for queryId ${queryId}`);
        }

        watcher.subscribers.push(socket.id);
        await socket.join(queryId.toString());
    }

    /**
     * Creates a watcher for the given query.
     *
     * @param queryParams
     * @param queryId
     * @param emitUpdate
     */
    async createWatcher (
        queryParams: QueryParameters,
        queryId: QueryId,
        emitUpdate: (data: object[]) => void
    ): Promise<void> {
        await this.#enableChangeStreams();

        const watcherQuery = convertQueryToChangeStreamFormat(queryParams.query);
        const mongoWatcher = this.#collection.watch(
            [{$match: watcherQuery}],
            {fullDocument: "updateLookup"}
        );

        const watcher: Watcher = {changeStream: mongoWatcher, subscribers: []};
        this.#setupWatcherListener(watcher, queryParams, queryId, emitUpdate);
        this.#queryIdtoWatcherMap.set(queryId, watcher);
    }

    /**
     * Executes a query on the collection and retrieves matching documents.
     *
     * @param queryParameters
     * @return
     */
    async find (
        queryParameters: QueryParameters
    ): Promise<object[]> {
        const {query, options} = queryParameters;
        try {
            const documents = await this.#collection.find(query, options).toArray();
            return documents;
        } catch (error) {
            this.#logger.error(error, "Error fetching data for query");

            return [];
        }
    }

    /**
     * Sets up listener to emit updates to clients on change events.
     *
     * @param watcher
     * @param queryParameters
     * @param queryId
     * @param emitUpdate
     */
    #setupWatcherListener (
        watcher: Watcher,
        queryParameters: QueryParameters,
        queryId: QueryId,
        emitUpdate: (data: object[]) => void
    ) {
        let lastEmitTime = 0;
        let emitTimeout: NodeJS.Timeout | null = null;

        const emitUpdateWithTimeout = async () => {
            const currentTime = Date.now();
            if (CLIENT_UPDATE_TIMEOUT_MILLIS <= currentTime - lastEmitTime) {
                lastEmitTime = currentTime;
                const data = await this.find(queryParameters);
                emitUpdate(data);
            } else if (null === emitTimeout) {
                const delay = CLIENT_UPDATE_TIMEOUT_MILLIS - (currentTime - lastEmitTime);

                emitTimeout = setTimeout(() => {
                    emitTimeout = null;

                    const fetchAndEmit = async () => {
                        const data = await this.find(queryParameters);
                        emitUpdate(data);
                    };

                    fetchAndEmit().catch((error: unknown) => {
                        this.#logger.error(error, "Error in emitUpdatesWithTimeout");
                    });
                    lastEmitTime = Date.now();
                }, delay);
            }
        };

        watcher.changeStream.on("change", (change) => {
            if ("invalidate" === change.operationType) {
                this.#logger.info(`Change stream received invalidate event for queryID ${queryId}`);

                return;
            }
            emitUpdateWithTimeout().catch((error: unknown) => {
                this.#logger.error(error, "Error in emitUpdatesWithTimeout");
            });
        });
    }
}

export default MongoWatcherCollection;
