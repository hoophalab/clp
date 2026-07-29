import * as eks from "aws-cdk-lib/aws-eks";

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
 * @return HTTPRoute rule object.
 */
const createHttpRouteRule = function (
    backendServiceName: string,
    backendServicePort: number,
    routePrefix: string,
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
        ],
        matches: [
            {
                path: {
                    type: "PathPrefix",
                    value: routePrefix,
                },
            },
        ],
    };
};

/**
 * Adds the CLP HTTPRoute manifest to the cluster.
 *
 * @param cluster Imported EKS cluster.
 * @param namespace CLP deployment namespace.
 * @param hostname Public hostname for this CLP deployment.
 * @return Kubernetes manifest construct for the HTTPRoute.
 */
const addHttpRoute = function (
    cluster: eks.ICluster,
    namespace: string,
    hostname: string,
): eks.KubernetesManifest {
    return cluster.addManifest("HttpRoute", {
        apiVersion: "gateway.networking.k8s.io/v1",
        kind: "HTTPRoute",
        metadata: {
            name: "clp-route",
            namespace: namespace,
        },
        spec: {
            hostnames: [hostname],
            parentRefs: [
                {
                    group: "gateway.networking.k8s.io",
                    kind: "Gateway",
                    name: DEPLOYMENTS_GATEWAY_NAME,
                    namespace: GATEWAY_SYSTEM_NAMESPACE,
                },
            ],
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
    });
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
    const httpRouteManifest = addHttpRoute(
        cluster,
        namespace,
        hostname,
    );

    httpRouteManifest.node.addDependency(namespaceManifest);
    httpRouteManifest.node.addDependency(helmChart);
};
