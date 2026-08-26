import path from "node:path";

import * as eks from "aws-cdk-lib/aws-eks";
import * as s3assets from "aws-cdk-lib/aws-s3-assets";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import {NagSuppressions} from "cdk-nag";
import {Construct} from "constructs";

import {
    DATABASE_SYSTEM_NAMESPACE,
    PROXYSQL_RELEASE_NAME,
    PROXYSQL_REPLICAS,
} from "../database-constants";
import {ExternalSecretsResources} from "./external-secrets";


const PROXYSQL_IMAGE_REPOSITORY = "proxysql/proxysql";
const PROXYSQL_IMAGE_TAG = "3.0.10";
const PROXYSQL_ADMIN_USERNAME = "admin";
const PROXYSQL_MONITOR_SECRET_NAME = "proxysql-monitor";
const PROXYSQL_MONITOR_USERNAME = "proxysql_monitor";
const RDS_BACKEND_CONNECTION_BUDGET = 100;

export interface SharedProxySqlResources {
    chart: eks.HelmChart;
    namespace: eks.KubernetesManifest;
}

/**
 * Installs the highly available shared ProxySQL service.
 *
 * @param config Shared proxy configuration.
 * @param config.cluster EKS cluster receiving the proxy.
 * @param config.externalSecrets External Secrets Operator resources.
 * @param config.rdsHost Shared RDS endpoint.
 * @param config.rdsPort TCP listener port for the shared RDS instance.
 * @param config.rdsSecretArn RDS administrator secret ARN.
 * @param config.scope EKS stack scope.
 * @return Shared proxy Kubernetes resources.
 */
// eslint-disable-next-line max-lines-per-function
export const addSharedProxySql = function (
    {
        cluster,
        externalSecrets,
        rdsHost,
        rdsPort,
        rdsSecretArn,
        scope,
    }: {
        cluster: eks.Cluster;
        externalSecrets: ExternalSecretsResources;
        rdsHost: string;
        rdsPort: number;
        rdsSecretArn: string;
        scope: Construct;
    },
): SharedProxySqlResources {
    const proxysqlSecret = new secretsmanager.Secret(scope, "ProxySqlSecret", {
        generateSecretString: {
            excludeCharacters: ":;\\\"'",
            generateStringKey: "password",
            passwordLength: 32,
            secretStringTemplate: JSON.stringify({
                username: PROXYSQL_ADMIN_USERNAME,
            }),
        },
    });
    const proxysqlMonitorSecret = new secretsmanager.Secret(
        scope,
        "ProxySqlMonitorSecret",
        {
            generateSecretString: {
                excludeCharacters: ":;\\\"'",
                generateStringKey: "password",
                passwordLength: 32,
                secretStringTemplate: JSON.stringify({
                    username: PROXYSQL_MONITOR_USERNAME,
                }),
            },
        },
    );

    // AwsSolutions-SMG4 flags Secrets Manager secrets without automatic
    // rotation.
    //
    // Suppress it here because rotating this credential requires coordinated
    // ProxySQL replica restarts.
    NagSuppressions.addResourceSuppressions(
        proxysqlSecret,
        [
            {
                id: "AwsSolutions-SMG4",
                reason: "Rotation requires coordinated ProxySQL replica restarts.",
            },
        ],
    );
    NagSuppressions.addResourceSuppressions(
        proxysqlMonitorSecret,
        [
            {
                id: "AwsSolutions-SMG4",
                reason: "Rotation requires a coordinated ProxySQL restart.",
            },
        ],
    );
    const namespace = cluster.addManifest("DatabaseSystemNamespace", {
        apiVersion: "v1",
        kind: "Namespace",
        metadata: {name: DATABASE_SYSTEM_NAMESPACE},
    });
    const proxysqlAdminSecret = cluster.addManifest("ProxySqlAdminSecret", {
        apiVersion: "external-secrets.io/v1",
        kind: "ExternalSecret",
        metadata: {
            name: PROXYSQL_RELEASE_NAME,
            namespace: DATABASE_SYSTEM_NAMESPACE,
        },
        spec: {
            data: [{
                remoteRef: {
                    key: proxysqlSecret.secretArn,
                    property: "password",
                },
                secretKey: "proxysql-admin-password",
            },
            {
                remoteRef: {key: rdsSecretArn, property: "password"},
                secretKey: "database-admin-password",
            },
            {
                remoteRef: {key: rdsSecretArn, property: "username"},
                secretKey: "database-admin-username",
            }],
            refreshInterval: "1h",
            secretStoreRef: {
                kind: "ClusterSecretStore",
                name: externalSecrets.secretsManagerStoreName,
            },
            target: {
                creationPolicy: "Owner",
                name: PROXYSQL_RELEASE_NAME,
            },
        },
    });
    const proxysqlMonitorExternalSecret = cluster.addManifest(
        "ProxySqlMonitorExternalSecret",
        {
            apiVersion: "external-secrets.io/v1",
            kind: "ExternalSecret",
            metadata: {
                name: PROXYSQL_MONITOR_SECRET_NAME,
                namespace: DATABASE_SYSTEM_NAMESPACE,
            },
            spec: {
                data: [
                    {
                        remoteRef: {
                            key: proxysqlMonitorSecret.secretArn,
                            property: "password",
                        },
                        secretKey: "password",
                    },
                    {
                        remoteRef: {
                            key: proxysqlMonitorSecret.secretArn,
                            property: "username",
                        },
                        secretKey: "username",
                    },
                ],
                refreshInterval: "1h",
                secretStoreRef: {
                    kind: "ClusterSecretStore",
                    name: externalSecrets.secretsManagerStoreName,
                },
                target: {
                    creationPolicy: "Owner",
                    name: PROXYSQL_MONITOR_SECRET_NAME,
                },
            },
        },
    );

    proxysqlAdminSecret.node.addDependency(namespace);
    proxysqlAdminSecret.node.addDependency(externalSecrets.secretsManagerStore);
    proxysqlSecret.grantRead(externalSecrets.role).applyBefore(proxysqlAdminSecret);
    proxysqlMonitorExternalSecret.node.addDependency(namespace);
    proxysqlMonitorExternalSecret.node.addDependency(
        externalSecrets.secretsManagerStore,
    );
    proxysqlMonitorSecret.grantRead(externalSecrets.role).applyBefore(
        proxysqlMonitorExternalSecret,
    );
    const chartAsset = new s3assets.Asset(scope, "ProxySqlChartAsset", {
        path: path.join(__dirname, "../../../proxysql/chart"),
    });
    const chart = new eks.HelmChart(scope, "ProxySqlHelmRelease", {
        atomic: true,
        chartAsset: chartAsset,
        cluster: cluster,
        createNamespace: false,
        namespace: DATABASE_SYSTEM_NAMESPACE,
        release: PROXYSQL_RELEASE_NAME,
        values: {
            database: {
                host: rdsHost,
                monitorSecretName: PROXYSQL_MONITOR_SECRET_NAME,
                port: rdsPort,
            },
            image: {
                repository: PROXYSQL_IMAGE_REPOSITORY,
                tag: PROXYSQL_IMAGE_TAG,
            },
            proxysql: {
                adminSecretName: PROXYSQL_RELEASE_NAME,
                backendConnectionBudget: RDS_BACKEND_CONNECTION_BUDGET,
                replicas: PROXYSQL_REPLICAS,
            },
        },
        wait: true,
    });

    chart.node.addDependency(namespace);
    chart.node.addDependency(proxysqlAdminSecret);
    chart.node.addDependency(proxysqlMonitorExternalSecret);

    return {chart: chart, namespace: namespace};
};
