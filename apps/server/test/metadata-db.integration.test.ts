import {
    type CommandStartedEvent,
    MongoOperationTimeoutError,
} from "mongodb";
import {MongoMemoryReplSet} from "mongodb-memory-server-core";
import {
    afterAll,
    afterEach,
    beforeAll,
    expect,
    it,
} from "vitest";

import {MetadataDb} from "../src/metadata-db.js";


const INTEGRATION_TIMEOUT_MS = 60_000;
const DATABASE_TIMEOUT_MS = 120_000;
const SHORT_OPERATION_TIMEOUT_MS = 100;
const BLOCKED_COMMAND_MS = 1_000;

let memoryServer: MongoMemoryReplSet;
let metadataDb: MetadataDb;

beforeAll(async () => {
    memoryServer = await MongoMemoryReplSet.create({
        replSet: {
            count: 1,
            args: [
                "--setParameter",
                "enableTestCommands=1",
            ],
        },
    });
    metadataDb = new MetadataDb(
        `${memoryServer.getUri("metadata-db-integration")}&monitorCommands=true`,
    );
    await metadataDb.connect();
}, INTEGRATION_TIMEOUT_MS);

afterAll(async () => {
    await metadataDb.close();
    await memoryServer.stop();
});

afterEach(async () => {
    await metadataDb.getDatabase().admin()
        .command({
            configureFailPoint: "failCommand",
            mode: "off",
        });
});

it("connects and exposes the selected database", async () => {
    expect(metadataDb.getDatabase().client.options).toMatchObject({
        maxAdaptiveRetries: 10,
        retryReads: true,
        retryWrites: true,
        serverSelectionTimeoutMS: DATABASE_TIMEOUT_MS,
        timeoutMS: DATABASE_TIMEOUT_MS,
    });
    const collection = metadataDb.getDatabase()
        .collection<{value: string}>("metadata-db-smoke");

    await collection.insertOne({value: "connected"});

    await expect(collection.findOne({value: "connected"}))
        .resolves.toMatchObject({value: "connected"});
});

it.each([
    "find",
    "update",
] as const)("retries %s twice before succeeding", async (commandName) => {
    const database = metadataDb.getDatabase();
    const collection = database.collection<{_id: string; phase: string}>("native-retries");
    await collection.insertOne({_id: commandName, phase: "CREATING"});
    await database.admin().command({
        configureFailPoint: "failCommand",
        mode: {times: 2},
        data: {
            failCommands: [commandName],
            errorCode: 91,
            errorLabels: ["RetryableWriteError"],
        },
    });
    const commands: CommandStartedEvent[] = [];
    const recordCommand = (event: CommandStartedEvent) => {
        if (commandName === event.commandName) {
            commands.push(event);
        }
    };

    database.client.on("commandStarted", recordCommand);

    try {
        if ("find" === commandName) {
            await expect(collection.findOne({_id: commandName}))
                .resolves.toMatchObject({phase: "CREATING"});
        } else {
            await expect(collection.updateOne(
                {_id: commandName, phase: "CREATING"},
                {$set: {phase: "RUNNING"}},
            )).resolves.toMatchObject({matchedCount: 1, modifiedCount: 1});
            await expect(collection.findOne({_id: commandName}))
                .resolves.toMatchObject({phase: "RUNNING"});

            expect(commands[0]?.command.lsid).toBeDefined();
            expect(commands[0]?.command.txnNumber).toBeDefined();
            for (const event of commands) {
                expect(event.command.lsid).toEqual(commands[0]?.command.lsid);
                expect(event.command.txnNumber).toEqual(commands[0]?.command.txnNumber);
            }
        }

        expect(commands).toHaveLength(3);
    } finally {
        database.client.off("commandStarted", recordCommand);
    }
});

it("rejects when an operation exceeds its timeout", async () => {
    const database = metadataDb.getDatabase();
    await database.admin().command({
        configureFailPoint: "failCommand",
        mode: {times: 1},
        data: {
            failCommands: ["find"],
            blockConnection: true,
            blockTimeMS: BLOCKED_COMMAND_MS,
        },
    });

    await expect(database.collection("native-retries").findOne(
        {},
        {timeoutMS: SHORT_OPERATION_TIMEOUT_MS},
    )).rejects.toBeInstanceOf(MongoOperationTimeoutError);
});
