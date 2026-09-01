CREATE TABLE IF NOT EXISTS user_deployment_access (
    user_id VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    deployment_id VARCHAR(32) NOT NULL,
    PRIMARY KEY (user_id, deployment_id)
);

CREATE TABLE IF NOT EXISTS api_tokens (
    id BINARY(16) NOT NULL,
    deployment_id VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    secret_hash BINARY(32) NOT NULL,
    expires_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id)
);
