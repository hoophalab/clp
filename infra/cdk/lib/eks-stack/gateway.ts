/* eslint-disable max-lines-per-function */
import * as eks from "aws-cdk-lib/aws-eks";
import {Construct} from "constructs";

import {
    DEPLOYMENTS_GATEWAY_NAME,
    GATEWAY_SYSTEM_NAMESPACE,
} from "../gateway-constants";


const ENVOY_GATEWAY_SYSTEM_NAMESPACE = "envoy-gateway-system";
const ENVOY_GATEWAY_CHART = "oci://docker.io/envoyproxy/gateway-helm";
const ENVOY_GATEWAY_CONTROLLER_NAME = "gateway.envoyproxy.io/gatewayclass-controller";
const ENVOY_GATEWAY_RELEASE_NAME = "envoy-gateway";
const ENVOY_GATEWAY_CLASS_NAME = "envoy-gateway";

/**
 * Adds Envoy Gateway resources to the EKS cluster.
 *
 * @param config Envoy Gateway configuration.
 * @param config.cluster EKS cluster.
 * @param config.clusterName Cluster-scoped environment name.
 * @param config.domainName Public base domain.
 * @param config.envoyGatewayChartVersion Envoy Gateway Helm chart version.
 * @param config.scope Construct scope.
 */
export const addGateway = function (
    {
        cluster,
        clusterName,
        domainName,
        envoyGatewayChartVersion,
        scope,
    }: {
        cluster: eks.Cluster;
        clusterName: string;
        domainName: string;
        envoyGatewayChartVersion: string;
        scope: Construct;
    },
): void {
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

    const gatewayNamespace = cluster.addManifest("GatewayNamespace", {
        apiVersion: "v1",
        kind: "Namespace",
        metadata: {
            name: GATEWAY_SYSTEM_NAMESPACE,
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
            listeners: [
                {
                    allowedRoutes: {
                        namespaces: {
                            from: "All",
                        },
                    },
                    hostname: `*.${clusterName}.${domainName}`,
                    name: "http",
                    port: 80,
                    protocol: "HTTP",
                },
            ],
        },
    });

    gateway.node.addDependency(gatewayClassManifest);
    gateway.node.addDependency(gatewayNamespace);
};
/* eslint-enable max-lines-per-function */
