/* eslint-disable max-lines */
import {KubectlV35Layer} from "@aws-cdk/lambda-layer-kubectl-v35";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as eks from "aws-cdk-lib/aws-eks";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cdk from "aws-cdk-lib/core";
import {NagSuppressions} from "cdk-nag";
import {Construct} from "constructs";

import {clusterExportName} from "../cluster-exports";
import {
    ClusterScopedStack,
    ClusterScopedStackProps,
} from "../cluster-scoped-stack";
import {addDeploymentDatabase} from "./database";
import {addGatewayResources} from "./gateway";


const HELM_DEPLOYMENT_TIMEOUT_MINUTES = 10;
const CLP_HELM_RELEASE_NAME = "clp";
const CLP_ARCHIVE_KEY_PREFIX = "archives/";
const CLP_STREAM_KEY_PREFIX = "streams/";
const S3_ALL_BUCKETS_ARN = "arn:aws:s3:::*";
const S3_ALL_OBJECTS_ARN = "arn:aws:s3:::*/*";

export interface DeploymentStackProps extends ClusterScopedStackProps {
    chart: string;
    chartVersion: string;
    clusterSecret: string;
    deploymentId: string;
    imageTag: string;
}

export class DeploymentStack extends ClusterScopedStack {
    /* eslint-disable max-lines-per-function */
    constructor (scope: Construct, id: string, props: DeploymentStackProps) {
        super(scope, id, props);

        const {availabilityZones} = cdk.Stack.of(this);
        const privateSubnetIds = cdk.Fn.split(
            ",",
            cdk.Fn.importValue(
                clusterExportName(props.clusterName, "PrivateSubnetIds"),
            ),
            availabilityZones.length,
        );
        const vpc = this.importVpc(props, availabilityZones, privateSubnetIds);
        const cluster = this.importCluster(props, privateSubnetIds, vpc);
        const chartRepository = cdk.Fn.importValue(
            clusterExportName(props.clusterName, "ClpRegistryChartRepositoryUrl"),
        );
        const packageRepository = cdk.Fn.importValue(
            clusterExportName(props.clusterName, "ClpRegistryPackageRepositoryUri"),
        );
        const domainName = cdk.Fn.importValue(
            clusterExportName(props.clusterName, "DomainName"),
        );
        const hostname =
            `${props.deploymentId}.${props.clusterName}.${domainName}`;
        const namespace = `clp-${props.deploymentId}`;
        const storageBucket = this.createStorageBucket();
        const serviceAccountRole = this.createServiceAccountRole(props);

        const namespaceManifest = cluster.addManifest("Namespace", {
            apiVersion: "v1",
            kind: "Namespace",
            metadata: {
                name: namespace,
            },
        });
        const deploymentDatabase = addDeploymentDatabase({
            cluster: cluster,
            clusterSecret: props.clusterSecret,
            deploymentId: props.deploymentId,
            scope: this,
        });

        deploymentDatabase.chart.node.addDependency(namespaceManifest);

        const helmChart = new eks.HelmChart(this, "PackageHelmRelease", {
            atomic: true,
            chart: props.chart,
            cluster: cluster,
            createNamespace: false,
            namespace: namespace,
            release: CLP_HELM_RELEASE_NAME,
            repository: chartRepository,
            timeout: cdk.Duration.minutes(HELM_DEPLOYMENT_TIMEOUT_MINUTES),

            // These values are consumed by the CLP Helm chart:
            // https://github.com/y-scope/clp/blob/main/tools/deployment/package-helm/values.yaml
            // eslint-disable-next-line no-warning-comments
            // TODO: Type validate these chart values.
            values: {
                allowHostAccessForSbinScripts: false,
                clpConfig: {
                    archive_output: {
                        storage: {
                            s3_config: {
                                aws_authentication: {
                                    type: "default",
                                },
                                bucket: storageBucket.bucketName,
                                key_prefix: CLP_ARCHIVE_KEY_PREFIX,
                                region_code: cdk.Stack.of(this).region,
                            },
                            type: "s3",
                        },
                    },
                    bundled: [
                        "queue",
                        "redis",
                        "results_cache",
                        "otel_collector",
                    ],
                    database: {
                        host: deploymentDatabase.host,
                        names: {
                            clp: deploymentDatabase.name,
                        },
                        port: deploymentDatabase.port,
                        type: "mariadb",
                    },
                    logs_input: {
                        aws_authentication: {
                            type: "default",
                        },
                        type: "s3",
                    },
                    results_cache: {
                        retention_period: null,
                    },
                    stream_output: {
                        storage: {
                            s3_config: {
                                aws_authentication: {
                                    type: "default",
                                },
                                bucket: storageBucket.bucketName,
                                key_prefix: CLP_STREAM_KEY_PREFIX,
                                region_code: cdk.Stack.of(this).region,
                            },
                            type: "s3",
                        },
                    },
                },
                credentials: {
                    database: {
                        password: deploymentDatabase.password,
                        root_password: deploymentDatabase.password,
                        root_username: deploymentDatabase.username,
                        username: deploymentDatabase.username,
                    },
                },
                image: {
                    clpPackage: {
                        repository: packageRepository,
                        tag: props.imageTag,
                    },
                },
                serviceAccount: {
                    annotations: {
                        "eks.amazonaws.com/role-arn": serviceAccountRole.roleArn,
                    },
                },
            },
            version: props.chartVersion,
            wait: true,
        });

        helmChart.node.addDependency(namespaceManifest);
        helmChart.node.addDependency(deploymentDatabase.chart);
        addGatewayResources({
            cluster: cluster,
            helmChart: helmChart,
            hostname: hostname,
            namespace: namespace,
            namespaceManifest: namespaceManifest,
        });
        this.suppressHelmKubectlProviderNags(cluster);
    }
    /* eslint-enable max-lines-per-function */

    private importVpc (
        props: DeploymentStackProps,
        availabilityZones: string[],
        privateSubnetIds: string[],
    ): ec2.IVpc {
        return ec2.Vpc.fromVpcAttributes(this, "ImportedVpc", {
            availabilityZones: availabilityZones,
            privateSubnetIds: privateSubnetIds,
            vpcId: cdk.Fn.importValue(
                clusterExportName(props.clusterName, "VpcId"),
            ),
        });
    }

    private importCluster (
        props: DeploymentStackProps,
        privateSubnetIds: string[],
        vpc: ec2.IVpc,
    ): eks.ICluster {
        const kubectlLambdaRole = iam.Role.fromRoleArn(
            this,
            "KubectlLambdaRole",
            cdk.Fn.importValue(
                clusterExportName(props.clusterName, "KubectlLambdaRoleArn"),
            ),
            {
                mutable: false,
            },
        );

        return eks.Cluster.fromClusterAttributes(this, "ImportedCluster", {
            clusterEndpoint: cdk.Fn.importValue(
                clusterExportName(props.clusterName, "ClusterEndpoint"),
            ),
            clusterName: cdk.Fn.importValue(
                clusterExportName(props.clusterName, "ClusterName"),
            ),
            clusterSecurityGroupId: cdk.Fn.importValue(
                clusterExportName(props.clusterName, "ClusterSecurityGroupId"),
            ),
            kubectlLambdaRole: kubectlLambdaRole,
            kubectlLayer: new KubectlV35Layer(this, "KubectlLayer"),
            kubectlPrivateSubnetIds: privateSubnetIds,
            kubectlRoleArn: cdk.Fn.importValue(
                clusterExportName(props.clusterName, "KubectlExecutionRoleArn"),
            ),
            kubectlSecurityGroupId: cdk.Fn.importValue(
                clusterExportName(props.clusterName, "KubectlSecurityGroupId"),
            ),
            vpc: vpc,
        });
    }

    private createStorageBucket (): s3.IBucket {
        const bucket = new s3.Bucket(this, "StorageBucket", {
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            encryption: s3.BucketEncryption.S3_MANAGED,
            enforceSSL: true,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
        });

        // AwsSolutions-S1 flags S3 buckets that do not have server access
        // logging enabled.
        //
        // Suppress it here because Kubernetes workload logs are captured
        // separately and CLP object access is controlled by IRSA.
        NagSuppressions.addResourceSuppressions(
            bucket,
            [
                {
                    id: "AwsSolutions-S1",
                    reason: "The CLP storage bucket stores application data for " +
                        "compression/search and stream output. Object-level access is " +
                        "controlled by IRSA and Kubernetes workload logs are captured separately.",
                },
            ],
        );

        return bucket;
    }

    private createServiceAccountRole (props: DeploymentStackProps): iam.IRole {
        const oidcProvider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
            this,
            "ImportedOpenIdConnectProvider",
            cdk.Fn.importValue(
                clusterExportName(props.clusterName, "OpenIdConnectProviderArn"),
            ),
        );
        const oidcIssuer = cdk.Fn.importValue(
            clusterExportName(props.clusterName, "OpenIdConnectProviderIssuer"),
        );
        const serviceAccountConditions = new cdk.CfnJson(this, "ServiceAccountRoleConditions", {
            value: {
                [`${oidcIssuer}:aud`]: "sts.amazonaws.com",
                [`${oidcIssuer}:sub`]: `system:serviceaccount:clp-${props.deploymentId}:` +
                    `${CLP_HELM_RELEASE_NAME}-service-account`,
            },
        });
        const role = new iam.Role(this, "ServiceAccountRole", {
            assumedBy: new iam.OpenIdConnectPrincipal(
                oidcProvider,
                {
                    StringEquals: serviceAccountConditions,
                },
            ),
            description: "IAM role for the CLP Kubernetes service account.",
        });

        // eslint-disable-next-line no-warning-comments
        // TODO: Split this into two S3 policies: read-only access for input
        // buckets, and delete/get/list/put access for storage and stream buckets.
        role.addToPolicy(new iam.PolicyStatement({
            actions: [
                "s3:DeleteObject",
                "s3:GetObject",
                "s3:ListBucket",
                "s3:PutObject",
            ],
            resources: [
                S3_ALL_BUCKETS_ARN,
                S3_ALL_OBJECTS_ARN,
            ],
        }));

        // AwsSolutions-IAM5 flags IAM policy statements with wildcard actions
        // or resources unless a suppression explains why those wildcard
        // permissions are required.
        //
        // Suppress it here because CLP reads input from S3 buckets that can be
        // managed by other AWS accounts and are not known at synthesis time.
        NagSuppressions.addResourceSuppressionsByPath(
            this,
            `/${this.node.path}/ServiceAccountRole/DefaultPolicy/Resource`,
            [
                {
                    id: "AwsSolutions-IAM5",
                    reason: "The CLP service account needs access to S3 buckets " +
                        "that may be managed by other AWS accounts.",
                },
            ],
        );

        return role;
    }

    private suppressHelmKubectlProviderNags (cluster: eks.ICluster): void {
        const kubectlProviderPath = `/${this.node.path}/` +
            `${cdk.Names.nodeUniqueId(cluster.node)}-KubectlProvider`;

        // AwsSolutions-IAM4 flags IAM users, roles, or groups that use
        // AWS-managed policies.
        //
        // Suppress it here because the EKS HelmChart construct creates a
        // kubectl provider with CDK-generated Lambda service roles that use
        // AWS-managed Lambda and ECR policies.
        NagSuppressions.addResourceSuppressionsByPath(
            this,
            [
                `${kubectlProviderPath}/Provider/framework-onEvent` +
                    "/ServiceRole/Resource",
            ],
            [
                {
                    id: "AwsSolutions-IAM4",
                    reason: "The CDK-generated EKS kubectl provider uses AWS-managed " +
                        "Lambda and ECR policies.",
                },
            ],
        );

        // AwsSolutions-IAM5 flags IAM policy statements with wildcard actions
        // or resources unless a suppression explains why those wildcard
        // permissions are required.
        //
        // Suppress it here because the EKS HelmChart construct creates a
        // kubectl provider framework role whose generated policy needs to
        // invoke the generated handler Lambda, including qualified versions.
        NagSuppressions.addResourceSuppressionsByPath(
            this,
            [
                `${kubectlProviderPath}/Provider/framework-onEvent` +
                    "/ServiceRole/DefaultPolicy/Resource",
            ],
            [
                {
                    id: "AwsSolutions-IAM5",
                    reason: "The CDK-generated EKS kubectl provider uses wildcard " +
                        "permissions to invoke its framework handler.",
                },
            ],
        );

        // AwsSolutions-L1 flags non-container Lambda functions that are not
        // configured to use the latest runtime version.
        //
        // Suppress it here because the Lambda runtime is selected by the
        // CDK-generated EKS kubectl provider and cannot be overridden.
        NagSuppressions.addResourceSuppressionsByPath(
            this,
            [
                `${kubectlProviderPath}/Handler/Resource`,
                `${kubectlProviderPath}/Provider/framework-onEvent/Resource`,
            ],
            [
                {
                    id: "AwsSolutions-L1",
                    reason: "The Lambda runtime is selected by the CDK-generated " +
                        "EKS kubectl provider.",
                },
            ],
        );
    }
}
