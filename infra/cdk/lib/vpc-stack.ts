import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as cdk from "aws-cdk-lib/core";
import {NagSuppressions} from "cdk-nag";
import {Construct} from "constructs";

import {clusterExportName} from "./cluster-exports";
import {
    ClusterScopedStack,
    ClusterScopedStackProps,
} from "./cluster-scoped-stack";
import {VPC_MAX_AZS} from "./vpc-constants";


// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface VpcStackProps extends ClusterScopedStackProps {}

export class VpcStack extends ClusterScopedStack {
    public readonly vpc: ec2.Vpc;

    constructor (scope: Construct, id: string, props: VpcStackProps) {
        super(scope, id, props);

        this.vpc = new ec2.Vpc(this, "Vpc", {
            maxAzs: VPC_MAX_AZS,
            ipAddresses: ec2.IpAddresses.cidr("10.0.0.0/16"),
            natGateways: 1,
            subnetConfiguration: [
                {
                    cidrMask: 24,
                    name: "Public",
                    subnetType: ec2.SubnetType.PUBLIC,
                },
                {
                    cidrMask: 24,
                    name: "Private",
                    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
                },
            ],
        });

        this.vpc.addGatewayEndpoint("S3GatewayEndpoint", {
            service: ec2.GatewayVpcEndpointAwsService.S3,
            subnets: [
                {
                    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
                },
            ],
        });

        /* eslint-disable no-new */
        new cdk.CfnOutput(this, "PrivateSubnetIds", {
            exportName: clusterExportName(props.clusterName, "PrivateSubnetIds"),
            value: cdk.Fn.join(
                ",",
                this.vpc.privateSubnets.map((subnet) => subnet.subnetId),
            ),
        });

        new cdk.CfnOutput(this, "VpcId", {
            exportName: clusterExportName(props.clusterName, "VpcId"),
            value: this.vpc.vpcId,
        });
        /* eslint-enable no-new */

        // AwsSolutions-VPC7 flags VPCs that do not have flow logs enabled.
        //
        // Suppress it here because this VPC does not need network traffic
        // debugging and flow log destinations add storage costs.
        NagSuppressions.addResourceSuppressions(
            this.vpc,
            [
                {
                    id: "AwsSolutions-VPC7",
                    reason: "Flow logs are disabled to avoid destination " +
                        "costs and are not useful for debugging this VPC.",
                },
            ],
        );
    }
}
