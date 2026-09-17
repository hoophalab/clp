import {createHmac} from "node:crypto";
import path from "node:path";

import * as eks from "aws-cdk-lib/aws-eks";
import * as s3assets from "aws-cdk-lib/aws-s3-assets";
import {Construct} from "constructs";

import {
    DATABASE_SYSTEM_NAMESPACE,
    PROXYSQL_HOST,
    PROXYSQL_PORT,
    PROXYSQL_RELEASE_NAME,
} from "../database-constants";


const DATABASE_NAME_PREFIX = "clp_";
const DATABASE_NAME_MAX_LENGTH = 64;
export interface DeploymentDatabase {
    chart: eks.HelmChart;
    host: string;
    name: string;
    password: string;
    port: number;
    username: string;
}

/**
 * Creates the retained database name for a deployment.
 *
 * @param deploymentId User-selected deployment ID.
 * @return Database name reused by deployments with the same ID.
 * @throws {Error} If the name exceeds MariaDB's identifier length limit.
 */
const createDatabaseName = function (deploymentId: string): string {
    const name = `${DATABASE_NAME_PREFIX}${deploymentId}`;

    if (DATABASE_NAME_MAX_LENGTH < name.length) {
        throw new Error(
            `Database name '${name}' exceeds MariaDB's ` +
            `${DATABASE_NAME_MAX_LENGTH}-character limit.`,
        );
    }

    return name;
};

/**
 * Adds a per-deployment database account through the privileged provisioner.
 *
 * @param config Database configuration.
 * @param config.cluster EKS target that hosts this deployment.
 * @param config.clusterSecret Secret used to derive the database password.
 * @param config.deploymentId CLP deployment ID.
 * @param config.scope Deployment stack scope.
 * @return Values used to configure the CLP chart.
 */
export const addDeploymentDatabase = function (
    {
        cluster,
        clusterSecret,
        deploymentId,
        scope,
    }: {
        cluster: eks.ICluster;
        clusterSecret: string;
        deploymentId: string;
        scope: Construct;
    },
): DeploymentDatabase {
    const identifier = createDatabaseName(deploymentId);
    const releaseName = identifier.replaceAll("_", "-");
    const password = createHmac("sha256", clusterSecret)
        .update(deploymentId)
        .digest("base64url");
    const chartAsset = new s3assets.Asset(scope, "DatabaseProvisionerChartAsset", {
        path: path.join(__dirname, "../../../database-provisioner/chart"),
    });
    const chart = new eks.HelmChart(scope, "DatabaseProvisionerHelmRelease", {
        atomic: true,
        chartAsset: chartAsset,
        cluster: cluster,
        createNamespace: false,
        namespace: DATABASE_SYSTEM_NAMESPACE,
        release: releaseName,
        values: {
            database: {
                name: identifier,
                password: password,
                username: identifier,
            },
            proxysql: {
                adminSecretName: PROXYSQL_RELEASE_NAME,
                frontendPort: PROXYSQL_PORT,
                internalServiceName: `${PROXYSQL_RELEASE_NAME}-internal`,
                serviceName: PROXYSQL_RELEASE_NAME,
            },
        },
        wait: true,
    });

    return {
        chart: chart,
        host: PROXYSQL_HOST,
        name: identifier,
        password: password,
        port: PROXYSQL_PORT,
        username: identifier,
    };
};
