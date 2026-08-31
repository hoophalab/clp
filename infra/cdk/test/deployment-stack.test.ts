import {Template} from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib/core";
import {
    describe,
    test,
} from "vitest";

import {DeploymentStack} from "../lib/deployment-stack";


describe("DeploymentStack", () => {
    test("synthesizes a CLP deployment", () => {
        const app = new cdk.App();
        const stack = new DeploymentStack(app, "TestDeployment", {
            chart: "clp",
            chartVersion: "0.0.0",
            clusterName: "test",
            deploymentId: "sample",
            env: {account: "123456789012", region: "us-east-1"},
            imageTag: "test",
        });

        const template = Template.fromStack(stack);

        template.resourceCountIs("AWS::S3::Bucket", 1);
        template.resourceCountIs("AWS::IAM::Role", 2);
        template.resourceCountIs("AWS::IAM::Policy", 1);
        template.resourceCountIs("Custom::AWSCDK-EKS-HelmChart", 2);
        template.resourceCountIs("Custom::AWSCDK-EKS-KubernetesResource", 2);
    });
});
