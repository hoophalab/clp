import * as eks from "aws-cdk-lib/aws-eks";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cdk from "aws-cdk-lib/core";
import {Construct} from "constructs";

import {
    GATEWAY_SYSTEM_NAMESPACE,
    PARAMETER_STORE_NAME,
} from "../gateway-constants";
import {EXTERNAL_DNS_NAMESPACE} from "./external-dns";


const EXTERNAL_SECRETS_NAMESPACE = "external-secrets";
const EXTERNAL_SECRETS_RELEASE_NAME = "external-secrets";
const EXTERNAL_SECRETS_REPOSITORY = "https://charts.external-secrets.io";
const EXTERNAL_SECRETS_SERVICE_ACCOUNT_NAME = "external-secrets";
export interface ExternalSecretsResources {
    chart: eks.HelmChart;
    namespace: eks.KubernetesManifest;
    secretStore: eks.KubernetesManifest;
    secretStoreName: string;
}

/**
 * Installs External Secrets Operator with IRSA and an SSM Parameter Store backend.
 *
 * @param config External Secrets Operator configuration.
 * @param config.chartVersion External Secrets Operator Helm chart version.
 * @param config.cluster EKS cluster.
 * @param config.parameterNames SSM parameters that the operator may read.
 * @param config.scope Construct scope.
 * @return Installed operator resources and its ClusterSecretStore.
 */
// eslint-disable-next-line max-lines-per-function
export const addExternalSecrets = function (
    {
        chartVersion,
        cluster,
        parameterNames,
        scope,
    }: {
        chartVersion: string;
        cluster: eks.Cluster;
        parameterNames: string[];
        scope: Construct;
    },
): ExternalSecretsResources {
    const namespace = cluster.addManifest("ExternalSecretsNamespace", {
        apiVersion: "v1",
        kind: "Namespace",
        metadata: {name: EXTERNAL_SECRETS_NAMESPACE},
    });
    const serviceAccountSubject = [
        "system:serviceaccount",
        EXTERNAL_SECRETS_NAMESPACE,
        EXTERNAL_SECRETS_SERVICE_ACCOUNT_NAME,
    ].join(":");
    const conditions = new cdk.CfnJson(scope, "ExternalSecretsRoleConditions", {
        value: {
            [`${cluster.openIdConnectProvider.openIdConnectProviderIssuer}:aud`]:
                "sts.amazonaws.com",
            [`${cluster.openIdConnectProvider.openIdConnectProviderIssuer}:sub`]:
                serviceAccountSubject,
        },
    });
    const role = new iam.Role(scope, "ExternalSecretsRole", {
        assumedBy: new iam.OpenIdConnectPrincipal(
            cluster.openIdConnectProvider,
            {StringEquals: conditions},
        ),
        description: "Reads gateway credentials from SSM Parameter Store.",
    });
    const parameterArns = parameterNames.map((parameterName) => {
        return cdk.Stack.of(scope).formatArn({
            arnFormat: cdk.ArnFormat.SLASH_RESOURCE_NAME,
            resource: "parameter",
            resourceName: parameterName.replace(/^\/+/, ""),
            service: "ssm",
        });
    });

    role.addToPolicy(new iam.PolicyStatement({
        actions: ["ssm:GetParameter"],
        resources: parameterArns,
    }));

    const chart = new eks.HelmChart(scope, "ExternalSecretsHelmRelease", {
        atomic: true,
        chart: EXTERNAL_SECRETS_RELEASE_NAME,
        cluster: cluster,
        createNamespace: false,
        namespace: EXTERNAL_SECRETS_NAMESPACE,
        release: EXTERNAL_SECRETS_RELEASE_NAME,
        repository: EXTERNAL_SECRETS_REPOSITORY,
        values: {
            rbac: {
                serviceAccountTokenCreate: false,
            },
            serviceAccount: {
                annotations: {"eks.amazonaws.com/role-arn": role.roleArn},
                name: EXTERNAL_SECRETS_SERVICE_ACCOUNT_NAME,
            },
        },
        version: chartVersion,
        wait: true,
    });

    chart.node.addDependency(namespace);

    const secretStore = cluster.addManifest("ParameterStore", {
        apiVersion: "external-secrets.io/v1",
        kind: "ClusterSecretStore",
        metadata: {name: PARAMETER_STORE_NAME},
        spec: {
            conditions: [
                {
                    namespaces: [
                        EXTERNAL_DNS_NAMESPACE,
                        GATEWAY_SYSTEM_NAMESPACE,
                    ],
                },
            ],
            provider: {
                aws: {
                    region: cdk.Stack.of(scope).region,
                    service: "ParameterStore",
                },
            },
        },
    });

    secretStore.node.addDependency(chart);

    return {
        chart: chart,
        namespace: namespace,
        secretStore: secretStore,
        secretStoreName: PARAMETER_STORE_NAME,
    };
};
