import {
    CloudFormationClient,
    ListExportsCommand,
} from "@aws-sdk/client-cloudformation";
import {
    GetSecretValueCommand,
    SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import awsSslProfiles from "aws-ssl-profiles";
import mysql from "mysql2/promise";
import * as z from "zod";


const CONNECT_TIMEOUT_MS = 10_000;
const KEEP_ALIVE_DELAY_MS = 10_000;
const POOL_CONNECTION_LIMIT = 4;

const DatabaseCredentialsSchema = z.object({
    host: z.string().min(1),
    password: z.string().min(1),
    port: z.coerce.number().int()
        .positive(),
    username: z.string().min(1),
});

/**
 * Reads a cluster database's admin credentials from Secrets Manager.
 *
 * The secret is found through the `{clusterId}:DatabaseSecretArn` export of the
 * cluster's database stack.
 *
 * @param region AWS region of the cluster.
 * @param clusterId Cluster whose database stack exports the secret ARN.
 * @return The database host, port, and admin credentials.
 * @throws {Error} When the export or secret is missing or malformed.
 */
const readDatabaseCredentials = async (region: string, clusterId: string) => {
    const exportName = `${clusterId}:DatabaseSecretArn`;
    const cloudFormation = new CloudFormationClient({region: region});
    const secretsManager = new SecretsManagerClient({region: region});

    try {
        let secretArn: string | undefined;
        let nextToken: string | undefined;
        do {
            const page = await cloudFormation.send(new ListExportsCommand({NextToken: nextToken}));
            secretArn = page.Exports?.find(({Name}) => Name === exportName)?.Value;
            nextToken = page.NextToken;
        } while ("undefined" === typeof secretArn && "undefined" !== typeof nextToken);

        if ("undefined" === typeof secretArn) {
            throw new Error(`CloudFormation export ${exportName} was not found in ${region}.`);
        }

        const {SecretString: secretString} = await secretsManager.send(
            new GetSecretValueCommand({SecretId: secretArn}),
        );

        if ("undefined" === typeof secretString) {
            throw new Error(`Database secret ${secretArn} has no string value.`);
        }

        return DatabaseCredentialsSchema.parse(JSON.parse(secretString));
    } finally {
        cloudFormation.destroy();
        secretsManager.destroy();
    }
};

/**
 * Holds one pooled connection per cluster database the console talks to.
 *
 * Each cluster's CLP deployments sit behind an auth gateway backed by a MySQL
 * database that the console writes to directly. This owns the connections to
 * those databases, not what callers do with them: a pool opens on first use and
 * stays open for later requests, and the server's certificate must chain to an
 * Amazon RDS CA and match the database's hostname.
 */
class ClusterDatabaseManager {
    readonly #pools = new Map<string, Promise<mysql.Pool>>();

    /**
     * Closes every pool.
     *
     * A pool that fails to close is logged rather than raised: shutdown
     * continues so the remaining pools and the server still close.
     */
    async close (): Promise<void> {
        const poolsSnapshot = [...this.#pools.values()];

        this.#pools.clear();
        await Promise.all(poolsSnapshot.map(async (pool) => {
            try {
                await (await pool).end();
            } catch (error: unknown) {
                console.error("Failed to close a cluster database pool.", error);
            }
        }));
    }

    /**
     * Returns the pool for one cluster, opening it on first use.
     *
     * @param region AWS region of the cluster.
     * @param clusterId Cluster within the region.
     * @return A promise that resolves after the cluster's connection pool is ready.
     */
    getPool (region: string, clusterId: string): Promise<mysql.Pool> {
        const key = `${region}/${clusterId}`;
        const pool = this.#pools.get(key) ?? (async () => {
            const credentials = await readDatabaseCredentials(region, clusterId);

            return mysql.createPool({
                connectTimeout: CONNECT_TIMEOUT_MS,
                connectionLimit: POOL_CONNECTION_LIMIT,
                enableKeepAlive: true,
                host: credentials.host,
                keepAliveInitialDelay: KEEP_ALIVE_DELAY_MS,
                password: credentials.password,
                port: credentials.port,
                ssl: {
                    ca: awsSslProfiles.ca,
                    verifyIdentity: true,
                },
                user: credentials.username,
            });
        })().catch((error: unknown) => {
            this.#pools.delete(key);
            throw error;
        });

        this.#pools.set(key, pool);

        return pool;
    }
}

export {ClusterDatabaseManager};
