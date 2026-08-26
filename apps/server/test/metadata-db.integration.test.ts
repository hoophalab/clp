import {MongoMemoryServer} from "mongodb-memory-server-core";
import {
    afterAll,
    beforeAll,
    describe,
    expect,
    it,
} from "vitest";

import {MetadataDb} from "../src/metadata-db.js";


const INTEGRATION_TIMEOUT_MS = 60_000;

describe("MetadataDb integration", () => {
    let memoryServer: MongoMemoryServer;
    let metadataDb: MetadataDb;

    beforeAll(async () => {
        memoryServer = await MongoMemoryServer.create();
        metadataDb = new MetadataDb(
            memoryServer.getUri("metadata-db-integration"),
        );
        await metadataDb.connect();
    }, INTEGRATION_TIMEOUT_MS);

    afterAll(async () => {
        await metadataDb.close();
        await memoryServer.stop();
    });

    it("connects and exposes the selected database", async () => {
        const collection = metadataDb.getDatabase()
            .collection<{value: string}>("metadata-db-smoke");

        await collection.insertOne({value: "connected"});

        await expect(collection.findOne({value: "connected"}))
            .resolves.toMatchObject({value: "connected"});
    });
});
