CREATE TABLE IF NOT EXISTS user_deployment_access (
    user_id VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    deployment_id VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    PRIMARY KEY (user_id, deployment_id)
);

-- The cloud console manages API tokens on behalf of users, so each token
-- records who created it and the caller-chosen alias it is listed under.
--
-- Revocation is a soft delete so the console can keep listing a revoked token
-- with its original expiry. The auth server stops honouring a token as soon as
-- `revoked_at` is set, except that a replica which cached the token before the
-- revocation keeps honouring it until its cache entry expires.
CREATE TABLE IF NOT EXISTS api_tokens (
    id BINARY(16) NOT NULL,
    deployment_id VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    secret_hash BINARY(32) NOT NULL,
    expires_at DATETIME(6) NOT NULL,
    user_id VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    alias VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    created_at DATETIME(6) NOT NULL,
    revoked_at DATETIME(6) NULL,
    PRIMARY KEY (id),
    UNIQUE INDEX uq_api_tokens_user_id_deployment_id_alias (user_id, deployment_id, alias),
    INDEX ix_api_tokens_user_id (user_id),
    INDEX ix_api_tokens_deployment_id (deployment_id)
);
