import path from "node:path";

import * as eks from "aws-cdk-lib/aws-eks";
import * as s3assets from "aws-cdk-lib/aws-s3-assets";
import {Construct} from "constructs";

import {GATEWAY_SYSTEM_NAMESPACE} from "../gateway-constants";
import {ExternalSecretsResources} from "./external-secrets";


export const AUTH_SERVER_RELEASE_NAME = "auth-server";
export const AUTH_SERVER_PORT = 8080;
const DATABASE_SECRET_NAME = "auth-server-database";


/**
 * Installs the auth server and its database secret.
 *
 * @param config
 * @param config.baseDomain
 * @param config.chartDependency
 * @param config.cluster
 * @param config.rdsHost
 * @param config.rdsName
 * @param config.rdsPort
 * @param config.rdsSecretArn
 * @param config.rdsUsername
 * @param config.externalSecrets
 * @param config.imageRepository
 * @param config.imageTag
 * @param config.scope
 * @return Auth server Helm release.
 */
// eslint-disable-next-line max-lines-per-function
export const addAuthServer = function (
    {
        baseDomain,
        chartDependency,
        cluster,
        rdsHost,
        rdsName,
        rdsPort,
        rdsSecretArn,
        rdsUsername,
        externalSecrets,
        imageRepository,
        imageTag,
        scope,
    }: {
        baseDomain: string;
        chartDependency: eks.KubernetesManifest;
        cluster: eks.Cluster;
        rdsHost: string;
        rdsName: string;
        rdsPort: number;
        rdsSecretArn: string;
        rdsUsername: string;
        externalSecrets: ExternalSecretsResources;
        imageRepository: string;
        imageTag: string;
        scope: Construct;
    },
): eks.HelmChart {
    const databaseSecret = cluster.addManifest("DatabaseSecret", {
        apiVersion: "external-secrets.io/v1",
        kind: "ExternalSecret",
        metadata: {
            name: DATABASE_SECRET_NAME,
            namespace: GATEWAY_SYSTEM_NAMESPACE,
        },
        spec: {
            data: [{
                remoteRef: {
                    key: rdsSecretArn,
                    property: "password",
                },
                secretKey: "password",
            }],
            refreshInterval: "1h",
            secretStoreRef: {
                kind: "ClusterSecretStore",
                name: externalSecrets.secretsManagerStoreName,
            },
            target: {
                creationPolicy: "Owner",
                name: DATABASE_SECRET_NAME,
            },
        },
    });

    databaseSecret.node.addDependency(chartDependency);
    databaseSecret.node.addDependency(externalSecrets.secretsManagerStore);

    const chartAsset = new s3assets.Asset(scope, "AuthServerChartAsset", {
        path: path.join(__dirname, "../../../auth-server/chart"),
    });
    const chart = new eks.HelmChart(scope, "AuthServerHelmRelease", {
        atomic: true,
        chartAsset: chartAsset,
        cluster: cluster,
        createNamespace: false,
        namespace: GATEWAY_SYSTEM_NAMESPACE,
        release: AUTH_SERVER_RELEASE_NAME,
        values: {
            baseDomain: baseDomain,
            database: {
                host: rdsHost,
                name: rdsName,
                port: rdsPort,
                username: rdsUsername,
            },
            image: {
                repository: imageRepository,
                tag: imageTag,
            },
        },
        wait: true,
    });

    chart.node.addDependency(databaseSecret);

    return chart;
};
