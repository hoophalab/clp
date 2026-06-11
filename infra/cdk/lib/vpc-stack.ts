import * as ec2 from "aws-cdk-lib/aws-ec2";
import {NagSuppressions} from "cdk-nag";
import {Construct} from "constructs";

import {
    ClusterScopedStack,
    ClusterScopedStackProps,
} from "./cluster-scoped-stack";


// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface VpcStackProps extends ClusterScopedStackProps {}

export class VpcStack extends ClusterScopedStack {
    public readonly vpc: ec2.Vpc;

    constructor (scope: Construct, id: string, props: VpcStackProps) {
        super(scope, id, props);

        this.vpc = new ec2.Vpc(this, "Vpc", {
            maxAzs: 3,
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

        NagSuppressions.addResourceSuppressions(
            this.vpc,
            [
                {
                    id: "AwsSolutions-VPC7",

                    // Flow logs are disabled because:
                    // 1. We do not anticipate debugging network traffic
                    // 2. We want to avoid the associated S3/CloudWatch
                    // storage costs
                    reason: "Flow logs are disabled to avoid destination " +
                        "costs and are not useful for debugging this VPC.",
                },
            ],
        );
    }
}
