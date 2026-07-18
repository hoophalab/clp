/* eslint-disable max-lines-per-function */
import * as eks from "aws-cdk-lib/aws-eks";
import {Construct} from "constructs";

import {
    DEPLOYMENTS_GATEWAY_NAME,
    GATEWAY_SYSTEM_NAMESPACE,
} from "../gateway-constants";
import {ExternalDnsResources} from "./external-dns";
import {ExternalSecretsResources} from "./external-secrets";


export const ENVOY_GATEWAY_SYSTEM_NAMESPACE = "envoy-gateway-system";
const ENVOY_GATEWAY_CHART = "oci://docker.io/envoyproxy/gateway-helm";
const ENVOY_GATEWAY_CONTROLLER_NAME = "gateway.envoyproxy.io/gatewayclass-controller";
const ENVOY_GATEWAY_RELEASE_NAME = "envoy-gateway";
const ENVOY_GATEWAY_CLASS_NAME = "envoy-gateway";
export const CLOUDFLARE_API_TOKEN_SECRET_NAME = "cloudflare-api-token";
export const CLOUDFLARE_API_TOKEN_SECRET_KEY = "api-token";

export interface GatewayResources {
    chart: eks.HelmChart;
}

/**
 * Adds Envoy Gateway resources to the EKS cluster.
 *
 * @param config Envoy Gateway configuration.
 * @param config.cloudflareApiTokenParameterName SSM parameter containing the token.
 * @param config.cluster EKS cluster.
 * @param config.clusterName Cluster-scoped environment name.
 * @param config.domainName Public base domain.
 * @param config.envoyGatewayChartVersion Envoy Gateway Helm chart version.
 * @param config.externalDns Installed ExternalDNS resources.
 * @param config.externalSecrets Installed External Secrets resources.
 * @param config.scope Construct scope.
 * @return Installed gateway resources.
 */
export const addGateway = function (
    {
        cloudflareApiTokenParameterName,
        cluster,
        clusterName,
        domainName,
        envoyGatewayChartVersion,
        externalDns,
        externalSecrets,
        scope,
    }: {
        cloudflareApiTokenParameterName: string;
        cluster: eks.Cluster;
        clusterName: string;
        domainName: string;
        envoyGatewayChartVersion: string;
        externalDns: ExternalDnsResources;
        externalSecrets: ExternalSecretsResources;
        scope: Construct;
    },
): GatewayResources {
    const envoyGatewayNamespace = cluster.addManifest("EnvoyGatewayNamespace", {
        apiVersion: "v1",
        kind: "Namespace",
        metadata: {
            name: ENVOY_GATEWAY_SYSTEM_NAMESPACE,
        },
    });

    const helmChart = new eks.HelmChart(scope, "EnvoyGatewayHelmRelease", {
        atomic: true,
        chart: ENVOY_GATEWAY_CHART,
        cluster: cluster,
        createNamespace: false,
        namespace: ENVOY_GATEWAY_SYSTEM_NAMESPACE,
        release: ENVOY_GATEWAY_RELEASE_NAME,
        version: envoyGatewayChartVersion,
        wait: true,
    });

    helmChart.node.addDependency(envoyGatewayNamespace);

    const gatewayClassManifest = cluster.addManifest("EnvoyGatewayClass", {
        apiVersion: "gateway.networking.k8s.io/v1",
        kind: "GatewayClass",
        metadata: {
            name: ENVOY_GATEWAY_CLASS_NAME,
        },
        spec: {
            controllerName: ENVOY_GATEWAY_CONTROLLER_NAME,
        },
    });

    gatewayClassManifest.node.addDependency(helmChart);

    const externalDnsTokenSecret = cluster.addManifest(
        "ExternalDnsCloudflareTokenExternalSecret",
        {
            apiVersion: "external-secrets.io/v1",
            kind: "ExternalSecret",
            metadata: {
                name: CLOUDFLARE_API_TOKEN_SECRET_NAME,
                namespace: externalDns.namespaceName,
            },
            spec: {
                data: [{
                    remoteRef: {key: cloudflareApiTokenParameterName},
                    secretKey: CLOUDFLARE_API_TOKEN_SECRET_KEY,
                }],

                // ExternalDNS reads CF_API_TOKEN only at container startup.
                // After refreshing the Secret, restart deployment/external-dns.
                refreshPolicy: "OnChange",
                secretStoreRef: {
                    kind: "ClusterSecretStore",
                    name: externalSecrets.secretStoreName,
                },
                target: {
                    creationPolicy: "Owner",
                    name: CLOUDFLARE_API_TOKEN_SECRET_NAME,
                },
            },
        },
    );

    externalDnsTokenSecret.node.addDependency(externalDns.namespace);
    externalDnsTokenSecret.node.addDependency(externalSecrets.secretStore);
    externalDns.chart.node.addDependency(externalDnsTokenSecret);

    const gatewayNamespace = cluster.addManifest("GatewayNamespace", {
        apiVersion: "v1",
        kind: "Namespace",
        metadata: {
            name: GATEWAY_SYSTEM_NAMESPACE,
        },
    });

    const hostname = `*.${clusterName}.${domainName}`;
    const envoyProxy = cluster.addManifest("DeploymentsGatewayEnvoyProxy", {
        apiVersion: "gateway.envoyproxy.io/v1alpha1",
        kind: "EnvoyProxy",
        metadata: {
            name: "deployments-gateway-proxy",
            namespace: GATEWAY_SYSTEM_NAMESPACE,
        },
        spec: {
            provider: {
                kubernetes: {
                    envoyService: {
                        annotations: {
                            "external-dns.alpha.kubernetes.io/hostname": hostname,
                        },
                    },
                },
                type: "Kubernetes",
            },
        },
    });

    const gateway = cluster.addManifest("DeploymentsGateway", {
        apiVersion: "gateway.networking.k8s.io/v1",
        kind: "Gateway",
        metadata: {
            name: DEPLOYMENTS_GATEWAY_NAME,
            namespace: GATEWAY_SYSTEM_NAMESPACE,
        },
        spec: {
            gatewayClassName: ENVOY_GATEWAY_CLASS_NAME,
            infrastructure: {
                parametersRef: {
                    group: "gateway.envoyproxy.io",
                    kind: "EnvoyProxy",
                    name: "deployments-gateway-proxy",
                },
            },
            listeners: [
                {
                    allowedRoutes: {
                        namespaces: {
                            from: "All",
                        },
                    },
                    hostname: hostname,
                    name: "http",
                    port: 80,
                    protocol: "HTTP",
                },
            ],
        },
    });

    gateway.node.addDependency(gatewayClassManifest);
    gateway.node.addDependency(envoyProxy);
    gateway.node.addDependency(gatewayNamespace);
    envoyProxy.node.addDependency(helmChart);
    envoyProxy.node.addDependency(gatewayNamespace);

    return {chart: helmChart};
};
/* eslint-enable max-lines-per-function */
