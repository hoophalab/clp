export const DATABASE_SYSTEM_NAMESPACE = "database-system";
export const PROXYSQL_RELEASE_NAME = "proxysql";
export const PROXYSQL_HOST =
    `${PROXYSQL_RELEASE_NAME}.${DATABASE_SYSTEM_NAMESPACE}.svc.cluster.local`;
export const PROXYSQL_PORT = 6033;
export const PROXYSQL_REPLICAS = 2;
