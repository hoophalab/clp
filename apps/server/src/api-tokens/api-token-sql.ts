import type {
    Pool,
    ResultSetHeader,
    RowDataPacket,
} from "mysql2/promise";

import {AUTH_SERVER_CACHE_TTL_SECONDS} from "./token.js";


const MYSQL_DUPLICATE_ENTRY_ERROR_CODE = "ER_DUP_ENTRY";
const COLUMNS = "id, deployment_id, user_id, alias, created_at, expires_at, revoked_at";

/**
 * One row of `api_tokens`.
 */
type ApiTokenRow = {
    alias: string;
    createdAt: Date;
    deploymentId: string;
    expiresAt: Date;
    revokedAt: Date | null;
    selector: Buffer;
    userId: string;
};

/**
 * Converts a result row to a record.
 *
 * @param row
 * @return The row as a record.
 */
const toRow = (row: RowDataPacket): ApiTokenRow => ({
    alias: row.alias as string,
    createdAt: row.created_at as Date,
    deploymentId: row.deployment_id as string,
    expiresAt: row.expires_at as Date,
    revokedAt: row.revoked_at as Date | null,
    selector: row.id as Buffer,
    userId: row.user_id as string,
});

/**
 * Checks for duplicate alias.
 *
 * @param error
 * @return Whether MySQL rejected a write for violating a unique index.
 */
const isDuplicateAlias = (error: unknown): boolean => (
    "object" === typeof error &&
    null !== error &&
    "code" in error &&
    MYSQL_DUPLICATE_ENTRY_ERROR_CODE === error.code
);

/**
 * Checks whether a user has been granted access to a deployment.
 *
 * This is the same query the auth server runs to admit a user to a deployment,
 * so whoever may use a deployment may also mint tokens for it.
 *
 * @param pool
 * @param userId The full Auth0 subject.
 * @param deploymentId
 * @return Whether `user_deployment_access` has a row for the pair.
 */
const hasDeploymentAccess = async (
    pool: Pool,
    userId: string,
    deploymentId: string,
): Promise<boolean> => {
    const [rows] = await pool.execute<RowDataPacket[]>(
        "SELECT EXISTS (SELECT 1 FROM auth.user_deployment_access " +
        "WHERE user_id = ? AND deployment_id = ?) AS has_access",
        [
            userId,
            deploymentId,
        ],
    );

    return 1 === rows[0]?.has_access;
};

/**
 * Reads a token by its selector.
 *
 * @param pool
 * @param selector
 * @return The row, or null when no row has that selector.
 */
const selectBySelector = async (pool: Pool, selector: Buffer): Promise<ApiTokenRow | null> => {
    const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT ${COLUMNS} FROM auth.api_tokens WHERE id = ? LIMIT 1`,
        [selector],
    );
    const [row] = rows;

    return "undefined" === typeof row ?
        null :
        toRow(row);
};

/**
 * Retrieves all tokens visible to the user on this database connection.
 *
 * Tokens are visible if:
 * 1. The user created the token (matches `userId`).
 * 2. The token belongs to a deployment the user owns (matches `ownedDeploymentIds`).
 *
 * @param pool
 * @param userId The full Auth0 subject.
 * @param ownedDeploymentIds
 * @return Matching rows, newest first, ties broken by ID.
 */
const selectVisible = async (
    pool: Pool,
    userId: string,
    ownedDeploymentIds: readonly string[],
): Promise<ApiTokenRow[]> => {
    // `IN ()` is a syntax error, so only add the clause when there is
    // something to put in it.
    const ownedClause = 0 < ownedDeploymentIds.length ?
        ` OR deployment_id IN (${ownedDeploymentIds.map(() => "?").join(", ")})` :
        "";
    const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT ${COLUMNS} FROM auth.api_tokens ` +
        `WHERE user_id = ?${ownedClause} ` +
        "ORDER BY created_at DESC, id DESC",
        [
            userId,
            ...ownedDeploymentIds,
        ],
    );

    return rows.map(toRow);
};

/**
 * Inserts a token and reads it back so the caller gets the database's
 * `created_at`.
 *
 * @param pool
 * @param row
 * @param row.alias
 * @param row.deploymentId
 * @param row.expiresAt
 * @param row.secretHash
 * @param row.selector
 * @param row.userId The full Auth0 subject.
 * @return The inserted row, or null when the alias is already taken.
 */
const insertToken = async (
    pool: Pool,
    {alias, deploymentId, expiresAt, secretHash, selector, userId}: {
        alias: string;
        deploymentId: string;
        expiresAt: Date;
        secretHash: Buffer;
        selector: Buffer;
        userId: string;
    },
): Promise<ApiTokenRow | null> => {
    try {
        await pool.execute(
            "INSERT INTO auth.api_tokens " +
            "(id, deployment_id, secret_hash, expires_at, user_id, alias, created_at) " +
            "VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(6))",
            [
                selector,
                deploymentId,
                secretHash,
                expiresAt,
                userId,
                alias,
            ],
        );
    } catch (error: unknown) {
        if (isDuplicateAlias(error)) {
            return null;
        }
        throw error;
    }

    const row = await selectBySelector(pool, selector);
    if (null === row) {
        throw new Error("The token was inserted but could not be read back.");
    }

    return row;
};

/**
 * Updates a token's alias.
 *
 * The query enforces authorization by requiring the caller's `userId` to match
 * the token's creator. If the caller is not the creator, no row is updated.
 *
 * @param pool
 * @param selector
 * @param userId The full Auth0 subject.
 * @param alias
 * @return Whether a row matched.
 * @throws The MySQL error; see {@link isDuplicateAlias}.
 */
const updateAlias = async (
    pool: Pool,
    selector: Buffer,
    userId: string,
    alias: string,
): Promise<boolean> => {
    const [result] = await pool.execute<ResultSetHeader>(
        "UPDATE auth.api_tokens SET alias = ? WHERE id = ? AND user_id = ?",
        [
            alias,
            selector,
            userId,
        ],
    );

    return 0 < result.affectedRows;
};

/**
 * Marks a token revoked. Idempotent.
 *
 * @param pool
 * @param selector
 */
const markRevoked = async (pool: Pool, selector: Buffer): Promise<void> => {
    await pool.execute(
        "UPDATE auth.api_tokens SET revoked_at = UTC_TIMESTAMP(6) " +
        "WHERE id = ? AND revoked_at IS NULL",
        [selector],
    );
};

/**
 * Deletes a token, provided its TTL has passed and the caller is the creator
 *
 * @param pool
 * @param selector
 * @param userId The full Auth0 subject; only the creator may delete.
 * @return Whether a row was deleted.
 */
const deleteIfExpired = async (pool: Pool, selector: Buffer, userId: string): Promise<boolean> => {
    const [result] = await pool.execute<ResultSetHeader>(
        "DELETE FROM auth.api_tokens " +
        "WHERE id = ? AND user_id = ? " +
        "AND LEAST(expires_at, COALESCE(revoked_at + INTERVAL ? SECOND, expires_at)) " +
        "<= UTC_TIMESTAMP(6)",
        [
            selector,
            userId,
            AUTH_SERVER_CACHE_TTL_SECONDS,
        ],
    );

    return 0 < result.affectedRows;
};

export {
    type ApiTokenRow,
    deleteIfExpired,
    hasDeploymentAccess,
    insertToken,
    isDuplicateAlias,
    markRevoked,
    selectBySelector,
    selectVisible,
    updateAlias,
};
