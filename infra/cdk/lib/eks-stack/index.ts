/* eslint-disable max-lines */
import {KubectlV35Layer} from "@aws-cdk/lambda-layer-kubectl-v35";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as eks from "aws-cdk-lib/aws-eks";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as cdk from "aws-cdk-lib/core";
import {NagSuppressions} from "cdk-nag";
import {Construct} from "constructs";

import {clusterExportName} from "../cluster-exports";
import {
    ClusterScopedStack,
    ClusterScopedStackProps,
} from "../cluster-scoped-stack";
import {GATEWAY_SYSTEM_NAMESPACE} from "../gateway-constants";
import {addCertManager} from "./cert-manager";
import {addExternalDns} from "./external-dns";
import {addExternalSecrets} from "./external-secrets";
import {
    addGateway,
    CLOUDFLARE_API_TOKEN_SECRET_KEY,
    CLOUDFLARE_API_TOKEN_SECRET_NAME,
    ENVOY_GATEWAY_SYSTEM_NAMESPACE,
} from "./gateway";


const NODE_GROUP_AMI_TYPES: ReadonlySet<string> = new Set(
    Object.values(eks.NodegroupAmiType),
);

/**
 * Parses an EKS managed node group AMI type.
 *
 * @param value Raw context value.
 * @return Corresponding CDK enum member.
 * @throws {Error} If the value isn't a supported AMI type.
 */
const parseNodeGroupAmiType = function (
    value: string,
): eks.NodegroupAmiType {
    if (false === NODE_GROUP_AMI_TYPES.has(value)) {
        throw new Error(`Invalid nodeGroupAmiType: ${value}`);
    }

    return value as eks.NodegroupAmiType;
};

export interface EksStackProps extends ClusterScopedStackProps {
    auth0ClientId: string;
    auth0ClientSecretParameterName: string;
    auth0Domain: string;
    authServerImageRepository: string;
    authServerImageTag: string;
    certManagerChartVersion: string;
    cloudflareApiTokenParameterName: string;
    cloudflareZoneNames: string[];
    clusterAdminRoleArn: string;
    rdsHost: string;
    rdsName: string;
    rdsPort: number;
    rdsSecretArn: string;
    rdsSecurityGroupId: string;
    rdsUsername: string;
    domainName: string;
    envoyGatewayChartVersion: string;
    externalDnsChartVersion: string;
    externalSecretsChartVersion: string;
    nodeGroupAmiType: string;
    nodeGroupDesiredSize: number;
    nodeGroupInstanceType: string;
    vpc: ec2.IVpc;
}

export class EksStack extends ClusterScopedStack {
    public readonly cluster: eks.Cluster;

    /* eslint-disable max-lines-per-function, max-statements */
    constructor (scope: Construct, id: string, props: EksStackProps) {
        super(scope, id, props);

        const adminRole = iam.Role.fromRoleArn(this, "ClusterAdminRole", props.clusterAdminRoleArn);
        const {kubectlRole} = this.createKubectlRoles(props);

        // eslint-disable-next-line no-new
        new cdk.CfnOutput(this, "KubectlRoleArn", {
            exportName: clusterExportName(props.clusterName, "KubectlRoleArn"),
            value: adminRole.roleArn,
        });

        // eslint-disable-next-line no-new
        new cdk.CfnOutput(this, "DomainName", {
            exportName: clusterExportName(props.clusterName, "DomainName"),
            value: props.domainName,
        });

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

            // eslint-disable-next-line no-warning-comments
            // TODO: Change this back after public API access is no longer
            // needed for debugging.
            endpointAccess: eks.EndpointAccess.PUBLIC_AND_PRIVATE,
            kubectlLayer: kubectlLayer,
            mastersRole: adminRole,
            version: eks.KubernetesVersion.V1_35,
            vpc: props.vpc,
        });

        /* eslint-disable no-new */
        new cdk.CfnOutput(this, "ClusterEndpoint", {
            exportName: clusterExportName(props.clusterName, "ClusterEndpoint"),
            value: this.cluster.clusterEndpoint,
        });

        new cdk.CfnOutput(this, "ClusterName", {
            exportName: clusterExportName(props.clusterName, "ClusterName"),
            value: this.cluster.clusterName,
        });

        new cdk.CfnOutput(this, "ClusterSecurityGroupId", {
            exportName: clusterExportName(
                props.clusterName,
                "ClusterSecurityGroupId",
            ),
            value: this.cluster.clusterSecurityGroupId,
        });

        new cdk.CfnOutput(this, "KubectlSecurityGroupId", {
            exportName: clusterExportName(
                props.clusterName,
                "KubectlSecurityGroupId",
            ),
            value: this.cluster.kubectlSecurityGroup?.securityGroupId ??
                this.cluster.clusterSecurityGroupId,
        });

        new cdk.CfnOutput(this, "OpenIdConnectProviderArn", {
            exportName: clusterExportName(
                props.clusterName,
                "OpenIdConnectProviderArn",
            ),
            value: this.cluster.openIdConnectProvider.openIdConnectProviderArn,
        });

        new cdk.CfnOutput(this, "OpenIdConnectProviderIssuer", {
            exportName: clusterExportName(
                props.clusterName,
                "OpenIdConnectProviderIssuer",
            ),
            value: this.cluster.openIdConnectProvider.openIdConnectProviderIssuer,
        });

        /* eslint-enable no-new */

        // AwsSolutions-EKS1 flags EKS clusters with public Kubernetes API
        // endpoint access enabled.
        //
        // Suppress it here temporarily because public endpoint access is
        // needed for debugging. See the TODO on endpointAccess above.
        NagSuppressions.addResourceSuppressionsByPath(
            this,
            `/${this.node.path}/Cluster/Resource/Resource`,
            [
                {
                    id: "AwsSolutions-EKS1",
                    reason: "Public EKS API endpoint access is temporarily " +
                        "enabled for debugging.",
                },
            ],
        );

        // AwsSolutions-IAM4 flags IAM users, roles, or groups that use
        // AWS-managed policies.
        //
        // Suppress it here because the EKS L2 construct internally creates and
        // manages this AWS-managed service role for EKS resources.
        NagSuppressions.addResourceSuppressionsByPath(
            this,
            `/${this.node.path}/Cluster/Role/Resource`,
            [
                {
                    id: "AwsSolutions-IAM4",
                    reason: "The EKS cluster service role uses AWS-managed " +
                        "policies generated by the EKS L2 construct.",
                },
            ],
        );

        this.cluster.node.addDependency(controlPlaneLogGroup);
        this.cluster.awsAuth.addMastersRole(kubectlRole);

        const ebsCsiDriverAddon = this.addEbsCsiDriverAddon();
        this.addGp3StorageClass(ebsCsiDriverAddon);

        const nodeGroup = this.cluster.addNodegroupCapacity("NodeGroup", {
            amiType: parseNodeGroupAmiType(props.nodeGroupAmiType),
            desiredSize: props.nodeGroupDesiredSize,
            instanceTypes: [new ec2.InstanceType(props.nodeGroupInstanceType)],
            maxSize: 20,
            minSize: 0,
        });

        nodeGroup.role.addManagedPolicy(
            iam.ManagedPolicy.fromAwsManagedPolicyName(
                "AmazonEC2ContainerRegistryPullOnly",
            ),
        );

        // AwsSolutions-IAM4 flags IAM users, roles, or groups that use
        // AWS-managed policies.
        //
        // Suppress it here because the EKS L2 construct internally creates and
        // manages this AWS-managed service role for EKS resources.
        NagSuppressions.addResourceSuppressionsByPath(
            this,
            `/${nodeGroup.node.path}/NodeGroupRole/Resource`,
            [
                {
                    id: "AwsSolutions-IAM4",
                    reason: "The EKS node role uses AWS-managed EKS and ECR policies.",
                },
            ],
        );


        // eslint-disable-next-line no-new
        new ec2.CfnSecurityGroupIngress(this, "DatabaseIngress", {
            description: "Auth server database access",
            fromPort: props.rdsPort,
            groupId: props.rdsSecurityGroupId,
            ipProtocol: "tcp",
            sourceSecurityGroupId: this.cluster.clusterSecurityGroupId,
            toPort: props.rdsPort,
        });

        const externalSecrets = addExternalSecrets({
            chartVersion: props.externalSecretsChartVersion,
            cluster: this.cluster,
            parameterNames: [
                props.cloudflareApiTokenParameterName,
                props.auth0ClientSecretParameterName,
            ],
            scope: this,
            secretArns: [props.rdsSecretArn],
        });

        externalSecrets.chart.node.addDependency(nodeGroup);

        const externalDns = addExternalDns({
            chartVersion: props.externalDnsChartVersion,
            cluster: this.cluster,
            clusterName: props.clusterName,
            domainFilters: props.cloudflareZoneNames,
            labelFilter: `gateway.envoyproxy.io/owning-gateway-namespace=${
                GATEWAY_SYSTEM_NAMESPACE
            }`,
            scope: this,
            secretKey: CLOUDFLARE_API_TOKEN_SECRET_KEY,
            secretName: CLOUDFLARE_API_TOKEN_SECRET_NAME,
            sourceNamespace: ENVOY_GATEWAY_SYSTEM_NAMESPACE,
        });

        externalDns.chart.node.addDependency(nodeGroup);

        const certManager = addCertManager({
            chartVersion: props.certManagerChartVersion,
            cluster: this.cluster,
            scope: this,
        });

        certManager.chart.node.addDependency(nodeGroup);

        const gateway = addGateway({
            auth0ClientId: props.auth0ClientId,
            auth0ClientSecretParameterName: props.auth0ClientSecretParameterName,
            auth0Domain: props.auth0Domain,
            authServerImageRepository: props.authServerImageRepository,
            authServerImageTag: props.authServerImageTag,
            availabilityZoneCount: props.vpc.availabilityZones.length,
            certManager: certManager,
            cloudflareApiTokenParameterName: props.cloudflareApiTokenParameterName,
            cluster: this.cluster,
            clusterName: props.clusterName,
            domainName: props.domainName,
            envoyGatewayChartVersion: props.envoyGatewayChartVersion,
            externalDns: externalDns,
            externalSecrets: externalSecrets,
            rdsHost: props.rdsHost,
            rdsName: props.rdsName,
            rdsPort: props.rdsPort,
            rdsSecretArn: props.rdsSecretArn,
            rdsUsername: props.rdsUsername,
            scope: this,
        });

        gateway.chart.node.addDependency(nodeGroup);

        this.suppressEksProviderNags();
    }
    /* eslint-enable max-lines-per-function, max-statements */

    private addEbsCsiDriverAddon (): eks.CfnAddon {
        const conditions = new cdk.CfnJson(this, "EbsCsiDriverRoleConditions", {
            value: {
                [`${this.cluster.openIdConnectProvider.openIdConnectProviderIssuer}:aud`]:
                    "sts.amazonaws.com",
                [`${this.cluster.openIdConnectProvider.openIdConnectProviderIssuer}:sub`]:
                    "system:serviceaccount:kube-system:ebs-csi-controller-sa",
            },
        });
        const ebsCsiDriverRole = new iam.Role(this, "EbsCsiDriverRole", {
            assumedBy: new iam.OpenIdConnectPrincipal(
                this.cluster.openIdConnectProvider,
                {
                    StringEquals: conditions,
                },
            ),
            description: "IAM role for the AWS EBS CSI driver EKS add-on.",
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName(
                    "service-role/AmazonEBSCSIDriverPolicy",
                ),
            ],
        });

        // AwsSolutions-IAM4 flags IAM users, roles, or groups that use
        // AWS-managed policies.
        //
        // Suppress it here because the AWS EBS CSI driver add-on uses the
        // AWS-managed service policy published for that driver.
        NagSuppressions.addResourceSuppressions(
            ebsCsiDriverRole,
            [
                {
                    id: "AwsSolutions-IAM4",
                    reason: "The AWS EBS CSI driver add-on role uses the AWS-managed " +
                        "EBS CSI driver policy.",
                },
            ],
        );

        return new eks.CfnAddon(this, "EbsCsiDriverAddon", {
            addonName: "aws-ebs-csi-driver",
            clusterName: this.cluster.clusterName,
            resolveConflicts: "OVERWRITE",
            serviceAccountRoleArn: ebsCsiDriverRole.roleArn,
        });
    }

    private addGp3StorageClass (ebsCsiDriverAddon: eks.CfnAddon): void {
        const gp3StorageClass = this.cluster.addManifest("Gp3StorageClass", {
            allowVolumeExpansion: true,
            apiVersion: "storage.k8s.io/v1",
            kind: "StorageClass",
            metadata: {
                annotations: {
                    "storageclass.kubernetes.io/is-default-class": "true",
                },
                name: "gp3",
            },
            parameters: {
                encrypted: "true",
                type: "gp3",
            },
            provisioner: "ebs.csi.aws.com",
            reclaimPolicy: "Delete",
            volumeBindingMode: "WaitForFirstConsumer",
        });

        gp3StorageClass.node.addDependency(ebsCsiDriverAddon);
    }

    private createKubectlRoles (
        props: EksStackProps,
    ): {
        kubectlRole: iam.IRole;
    } {
        const kubectlLambdaRole = new iam.Role(this, "KubectlLambdaRole", {
            assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
            description: "Execution role for CLP Helm kubectl custom resources.",
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName(
                    "service-role/AWSLambdaBasicExecutionRole",
                ),
                iam.ManagedPolicy.fromAwsManagedPolicyName(
                    "service-role/AWSLambdaVPCAccessExecutionRole",
                ),
                iam.ManagedPolicy.fromAwsManagedPolicyName(
                    "AmazonEC2ContainerRegistryPullOnly",
                ),
            ],
        });

        // AwsSolutions-IAM4 flags IAM users, roles, or groups that use
        // AWS-managed policies.
        //
        // Suppress it here because the kubectl Lambda execution role uses
        // AWS-managed Lambda and ECR policies for provider execution.
        NagSuppressions.addResourceSuppressions(
            kubectlLambdaRole,
            [
                {
                    id: "AwsSolutions-IAM4",
                    reason: "The kubectl Lambda execution role uses AWS-managed " +
                        "Lambda and ECR policies.",
                },
            ],
        );
        const kubectlRole = new iam.Role(this, "KubectlRole", {
            assumedBy: kubectlLambdaRole,
            description: "Role assumed by CLP Helm kubectl Lambdas.",
        });

        /* eslint-disable no-new */
        new cdk.CfnOutput(this, "KubectlLambdaRoleArn", {
            exportName: clusterExportName(props.clusterName, "KubectlLambdaRoleArn"),
            value: kubectlLambdaRole.roleArn,
        });

        new cdk.CfnOutput(this, "KubectlExecutionRoleArn", {
            exportName: clusterExportName(props.clusterName, "KubectlExecutionRoleArn"),
            value: kubectlRole.roleArn,
        });
        /* eslint-enable no-new */

        kubectlLambdaRole.addToPolicy(new iam.PolicyStatement({
            actions: ["eks:DescribeCluster"],
            resources: [
                cdk.Stack.of(this).formatArn({
                    resource: "cluster",
                    resourceName: props.clusterName,
                    service: "eks",
                }),
            ],
        }));
        kubectlRole.grantAssumeRole(kubectlLambdaRole);

        return {
            kubectlRole: kubectlRole,
        };
    }

    /* eslint-disable max-lines-per-function */
    private suppressEksProviderNags (): void {
        // AwsSolutions-IAM4 flags IAM users, roles, or groups that use
        // AWS-managed policies.
        //
        // Suppress it here because the EKS L2 construct internally creates and
        // manages these AWS-managed service roles for EKS and CDK provider
        // resources.
        NagSuppressions.addResourceSuppressionsByPath(
            this,
            [
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
                `/${this.node.path}/Cluster/KubectlHandlerRole/Resource`,
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
                `/${this.node.path}/@aws-cdk--aws-eks.ClusterResourceProvider` +
                    "/Provider/framework-onEvent/Resource",
                `/${this.node.path}/@aws-cdk--aws-eks.ClusterResourceProvider` +
                    "/Provider/framework-isComplete/Resource",
                `/${this.node.path}/@aws-cdk--aws-eks.ClusterResourceProvider` +
                    "/Provider/framework-onTimeout/Resource",
                `/${this.node.path}/@aws-cdk--aws-eks.KubectlProvider` +
                    "/Handler/Resource",
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
                `/${this.node.path}/Cluster/KubectlHandlerRole/DefaultPolicy/Resource`,
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
                        "EKS providers for cluster operations and Helm chart asset reads.",
                },
            ],
        );
    }
    /* eslint-enable max-lines-per-function */
}
