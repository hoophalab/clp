import {Template} from "aws-cdk-lib/assertions";
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
    });
});
