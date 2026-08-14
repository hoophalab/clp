import {Template} from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib/core";
import {
    describe,
    test,
} from "vitest";

import {EcrStack} from "../lib/ecr-stack";


describe("EcrStack", () => {
    test("synthesizes application repositories", () => {
        const app = new cdk.App();
        const stack = new EcrStack(app, "TestEcr", {
            clusterName: "test",
            env: {account: "123456789012", region: "us-east-1"},
            githubRepository: "y-scope/cloud.yscope.com",
        });

        const template = Template.fromStack(stack);

        template.resourceCountIs("AWS::ECR::Repository", 3);
    });
});
