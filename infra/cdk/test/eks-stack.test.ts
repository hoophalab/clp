import {Template} from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib/core";
import {
    describe,
    test,
} from "vitest";

import {EksStack} from "../lib/eks-stack";
import {VpcStack} from "../lib/vpc-stack";


describe("EksStack", () => {
    test("synthesizes an EKS cluster", () => {
        const app = new cdk.App();
        const vpcStack = new VpcStack(app, "TestVpc", {
            clusterName: "test",
            env: {account: "123456789012", region: "us-east-1"},
        });
        const stack = new EksStack(app, "TestEks", {
            clusterAdminRoleArn: "arn:aws:iam::123456789012:role/test-cluster-admin",
            clusterName: "test",
            env: {account: "123456789012", region: "us-east-1"},
            vpc: vpcStack.vpc,
        });

        const template = Template.fromStack(stack);
        template.resourceCountIs("Custom::AWSCDK-EKS-Cluster", 1);
    });
});
