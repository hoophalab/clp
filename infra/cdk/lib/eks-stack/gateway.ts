/* eslint-disable max-lines */
import * as eks from "aws-cdk-lib/aws-eks";
import {Construct} from "constructs";

import {
    DEPLOYMENTS_GATEWAY_NAME,
    GATEWAY_SYSTEM_NAMESPACE,
} from "../gateway-constants";
import {CertManagerResources} from "./cert-manager";
import {ExternalDnsResources} from "./external-dns";
import {ExternalSecretsResources} from "./external-secrets";


export const ENVOY_GATEWAY_SYSTEM_NAMESPACE = "envoy-gateway-system";
const ENVOY_GATEWAY_CHART = "oci://docker.io/envoyproxy/gateway-helm";
const ENVOY_GATEWAY_CONTROLLER_NAME = "gateway.envoyproxy.io/gatewayclass-controller";
const ENVOY_GATEWAY_RELEASE_NAME = "envoy-gateway";
const ENVOY_GATEWAY_CLASS_NAME = "envoy-gateway";
export const CLOUDFLARE_API_TOKEN_SECRET_NAME = "cloudflare-api-token";
export const CLOUDFLARE_API_TOKEN_SECRET_KEY = "api-token";
const LETSENCRYPT_ISSUER_NAME = "letsencrypt";
const LETSENCRYPT_SERVER = "https://acme-v02.api.letsencrypt.org/directory";
const GATEWAY_TLS_SECRET_NAME = "deployments-gateway-tls";

export interface GatewayResources {
    chart: eks.HelmChart;
}

/**
 * Adds Envoy Gateway resources to the EKS cluster.
 *
 * @param config Envoy Gateway configuration.
 * @param config.certManager Installed cert-manager resources.
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
// eslint-disable-next-line max-lines-per-function, max-statements
export const addGateway = function (
    {
        certManager,
        cloudflareApiTokenParameterName,
        cluster,
        clusterName,
        domainName,
        envoyGatewayChartVersion,
        externalDns,
        externalSecrets,
        scope,
    }: {
        certManager: CertManagerResources;
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
    certManager.chart.node.addDependency(helmChart);

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
                refreshInterval: "1h",
                refreshPolicy: "Periodic",
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
        metadata: {name: GATEWAY_SYSTEM_NAMESPACE},
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
            annotations: {
                "cert-manager.io/issuer": LETSENCRYPT_ISSUER_NAME,
            },
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
                            from: "Same",
                        },
                    },
                    hostname: hostname,
                    name: "http",
                    port: 80,
                    protocol: "HTTP",
                },
                {
                    allowedRoutes: {
                        namespaces: {
                            from: "All",
                        },
                    },
                    hostname: hostname,
                    name: "https",
                    port: 443,
                    protocol: "HTTPS",
                    tls: {
                        certificateRefs: [
                            {
                                group: "",
                                kind: "Secret",
                                name: GATEWAY_TLS_SECRET_NAME,
                            },
                        ],
                        mode: "Terminate",
                    },
                },
            ],
        },
    });

    const httpRedirect = cluster.addManifest(
        "DeploymentsGatewayHttpRedirect",
        {
            apiVersion: "gateway.networking.k8s.io/v1",
            kind: "HTTPRoute",
            metadata: {
                name: "https-redirect",
                namespace: GATEWAY_SYSTEM_NAMESPACE,
            },
            spec: {
                parentRefs: [
                    {
                        group: "gateway.networking.k8s.io",
                        kind: "Gateway",
                        name: DEPLOYMENTS_GATEWAY_NAME,
                        sectionName: "http",
                    },
                ],
                rules: [
                    {
                        filters: [
                            {
                                requestRedirect: {
                                    scheme: "https",
                                    statusCode: 301,
                                },
                                type: "RequestRedirect",
                            },
                        ],
                    },
                ],
            },
        },
    );

    httpRedirect.node.addDependency(gateway);

    const issuerTokenSecret = cluster.addManifest(
        "IssuerCloudflareTokenExternalSecret",
        {
            apiVersion: "external-secrets.io/v1",
            kind: "ExternalSecret",
            metadata: {
                name: CLOUDFLARE_API_TOKEN_SECRET_NAME,
                namespace: GATEWAY_SYSTEM_NAMESPACE,
            },
            spec: {
                data: [{
                    remoteRef: {key: cloudflareApiTokenParameterName},
                    secretKey: CLOUDFLARE_API_TOKEN_SECRET_KEY,
                }],
                refreshInterval: "1h",
                refreshPolicy: "Periodic",
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

    issuerTokenSecret.node.addDependency(gatewayNamespace);
    issuerTokenSecret.node.addDependency(externalSecrets.secretStore);

    const issuer = cluster.addManifest("LetsEncryptIssuer", {
        apiVersion: "cert-manager.io/v1",
        kind: "Issuer",
        metadata: {
            name: LETSENCRYPT_ISSUER_NAME,
            namespace: GATEWAY_SYSTEM_NAMESPACE,
        },
        spec: {
            acme: {
                privateKeySecretRef: {name: "letsencrypt-account-key"},
                server: LETSENCRYPT_SERVER,
                solvers: [
                    {
                        dns01: {
                            cloudflare: {
                                apiTokenSecretRef: {
                                    key: CLOUDFLARE_API_TOKEN_SECRET_KEY,
                                    name: CLOUDFLARE_API_TOKEN_SECRET_NAME,
                                },
                            },
                        },
                        selector: {dnsZones: [domainName]},
                    },
                ],
            },
        },
    });

    issuer.node.addDependency(certManager.chart);
    issuer.node.addDependency(issuerTokenSecret);

    gateway.node.addDependency(issuer);
    gateway.node.addDependency(gatewayClassManifest);
    gateway.node.addDependency(envoyProxy);
    gateway.node.addDependency(gatewayNamespace);
    envoyProxy.node.addDependency(helmChart);
    envoyProxy.node.addDependency(gatewayNamespace);

    return {chart: helmChart};
};
