import {KubectlV35Layer} from "@aws-cdk/lambda-layer-kubectl-v35";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as eks from "aws-cdk-lib/aws-eks";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as cdk from "aws-cdk-lib/core";
import {NagSuppressions} from "cdk-nag";
import {Construct} from "constructs";

import {
    ClusterScopedStack,
    ClusterScopedStackProps,
} from "./cluster-scoped-stack";


export interface EksStackProps extends ClusterScopedStackProps {
    clusterAdminRoleArn: string;
    vpc: ec2.IVpc;
}

export class EksStack extends ClusterScopedStack {
    public readonly cluster: eks.Cluster;

    constructor (scope: Construct, id: string, props: EksStackProps) {
        super(scope, id, props);

        const clusterAdminRole = iam.Role.fromRoleArn(
            this,
            "ClusterAdminRole",
            props.clusterAdminRoleArn,
        );

        const controlPlaneLogGroup = new logs.LogGroup(this, "ControlPlaneLogGroup", {
            logGroupName: `/aws/eks/${props.clusterName}/cluster`,
            retention: logs.RetentionDays.TWO_WEEKS,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
        });

        const kubectlLayer = new KubectlV35Layer(this, "KubectlLayer");

        this.cluster = new eks.Cluster(this, "Cluster", {
            clusterLogging: [
                eks.ClusterLoggingTypes.API,
                eks.ClusterLoggingTypes.AUDIT,
                eks.ClusterLoggingTypes.AUTHENTICATOR,
                eks.ClusterLoggingTypes.CONTROLLER_MANAGER,
                eks.ClusterLoggingTypes.SCHEDULER,
            ],
            clusterName: props.clusterName,
            defaultCapacity: 0,
            endpointAccess: eks.EndpointAccess.PUBLIC_AND_PRIVATE,
            kubectlLayer: kubectlLayer,
            mastersRole: clusterAdminRole,
            version: eks.KubernetesVersion.V1_35,
            vpc: props.vpc,
        });

        this.cluster.node.addDependency(controlPlaneLogGroup);

        // eslint-disable-next-line no-warning-comments
        // TODO: Switch to ARM instances once things stabilize.
        this.cluster.addNodegroupCapacity("NodeGroup", {
            amiType: eks.NodegroupAmiType.AL2023_X86_64_STANDARD,
            desiredSize: 2,
            instanceTypes: [ec2.InstanceType.of(
                ec2.InstanceClass.C8I,
                ec2.InstanceSize.XLARGE,
            )],
            maxSize: 20,
            minSize: 1,
        });

        this.addNagSuppressions();
    }

    /* eslint-disable max-lines-per-function */
    private addNagSuppressions (): void {
        // AwsSolutions-IAM4 flags IAM users, roles, or groups that use
        // AWS-managed policies.
        //
        // Suppress it here because the EKS L2 construct internally creates and
        // manages these AWS-managed service roles for EKS and CDK provider
        // resources.
        NagSuppressions.addResourceSuppressionsByPath(
            this,
            [
                `/${this.node.path}/Cluster/KubectlHandlerRole/Resource`,
                `/${this.node.path}/Cluster/Role/Resource`,
                `/${this.node.path}/Cluster/NodegroupNodeGroup/NodeGroupRole` +
                    "/Resource",
                `/${this.node.path}/@aws-cdk--aws-eks.ClusterResourceProvider` +
                    "/OnEventHandler/ServiceRole/Resource",
                `/${this.node.path}/@aws-cdk--aws-eks.ClusterResourceProvider` +
                    "/IsCompleteHandler/ServiceRole/Resource",
                `/${this.node.path}/@aws-cdk--aws-eks.ClusterResourceProvider` +
                    "/Provider/framework-onEvent/ServiceRole/Resource",
                `/${this.node.path}/@aws-cdk--aws-eks.ClusterResourceProvider` +
                    "/Provider/framework-isComplete/ServiceRole/Resource",
                `/${this.node.path}/@aws-cdk--aws-eks.ClusterResourceProvider` +
                    "/Provider/framework-onTimeout/ServiceRole/Resource",
                `/${this.node.path}/@aws-cdk--aws-eks.KubectlProvider` +
                    "/Provider/framework-onEvent/ServiceRole/Resource",
            ],
            [
                {
                    id: "AwsSolutions-IAM4",
                    reason: "The EKS L2 construct creates AWS-managed service " +
                        "roles for EKS and CDK provider resources.",
                },
            ],
        );

        // AwsSolutions-L1 flags non-container Lambda functions that are not
        // configured to use the latest runtime version.
        //
        // Suppress it here because the Lambda runtime is selected by the
        // CDK-generated EKS custom resource provider and cannot be overridden.
        NagSuppressions.addResourceSuppressionsByPath(
            this,
            [
                `/${this.node.path}/@aws-cdk--aws-eks.ClusterResourceProvider` +
                    "/OnEventHandler/Resource",
                `/${this.node.path}/@aws-cdk--aws-eks.ClusterResourceProvider` +
                    "/IsCompleteHandler/Resource",
                `/${this.node.path}/@aws-cdk--aws-eks.KubectlProvider` +
                    "/Handler/Resource",
                `/${this.node.path}/@aws-cdk--aws-eks.ClusterResourceProvider` +
                    "/Provider/framework-onEvent/Resource",
                `/${this.node.path}/@aws-cdk--aws-eks.ClusterResourceProvider` +
                    "/Provider/framework-isComplete/Resource",
                `/${this.node.path}/@aws-cdk--aws-eks.ClusterResourceProvider` +
                    "/Provider/framework-onTimeout/Resource",
                `/${this.node.path}/@aws-cdk--aws-eks.KubectlProvider` +
                    "/Provider/framework-onEvent/Resource",
            ],
            [
                {
                    id: "AwsSolutions-L1",
                    reason: "The Lambda runtime is selected by the CDK-generated " +
                        "EKS custom resource provider.",
                },
            ],
        );

        // AwsSolutions-SF1 flags Step Functions state machines that do not log
        // all events to CloudWatch Logs.
        //
        // AwsSolutions-SF2 flags Step Functions state machines that do not have
        // X-Ray tracing enabled.
        //
        // Suppress them here because the CDK-generated EKS waiter state machine
        // runs only for cluster lifecycle operations.
        NagSuppressions.addResourceSuppressionsByPath(
            this,
            `/${this.node.path}/@aws-cdk--aws-eks.ClusterResourceProvider` +
                "/Provider/waiter-state-machine/Resource",
            [
                {
                    id: "AwsSolutions-SF1",
                    reason: "The CDK-generated EKS waiter state machine runs " +
                        "only for cluster lifecycle operations.",
                },
                {
                    id: "AwsSolutions-SF2",
                    reason: "The CDK-generated EKS waiter state machine runs " +
                        "only for cluster lifecycle operations.",
                },
            ],
        );

        // AwsSolutions-IAM5 flags IAM policy statements with wildcard actions
        // or resources unless a suppression explains why those wildcard
        // permissions are required.
        //
        // Suppress it here because these are CDK-generated policies for the
        // EKS custom resource providers that manage cluster lifecycle
        // operations and cannot be scoped down further.
        NagSuppressions.addResourceSuppressionsByPath(
            this,
            [
                `/${this.node.path}/Cluster/Resource/CreationRole/DefaultPolicy` +
                    "/Resource",
                `/${this.node.path}/@aws-cdk--aws-eks.ClusterResourceProvider` +
                    "/Provider/framework-onEvent/ServiceRole/DefaultPolicy" +
                    "/Resource",
                `/${this.node.path}/@aws-cdk--aws-eks.ClusterResourceProvider` +
                    "/Provider/framework-isComplete/ServiceRole/DefaultPolicy" +
                    "/Resource",
                `/${this.node.path}/@aws-cdk--aws-eks.ClusterResourceProvider` +
                    "/Provider/framework-onTimeout/ServiceRole/DefaultPolicy" +
                    "/Resource",
                `/${this.node.path}/@aws-cdk--aws-eks.ClusterResourceProvider` +
                    "/Provider/waiter-state-machine/Role/DefaultPolicy" +
                    "/Resource",
                `/${this.node.path}/@aws-cdk--aws-eks.KubectlProvider` +
                    "/Provider/framework-onEvent/ServiceRole/DefaultPolicy" +
                    "/Resource",
            ],
            [
                {
                    id: "AwsSolutions-IAM5",
                    reason: "The wildcard permissions are generated by the CDK " +
                        "EKS custom resource providers for cluster lifecycle operations.",
                },
            ],
        );
    }
    /* eslint-enable max-lines-per-function */
}
