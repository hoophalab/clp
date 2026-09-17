import * as eks from "aws-cdk-lib/aws-eks";

import {
    AUTH_SERVER_PORT,
    AUTH_SERVER_RELEASE_NAME,
} from "../eks-stack/auth-server";
import {
    DEPLOYMENTS_GATEWAY_NAME,
    GATEWAY_SYSTEM_NAMESPACE,
} from "../gateway-constants";


const CLP_HELM_RELEASE_NAME = "clp";
const CLP_API_ROUTE_PREFIX = "/v1";
const CLP_API_SERVER_SERVICE_NAME = `${CLP_HELM_RELEASE_NAME}-api-server`;
const CLP_API_SERVER_SERVICE_PORT = 3001;
const CLP_LOG_INGESTOR_SERVICE_NAME = `${CLP_HELM_RELEASE_NAME}-log-ingestor`;
const CLP_LOG_INGESTOR_ROUTE_PREFIX = "/log_ingestor";
const CLP_LOG_INGESTOR_SERVICE_PORT = 3002;
const CLP_WEBUI_SERVICE_NAME = `${CLP_HELM_RELEASE_NAME}-webui`;
const CLP_WEBUI_SERVICE_PORT = 4000;

/**
 * Creates an HTTPRoute rule for a CLP service.
 *
 * @param backendServiceName Kubernetes service receiving routed traffic.
 * @param backendServicePort Kubernetes service port receiving routed traffic.
 * @param routePrefix Public route prefix.
 * @param apiToken Whether the rule is for API-token-authenticated traffic.
 * @return HTTPRoute rule object.
 */
const createHttpRouteRule = function (
    backendServiceName: string,
    backendServicePort: number,
    routePrefix: string,
    apiToken = false,
): Record<string, unknown> {
    return {
        backendRefs: [
            {
                name: backendServiceName,
                port: backendServicePort,
            },
        ],
        filters: [
            {
                type: "URLRewrite",
                urlRewrite: {
                    path: {
                        replacePrefixMatch: "/",
                        type: "ReplacePrefixMatch",
                    },
                },
            },
            ...(apiToken ?
                [{
                    requestHeaderModifier: {remove: ["Authorization"]},
                    type: "RequestHeaderModifier",
                }] :
                []),
        ],
        matches: [
            {
                path: {
                    type: "PathPrefix",
                    value: routePrefix,
                },
                ...(apiToken ?
                    {
                        headers: [{
                            name: "Authorization",
                            type: "RegularExpression",
                            value: "(?i)^Bearer +ysclp_.+$",
                        }],
                    } :
                    {}),
            },
        ],
    };
};

/**
 * Adds the CLP HTTPRoute manifests to the cluster.
 *
 * @param cluster Imported EKS cluster.
 * @param namespace CLP deployment namespace.
 * @param hostname Public hostname for this CLP deployment.
 * @return Kubernetes manifest constructs for the HTTPRoutes: `auth0Route` for
 * Auth0-authenticated traffic and `apiTokenRoute` for API-token-authenticated
 * traffic to the API server and log ingestor.
 */
// eslint-disable-next-line max-lines-per-function
const addHttpRoutes = function (
    cluster: eks.ICluster,
    namespace: string,
    hostname: string,
): {
    apiTokenRoute: eks.KubernetesManifest;
    auth0Route: eks.KubernetesManifest;
} {
    const parentRefs = [{
        group: "gateway.networking.k8s.io",
        kind: "Gateway",
        name: DEPLOYMENTS_GATEWAY_NAME,
        namespace: GATEWAY_SYSTEM_NAMESPACE,
    }];

    return {
        auth0Route: cluster.addManifest("HttpRoute", {
            apiVersion: "gateway.networking.k8s.io/v1",
            kind: "HTTPRoute",
            metadata: {
                name: "clp-route",
                namespace: namespace,
            },
            spec: {
                hostnames: [hostname],
                parentRefs: parentRefs,
                rules: [
                    createHttpRouteRule(
                        CLP_API_SERVER_SERVICE_NAME,
                        CLP_API_SERVER_SERVICE_PORT,
                        CLP_API_ROUTE_PREFIX,
                    ),
                    createHttpRouteRule(
                        CLP_LOG_INGESTOR_SERVICE_NAME,
                        CLP_LOG_INGESTOR_SERVICE_PORT,
                        CLP_LOG_INGESTOR_ROUTE_PREFIX,
                    ),
                    createHttpRouteRule(
                        CLP_WEBUI_SERVICE_NAME,
                        CLP_WEBUI_SERVICE_PORT,
                        "/",
                    ),
                ],
            },
        }),
        apiTokenRoute: cluster.addManifest("ApiTokenHttpRoute", {
            apiVersion: "gateway.networking.k8s.io/v1",
            kind: "HTTPRoute",
            metadata: {
                name: "clp-api-token-route",
                namespace: namespace,
            },
            spec: {
                hostnames: [hostname],
                parentRefs: parentRefs,
                rules: [
                    createHttpRouteRule(
                        CLP_API_SERVER_SERVICE_NAME,
                        CLP_API_SERVER_SERVICE_PORT,
                        CLP_API_ROUTE_PREFIX,
                        true,
                    ),
                    createHttpRouteRule(
                        CLP_LOG_INGESTOR_SERVICE_NAME,
                        CLP_LOG_INGESTOR_SERVICE_PORT,
                        CLP_LOG_INGESTOR_ROUTE_PREFIX,
                        true,
                    ),
                ],
            },
        }),
    };
};

/**
 * Adds Gateway API routing for a CLP deployment.
 *
 * @param config Gateway resource configuration.
 * @param config.cluster Imported EKS cluster.
 * @param config.helmChart CLP Helm release construct.
 * @param config.hostname Public hostname for this CLP deployment.
 * @param config.namespace CLP deployment namespace.
 * @param config.namespaceManifest Manifest that creates the CLP namespace.
 */
// eslint-disable-next-line max-lines-per-function
export const addGatewayResources = function (
    {
        cluster,
        helmChart,
        hostname,
        namespace,
        namespaceManifest,
    }: {
        cluster: eks.ICluster;
        helmChart: eks.HelmChart;
        hostname: string;
        namespace: string;
        namespaceManifest: eks.KubernetesManifest;
    },
): void {
    const httpRoutes = addHttpRoutes(cluster, namespace, hostname);
    httpRoutes.auth0Route.node.addDependency(helmChart);
    httpRoutes.apiTokenRoute.node.addDependency(helmChart);

    const authServerReferenceGrant = cluster.addManifest(
        "ApiTokenAuthServerReferenceGrant",
        {
            apiVersion: "gateway.networking.k8s.io/v1beta1",
            kind: "ReferenceGrant",
            metadata: {
                name: `${namespace}-api-token-auth-server`,
                namespace: GATEWAY_SYSTEM_NAMESPACE,
            },
            spec: {
                from: [{
                    group: "gateway.envoyproxy.io",
                    kind: "SecurityPolicy",
                    namespace: namespace,
                }],
                to: [{
                    group: "",
                    kind: "Service",
                    name: AUTH_SERVER_RELEASE_NAME,
                }],
            },
        },
    );

    authServerReferenceGrant.node.addDependency(namespaceManifest);

    const apiTokenSecurityPolicy = cluster.addManifest(
        "ApiTokenSecurityPolicy",
        {
            apiVersion: "gateway.envoyproxy.io/v1alpha1",
            kind: "SecurityPolicy",
            metadata: {name: "clp-api-token", namespace: namespace},
            spec: {
                extAuth: {
                    failOpen: false,
                    headersToExtAuth: ["Authorization"],
                    http: {
                        backendRefs: [{
                            name: AUTH_SERVER_RELEASE_NAME,
                            namespace: GATEWAY_SYSTEM_NAMESPACE,
                            port: AUTH_SERVER_PORT,
                        }],
                        pathOverride: "/authorize/api-token",
                    },
                    timeout: "5s",
                },
                targetRefs: [{
                    group: "gateway.networking.k8s.io",
                    kind: "HTTPRoute",
                    name: "clp-api-token-route",
                }],
            },
        },
    );

    apiTokenSecurityPolicy.node.addDependency(httpRoutes.apiTokenRoute);
    apiTokenSecurityPolicy.node.addDependency(authServerReferenceGrant);
};
