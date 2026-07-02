import {Template} from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib/core";
import {
    describe,
    test,
} from "vitest";

import {ClpRegistryStack} from "../lib/clp-registry-stack";


describe("ClpRegistryStack", () => {
    test("synthesizes CLP repositories", () => {
        const app = new cdk.App();
        const stack = new ClpRegistryStack(app, "TestClpRegistry", {
            clusterName: "test",
            env: {account: "123456789012", region: "us-east-1"},
        });

        const template = Template.fromStack(stack);

        template.resourceCountIs("AWS::ECR::Repository", 2);
    });
});
