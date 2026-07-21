import * as eks from "aws-cdk-lib/aws-eks";
import {Construct} from "constructs";


export const CERT_MANAGER_NAMESPACE = "cert-manager";
const CERT_MANAGER_RELEASE_NAME = "cert-manager";
const CERT_MANAGER_REPOSITORY = "https://charts.jetstack.io";

export interface CertManagerResources {
    chart: eks.HelmChart;
    namespace: eks.KubernetesManifest;
    namespaceName: string;
}

/**
 * Installs cert-manager with Gateway API support.
 *
 * @param config cert-manager configuration.
 * @param config.chartVersion cert-manager Helm chart version.
 * @param config.cluster EKS cluster.
 * @param config.scope Construct scope.
 * @return Installed cert-manager resources.
 */
export const addCertManager = function (
    {
        chartVersion,
        cluster,
        scope,
    }: {
        chartVersion: string;
        cluster: eks.Cluster;
        scope: Construct;
    },
): CertManagerResources {
    const namespace = cluster.addManifest("CertManagerNamespace", {
        apiVersion: "v1",
        kind: "Namespace",
        metadata: {name: CERT_MANAGER_NAMESPACE},
    });
    const chart = new eks.HelmChart(scope, "CertManagerHelmRelease", {
        atomic: true,
        chart: CERT_MANAGER_RELEASE_NAME,
        cluster: cluster,
        createNamespace: false,
        namespace: CERT_MANAGER_NAMESPACE,
        release: CERT_MANAGER_RELEASE_NAME,
        repository: CERT_MANAGER_REPOSITORY,
        values: {
            config: {
                apiVersion: "controller.config.cert-manager.io/v1alpha1",
                gatewayAPI: {enabled: true},
                kind: "ControllerConfiguration",
            },
            crds: {enabled: true, keep: true},
        },
        version: chartVersion,
        wait: true,
    });

    chart.node.addDependency(namespace);

    return {
        chart: chart,
        namespace: namespace,
        namespaceName: CERT_MANAGER_NAMESPACE,
    };
};
