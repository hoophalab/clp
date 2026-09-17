import {
    Match,
    Template,
} from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib/core";
import {
    describe,
    expect,
    test,
} from "vitest";

import {DeploymentStack} from "../lib/deployment-stack";


const CLUSTER_SECRET = "cluster-secret";
const DEPLOYMENT_ID = "sample";
const HELM_CHART_RESOURCE_TYPE = "Custom::AWSCDK-EKS-HelmChart";
const KUBERNETES_RESOURCE_COUNT = 5;

// Known HMAC-SHA256 vectors with an unpadded base64url digest.
const PASSWORD_CASES = [
    {
        label: "the original inputs",
        clusterSecret: CLUSTER_SECRET,
        deploymentId: DEPLOYMENT_ID,
        password: "akK0th7CG5c5jgYBqSthbtxv0IKc7B6SEt_iScza3wI",
    },
    {
        label: "a different cluster secret",
        clusterSecret: "cluster-secret-a",
        deploymentId: DEPLOYMENT_ID,
        password: "kOmdog9ztS-t9fcMuCY02w-INfkQDpfpgBReBop7C1E",
    },
    {
        label: "a different deployment ID",
        clusterSecret: CLUSTER_SECRET,
        deploymentId: "sample-a",
        password: "AWXQbrgE3Q6Ix6-zktVITx0gW35m4BuNLNFcknIxXLk",
    },
];

/**
 * Synthesizes a deployment stack with the given password derivation inputs.
 *
 * @param clusterSecret The secret used as the HMAC key.
 * @param deploymentId The deployment ID used as the HMAC message.
 * @return The synthesized template.
 */
const synthesizeDeploymentStack = (
    clusterSecret: string = CLUSTER_SECRET,
    deploymentId: string = DEPLOYMENT_ID,
): Template => {
    const app = new cdk.App();
    const stack = new DeploymentStack(app, "TestDeployment", {
        chart: "clp",
        chartVersion: "0.0.0",
        clusterName: "test",
        clusterSecret: clusterSecret,
        deploymentId: deploymentId,
        env: {account: "123456789012", region: "us-east-1"},
        imageTag: "test",
    });

    return Template.fromStack(stack);
};

describe("DeploymentStack", () => {
    test("synthesizes a CLP deployment", () => {
        const template = synthesizeDeploymentStack();

        template.resourceCountIs("AWS::S3::Bucket", 1);
        template.resourceCountIs("AWS::IAM::Role", 2);
        template.resourceCountIs("AWS::IAM::Policy", 1);
        template.resourceCountIs(HELM_CHART_RESOURCE_TYPE, 2);
        template.resourceCountIs(
            "Custom::AWSCDK-EKS-KubernetesResource",
            KUBERNETES_RESOURCE_COUNT,
        );
    });

    test("synthesizes identical templates for the same secret and deployment ID", () => {
        const first: unknown = synthesizeDeploymentStack().toJSON();
        const second: unknown = synthesizeDeploymentStack().toJSON();

        expect(first).toEqual(second);
    });

    test.each(PASSWORD_CASES)("uses the expected password in both Helm releases for $label", ({
        clusterSecret,
        deploymentId,
        password,
    }) => {
        const template = synthesizeDeploymentStack(clusterSecret, deploymentId);

        template.hasResourceProperties(HELM_CHART_RESOURCE_TYPE, {
            Release: `clp-${deploymentId}`,
            Values: Match.serializedJson(Match.objectLike({
                database: Match.objectLike({
                    password: password,
                }),
            })),
        });
        template.hasResourceProperties(HELM_CHART_RESOURCE_TYPE, {
            Release: "clp",
            Values: {
                "Fn::Join": [
                    "",
                    Match.arrayWith([
                        Match.stringLikeRegexp(
                            `"password":"${password}","root_password":"${password}"`,
                        ),
                    ]),
                ],
            },
        });
    });
});
