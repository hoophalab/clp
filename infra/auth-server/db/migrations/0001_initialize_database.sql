CREATE TABLE IF NOT EXISTS user_deployment_access (
    user_id VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    deployment_id VARCHAR(255) NOT NULL,
    PRIMARY KEY (user_id, deployment_id)
);
