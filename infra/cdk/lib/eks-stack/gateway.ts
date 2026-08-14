/* eslint-disable max-lines */
import * as eks from "aws-cdk-lib/aws-eks";
import {Construct} from "constructs";

import {
    DEPLOYMENTS_GATEWAY_NAME,
    GATEWAY_SYSTEM_NAMESPACE,
    PARAMETER_STORE_NAME,
} from "../gateway-constants";
import {
    addAuthServer,
    AUTH_SERVER_PORT,
    AUTH_SERVER_RELEASE_NAME,
} from "./auth-server";
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
const AUTH0_CLIENT_SECRET_NAME = "auth0-client-secret";
const AUTH0_CALLBACK_PATH = "/oauth2/callback";
const AUTH0_LOGOUT_PATH = "/logout";
const AUTH0_ID_TOKEN = "Auth0IdToken";
const AUTH0_ACCESS_TOKEN_COOKIE = "YscopeAccessToken";
const AUTH0_USER_ID_HEADER = "x-auth0-user-id";
const APEX_HTTPS_LISTENER_NAME = "apex-https";

export interface GatewayResources {
    chart: eks.HelmChart;
}

/**
 * Protects all HTTPS routes on the deployments gateway with Auth0 OIDC.
 *
 * @param config Auth0 gateway configuration.
 * @param config.auth0ClientId Auth0 application client ID.
 * @param config.auth0ClientSecretParameterName SSM client secret parameter.
 * @param config.auth0Domain Auth0 tenant domain.
 * @param config.cluster EKS cluster.
 * @param config.clusterDomain Cluster-specific public domain.
 * @param config.externalSecrets Installed External Secrets resources.
 * @param config.gateway Deployments Gateway manifest.
 * @param config.gatewayNamespace Gateway namespace manifest.
 * @param config.authServerChart Auth server Helm release.
 */
// eslint-disable-next-line max-lines-per-function
const addAuth0 = function (
    {
        auth0ClientId,
        auth0ClientSecretParameterName,
        auth0Domain,
        authServerChart,
        cluster,
        clusterDomain,
        externalSecrets,
        gateway,
        gatewayNamespace,
    }: {
        auth0ClientId: string;
        auth0ClientSecretParameterName: string;
        auth0Domain: string;
        authServerChart: eks.HelmChart;
        cluster: eks.Cluster;
        clusterDomain: string;
        externalSecrets: ExternalSecretsResources;
        gateway: eks.KubernetesManifest;
        gatewayNamespace: eks.KubernetesManifest;
    },
): void {
    const clientSecret = cluster.addManifest("Auth0ClientSecret", {
        apiVersion: "external-secrets.io/v1",
        kind: "ExternalSecret",
        metadata: {
            name: AUTH0_CLIENT_SECRET_NAME,
            namespace: GATEWAY_SYSTEM_NAMESPACE,
        },
        spec: {
            data: [
                {
                    remoteRef: {key: auth0ClientSecretParameterName},
                    secretKey: "client-secret",
                },
            ],
            refreshInterval: "1h",
            secretStoreRef: {
                kind: "ClusterSecretStore",
                name: PARAMETER_STORE_NAME,
            },
            target: {
                creationPolicy: "Owner",
                name: AUTH0_CLIENT_SECRET_NAME,
            },
        },
    });

    clientSecret.node.addDependency(externalSecrets.secretStore);
    clientSecret.node.addDependency(gatewayNamespace);

    const callbackRoute = cluster.addManifest("Auth0CallbackRoute", {
        apiVersion: "gateway.networking.k8s.io/v1",
        kind: "HTTPRoute",
        metadata: {
            name: "auth0-callback",
            namespace: GATEWAY_SYSTEM_NAMESPACE,
        },
        spec: {
            hostnames: [clusterDomain],
            parentRefs: [
                {
                    group: "gateway.networking.k8s.io",
                    kind: "Gateway",
                    name: DEPLOYMENTS_GATEWAY_NAME,
                    sectionName: APEX_HTTPS_LISTENER_NAME,
                },
            ],
            rules: [
                {
                    matches: [
                        {
                            path: {
                                type: "PathPrefix",
                                value: "/",
                            },
                        },
                    ],
                },
            ],
        },
    });

    callbackRoute.node.addDependency(gateway);

    const securityPolicy = cluster.addManifest("Auth0SecurityPolicy", {
        apiVersion: "gateway.envoyproxy.io/v1alpha1",
        kind: "SecurityPolicy",
        metadata: {
            name: "auth0",
            namespace: GATEWAY_SYSTEM_NAMESPACE,
        },
        spec: {
            oidc: {
                clientID: auth0ClientId,
                clientSecret: {name: AUTH0_CLIENT_SECRET_NAME},
                cookieDomain: clusterDomain,
                cookieNames: {
                    accessToken: AUTH0_ACCESS_TOKEN_COOKIE,
                    idToken: AUTH0_ID_TOKEN,
                },
                disableTokenEncryption: true,
                logoutPath: AUTH0_LOGOUT_PATH,
                provider: {issuer: `https://${auth0Domain}`},
                redirectURL: `https://${clusterDomain}${AUTH0_CALLBACK_PATH}`,
            },
            extAuth: {
                failOpen: false,
                headersToExtAuth: [
                    AUTH0_USER_ID_HEADER,
                ],
                http: {
                    backendRefs: [{
                        name: AUTH_SERVER_RELEASE_NAME,
                        port: AUTH_SERVER_PORT,
                    }],
                    pathOverride: "/authorize",
                },
                timeout: "5s",
            },
            jwt: {
                providers: [{
                    audiences: [auth0ClientId],
                    claimToHeaders: [{
                        claim: "sub",
                        header: AUTH0_USER_ID_HEADER,
                    }],
                    extractFrom: {cookies: [AUTH0_ID_TOKEN]},
                    issuer: `https://${auth0Domain}/`,
                    name: "auth0",
                    remoteJWKS: {
                        uri: `https://${auth0Domain}/.well-known/jwks.json`,
                    },
                }],
            },
            targetRefs: [
                {
                    group: "gateway.networking.k8s.io",
                    kind: "Gateway",
                    name: DEPLOYMENTS_GATEWAY_NAME,
                    sectionName: "https",
                },
                {
                    group: "gateway.networking.k8s.io",
                    kind: "Gateway",
                    name: DEPLOYMENTS_GATEWAY_NAME,
                    sectionName: APEX_HTTPS_LISTENER_NAME,
                },
            ],
        },
    });

    securityPolicy.node.addDependency(callbackRoute);
    securityPolicy.node.addDependency(authServerChart);
    securityPolicy.node.addDependency(clientSecret);
    securityPolicy.node.addDependency(gateway);
};

/**
 * Adds Envoy Gateway resources to the EKS cluster.
 *
 * @param config Envoy Gateway configuration.
 * @param config.auth0ClientId Auth0 application client ID.
 * @param config.auth0ClientSecretParameterName SSM client secret parameter.
 * @param config.auth0Domain Auth0 tenant domain.
 * @param config.rdsHost RDS hostname.
 * @param config.rdsName RDS database name.
 * @param config.rdsPort Database listener port.
 * @param config.rdsUsername Database login user.
 * @param config.certManager Installed cert-manager resources.
 * @param config.cloudflareApiTokenParameterName SSM parameter containing the token.
 * @param config.cluster EKS cluster.
 * @param config.clusterName Cluster-scoped environment name.
 * @param config.domainName Public base domain.
 * @param config.envoyGatewayChartVersion Envoy Gateway Helm chart version.
 * @param config.externalDns Installed ExternalDNS resources.
 * @param config.externalSecrets Installed External Secrets resources.
 * @param config.scope Construct scope.
 * @param config.rdsSecretArn RDS credentials secret ARN.
 * @param config.authServerImageRepository ECR image repository.
 * @param config.authServerImageTag Immutable container version to deploy.
 * @return Installed gateway resources.
 */
// eslint-disable-next-line max-lines-per-function, max-statements
export const addGateway = function (
    {
        auth0ClientId,
        auth0ClientSecretParameterName,
        auth0Domain,
        rdsHost,
        rdsName,
        rdsPort,
        rdsSecretArn,
        rdsUsername,
        authServerImageRepository,
        authServerImageTag,
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
        auth0ClientId: string;
        auth0ClientSecretParameterName: string;
        auth0Domain: string;
        rdsHost: string;
        rdsName: string;
        rdsPort: number;
        rdsSecretArn: string;
        rdsUsername: string;
        authServerImageRepository: string;
        authServerImageTag: string;
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

    const clusterDomain = `${clusterName}.${domainName}`;
    const wildcardHostname = `*.${clusterDomain}`;
    const authServerChart = addAuthServer({
        baseDomain: clusterDomain,
        chartDependency: gatewayNamespace,
        cluster: cluster,
        externalSecrets: externalSecrets,
        imageRepository: authServerImageRepository,
        imageTag: authServerImageTag,
        rdsHost: rdsHost,
        rdsName: rdsName,
        rdsPort: rdsPort,
        rdsSecretArn: rdsSecretArn,
        rdsUsername: rdsUsername,
        scope: scope,
    });
    const envoyProxy = cluster.addManifest("DeploymentsGatewayEnvoyProxy", {
        apiVersion: "gateway.envoyproxy.io/v1alpha1",
        kind: "EnvoyProxy",
        metadata: {
            name: "deployments-gateway-proxy",
            namespace: GATEWAY_SYSTEM_NAMESPACE,
        },
        spec: {
            filterOrder: [{
                after: "envoy.filters.http.jwt_authn",
                name: "envoy.filters.http.ext_authz",
            }],
            provider: {
                kubernetes: {
                    envoyService: {
                        annotations: {
                            "external-dns.alpha.kubernetes.io/hostname":
                                `${clusterDomain},${wildcardHostname}`,
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
                    hostname: wildcardHostname,
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
                    hostname: wildcardHostname,
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
                {
                    allowedRoutes: {
                        namespaces: {
                            from: "Same",
                        },
                    },
                    hostname: clusterDomain,
                    name: APEX_HTTPS_LISTENER_NAME,
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

    addAuth0({
        auth0ClientId: auth0ClientId,
        auth0ClientSecretParameterName: auth0ClientSecretParameterName,
        auth0Domain: auth0Domain,
        authServerChart: authServerChart,
        cluster: cluster,
        clusterDomain: clusterDomain,
        externalSecrets: externalSecrets,
        gateway: gateway,
        gatewayNamespace: gatewayNamespace,
    });

    return {chart: helmChart};
};
/* eslint-enable max-lines */
