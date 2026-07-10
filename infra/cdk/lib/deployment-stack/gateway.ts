import * as eks from "aws-cdk-lib/aws-eks";
import {Construct} from "constructs";

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
const DATABASE_SERVICE_PORT = 3306;
const RESULTS_CACHE_SERVICE_PORT = 27017;

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
 * Patches a CLP NodePort service to remove host node exposure.
 *
 * @param config Patch configuration.
 * @param config.cluster Imported EKS cluster.
 * @param config.helmChart CLP Helm release construct.
 * @param config.id Construct ID.
 * @param config.namespace CLP deployment namespace.
 * @param config.scope Construct scope.
 * @param config.serviceName Kubernetes service name.
 * @param config.servicePort Kubernetes service port.
 * @param config.targetPort Kubernetes service target port.
 * @return Kubernetes patch construct.
 */
const patchNodePortService = function (
    {
        cluster,
        helmChart,
        id,
        namespace,
        scope,
        serviceName,
        servicePort,
        targetPort,
    }: {
        cluster: eks.ICluster;
        helmChart: eks.HelmChart;
        id: string;
        namespace: string;
        scope: Construct;
        serviceName: string;
        servicePort: number;
        targetPort: string;
    },
): eks.KubernetesPatch {
    const servicePatch = new eks.KubernetesPatch(scope, id, {
        applyPatch: {
            spec: {
                ports: [
                    {
                        port: servicePort,
                        targetPort: targetPort,
                    },
                ],
                type: "ClusterIP",
            },
        },
        cluster: cluster,
        patchType: eks.PatchType.MERGE,
        resourceName: `service/${serviceName}`,
        resourceNamespace: namespace,
        restorePatch: {
            spec: {
                type: "NodePort",
            },
        },
    });

    servicePatch.node.addDependency(helmChart);

    return servicePatch;
};

/**
 * Adds patches that remove NodePort exposure from CLP chart services.
 *
 * @param scope Construct scope.
 * @param cluster Imported EKS cluster.
 * @param namespace CLP deployment namespace.
 * @param helmChart CLP Helm release construct.
 */
const addNodePortServicePatches = function (
    scope: Construct,
    cluster: eks.ICluster,
    namespace: string,
    helmChart: eks.HelmChart,
): void {
    patchNodePortService({
        cluster: cluster,
        helmChart: helmChart,
        id: "WebuiServiceNodePortPatch",
        namespace: namespace,
        scope: scope,
        serviceName: CLP_WEBUI_SERVICE_NAME,
        servicePort: CLP_WEBUI_SERVICE_PORT,
        targetPort: "webui",
    });
    patchNodePortService({
        cluster: cluster,
        helmChart: helmChart,
        id: "ApiServerServiceNodePortPatch",
        namespace: namespace,
        scope: scope,
        serviceName: CLP_API_SERVER_SERVICE_NAME,
        servicePort: CLP_API_SERVER_SERVICE_PORT,
        targetPort: "api-server",
    });
    patchNodePortService({
        cluster: cluster,
        helmChart: helmChart,
        id: "LogIngestorServiceNodePortPatch",
        namespace: namespace,
        scope: scope,
        serviceName: CLP_LOG_INGESTOR_SERVICE_NAME,
        servicePort: CLP_LOG_INGESTOR_SERVICE_PORT,
        targetPort: "log-ingestor",
    });
    patchNodePortService({
        cluster: cluster,
        helmChart: helmChart,
        id: "DatabaseServiceNodePortPatch",
        namespace: namespace,
        scope: scope,
        serviceName: `${CLP_HELM_RELEASE_NAME}-database`,
        servicePort: DATABASE_SERVICE_PORT,
        targetPort: "database",
    });
    patchNodePortService({
        cluster: cluster,
        helmChart: helmChart,
        id: "ResultsCacheServiceNodePortPatch",
        namespace: namespace,
        scope: scope,
        serviceName: `${CLP_HELM_RELEASE_NAME}-results-cache`,
        servicePort: RESULTS_CACHE_SERVICE_PORT,
        targetPort: "results-cache",
    });
};

/**
 * Adds Gateway API routing and Kubernetes service patches for a CLP deployment.
 *
 * @param config Gateway resource configuration.
 * @param config.cluster Imported EKS cluster.
 * @param config.helmChart CLP Helm release construct.
 * @param config.hostname Public hostname for this CLP deployment.
 * @param config.namespace CLP deployment namespace.
 * @param config.namespaceManifest Manifest that creates the CLP namespace.
 * @param config.scope Construct scope.
 */
export const addGatewayResources = function (
    {
        cluster,
        helmChart,
        hostname,
        namespace,
        namespaceManifest,
        scope,
    }: {
        cluster: eks.ICluster;
        helmChart: eks.HelmChart;
        hostname: string;
        namespace: string;
        namespaceManifest: eks.KubernetesManifest;
        scope: Construct;
    },
): void {
    addNodePortServicePatches(
        scope,
        cluster,
        namespace,
        helmChart,
    );

    const httpRouteManifest = addHttpRoute(
        cluster,
        namespace,
        hostname,
    );

    httpRouteManifest.node.addDependency(namespaceManifest);
    httpRouteManifest.node.addDependency(helmChart);
};
