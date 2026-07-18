import * as eks from "aws-cdk-lib/aws-eks";
import {Construct} from "constructs";


export const EXTERNAL_DNS_NAMESPACE = "external-dns";
const EXTERNAL_DNS_RELEASE_NAME = "external-dns";
const EXTERNAL_DNS_REPOSITORY = "https://kubernetes-sigs.github.io/external-dns/";

export interface ExternalDnsResources {
    chart: eks.HelmChart;
    namespace: eks.KubernetesManifest;
    namespaceName: string;
}

/**
 * Installs Cloudflare ExternalDNS for the Envoy LoadBalancer Service.
 *
 * @param config ExternalDNS configuration.
 * @param config.chartVersion ExternalDNS Helm chart version.
 * @param config.cluster EKS cluster.
 * @param config.clusterName Cluster-scoped environment name.
 * @param config.domainFilters Authoritative DNS zones to manage.
 * @param config.labelFilter Kubernetes Service label selector.
 * @param config.secretKey Cloudflare token key in the Kubernetes Secret.
 * @param config.secretName Kubernetes Secret containing the Cloudflare token.
 * @param config.scope Construct scope.
 * @param config.sourceNamespace Namespace to watch for source resources.
 * @return Installed ExternalDNS resources.
 */
// eslint-disable-next-line max-lines-per-function
export const addExternalDns = function (
    {
        chartVersion,
        cluster,
        clusterName,
        domainFilters,
        labelFilter,
        secretKey,
        secretName,
        scope,
        sourceNamespace,
    }: {
        chartVersion: string;
        cluster: eks.Cluster;
        clusterName: string;
        domainFilters: string[];
        labelFilter: string;
        secretKey: string;
        secretName: string;
        scope: Construct;
        sourceNamespace: string;
    },
): ExternalDnsResources {
    const namespace = cluster.addManifest("ExternalDnsNamespace", {
        apiVersion: "v1",
        kind: "Namespace",
        metadata: {name: EXTERNAL_DNS_NAMESPACE},
    });
    const chart = new eks.HelmChart(scope, "ExternalDnsHelmRelease", {
        atomic: true,
        chart: EXTERNAL_DNS_RELEASE_NAME,
        cluster: cluster,
        createNamespace: false,
        namespace: EXTERNAL_DNS_NAMESPACE,
        release: EXTERNAL_DNS_RELEASE_NAME,
        repository: EXTERNAL_DNS_REPOSITORY,
        values: {
            domainFilters: domainFilters,
            env: [
                {
                    name: "CF_API_TOKEN",
                    valueFrom: {
                        secretKeyRef: {
                            key: secretKey,
                            name: secretName,
                        },
                    },
                },
            ],
            extraArgs: {
                "cloudflare-proxied": false,
                "service-type-filter": "LoadBalancer",
                "txt-wildcard-replacement": "wildcard",
            },
            labelFilter: labelFilter,
            namespaced: true,
            policy: "sync",
            provider: {name: "cloudflare"},
            sourceNamespace: sourceNamespace,
            sources: ["service"],
            txtOwnerId: clusterName,
        },
        version: chartVersion,
        wait: true,
    });

    chart.node.addDependency(namespace);

    return {
        chart: chart,
        namespace: namespace,
        namespaceName: EXTERNAL_DNS_NAMESPACE,
    };
};
