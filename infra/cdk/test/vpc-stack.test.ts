import {
    Match,
    Template,
} from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib/core";
import {
    describe,
    test,
} from "vitest";

import {VpcStack} from "../lib/vpc-stack";


describe("VpcStack", () => {
    test("synthesizes a VPC", () => {
        const app = new cdk.App();
        const stack = new VpcStack(app, "TestVpc", {
            env: {
                account: "123456789012",
                region: "us-east-1",
            },
            clusterName: "test",
        });

        const template = Template.fromStack(stack);

        template.resourceCountIs("AWS::EC2::VPC", 1);
        template.resourceCountIs("AWS::EC2::VPCEndpoint", 1);
        template.hasResourceProperties("AWS::EC2::VPCEndpoint", {
            RouteTableIds: [
                {Ref: Match.stringLikeRegexp("^VpcPrivateSubnet1RouteTable")},
                {Ref: Match.stringLikeRegexp("^VpcPrivateSubnet2RouteTable")},
            ],
            ServiceName: {
                "Fn::Join": [
                    "",
                    [
                        "com.amazonaws.",
                        {Ref: "AWS::Region"},
                        ".s3",
                    ],
                ],
            },
            VpcEndpointType: "Gateway",
        });
    });
});
