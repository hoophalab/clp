import * as path from "node:path";

import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as eks from "aws-cdk-lib/aws-eks";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3assets from "aws-cdk-lib/aws-s3-assets";
import * as cdk from "aws-cdk-lib/core";
import {NagSuppressions} from "cdk-nag";
import {Construct} from "constructs";

import {KarpenterControllerPolicyV1 as karpenterControllerPolicyV1} from "./iam";


const KARPENTER_CHART_VERSION = "1.15.1";

/**
 * Installs Karpenter and a separately managed node provisioning chart.
 *
 * @param config Karpenter configuration.
 * @param config.architecture Architecture shared with the managed node group.
 * @param config.cluster EKS cluster.
 * @param config.clusterName EKS cluster name.
 * @param config.nodeGroup Baseline nodes that host the controller.
 * @param config.replicas Controller replica count.
 * @param config.scope Construct scope.
 * @return Local node provisioning chart.
 */
// eslint-disable-next-line max-lines-per-function
export const addKarpenter = function (
    {architecture, cluster, clusterName, nodeGroup, replicas, scope}: {
        architecture: string;
        cluster: eks.Cluster;
        clusterName: string;
        nodeGroup: eks.Nodegroup;
        replicas: number;
        scope: Construct;
    },
): eks.HelmChart {
    const serviceAccount = cluster.addServiceAccount("KarpenterServiceAccount", {
        name: "karpenter",
        namespace: "kube-system",
    });
    const instanceProfile = new iam.CfnInstanceProfile(scope, "KarpenterInstanceProfile", {
        roles: [nodeGroup.role.roleName],
    });
    const stack = cdk.Stack.of(scope);
    const policy = new iam.Policy(scope, "KarpenterControllerPolicy", {
        document: iam.PolicyDocument.fromJson(
            karpenterControllerPolicyV1(cluster, stack.partition, stack.region),
        ),
    });

    policy.addStatements(new iam.PolicyStatement({
        actions: ["iam:PassRole"],
        conditions: {StringEquals: {"iam:PassedToService": "ec2.amazonaws.com"}},
        resources: [nodeGroup.role.roleArn],
    }));
    policy.attachToRole(serviceAccount.role);
    NagSuppressions.addResourceSuppressions(policy, [{
        id: "AwsSolutions-IAM5",
        reason: "Upstream Karpenter policy scopes dynamic EC2 and instance profile operations " +
            "by cluster tags; discovery APIs require wildcard access.",
    }]);

    const crds = new eks.HelmChart(scope, "KarpenterCrdsHelmRelease", {
        atomic: true,
        chart: "oci://public.ecr.aws/karpenter/karpenter-crd",
        cluster: cluster,
        createNamespace: false,
        namespace: "kube-system",
        release: "karpenter-crd",
        version: KARPENTER_CHART_VERSION,
        wait: true,
    });
    const controller = new eks.HelmChart(scope, "KarpenterHelmRelease", {
        atomic: true,
        chart: "oci://public.ecr.aws/karpenter/karpenter",
        cluster: cluster,
        createNamespace: false,
        namespace: "kube-system",
        release: "karpenter",
        skipCrds: true,
        values: {
            controller: {
                resources: {
                    limits: {memory: "1Gi"},
                    requests: {cpu: "100m", memory: "512Mi"},
                },
            },
            nodeSelector: {"eks.amazonaws.com/nodegroup": nodeGroup.nodegroupName},
            replicas: replicas,
            serviceAccount: {create: false, name: serviceAccount.serviceAccountName},
            settings: {
                clusterEndpoint: cluster.clusterEndpoint,
                clusterName: clusterName,
            },
        },
        version: KARPENTER_CHART_VERSION,
        wait: true,
    });

    controller.node.addDependency(crds, nodeGroup, serviceAccount, policy);

    const chartAsset = new s3assets.Asset(scope, "KarpenterNodesChartAsset", {
        path: path.join(__dirname, "../../../../karpenter/chart"),
    });
    const chart = new eks.HelmChart(scope, "KarpenterNodesHelmRelease", {
        atomic: true,
        chartAsset: chartAsset,
        cluster: cluster,
        createNamespace: false,
        namespace: "kube-system",
        release: "karpenter-nodes",
        values: {
            architecture: architecture,
            instanceProfile: instanceProfile.ref,
            securityGroupId: cluster.clusterSecurityGroupId,
            subnetIds: cluster.vpc.selectSubnets({
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            }).subnetIds,
        },
        wait: true,
    });

    chart.node.addDependency(controller, instanceProfile, cluster.awsAuth);

    return chart;
};
