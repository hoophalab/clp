import {
    Match,
    Template,
} from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib/core";
import {
    describe,
    test,
} from "vitest";

import {EksStack} from "../lib/eks-stack";
import {VpcStack} from "../lib/vpc-stack";


/* eslint-disable max-lines-per-function */
describe("EksStack", () => {
    test("synthesizes an EKS cluster", () => {
        const app = new cdk.App();
        const vpcStack = new VpcStack(app, "TestVpc", {
            clusterName: "test",
            env: {account: "123456789012", region: "us-east-1"},
        });
        const stack = new EksStack(app, "TestEks", {
            cloudflareApiTokenParameterName: "/cloud/test/cloudflare-api-token",
            clusterAdminRoleArn: "arn:aws:iam::123456789012:role/test-cluster-admin",
            clusterName: "test",
            domainName: "cloud.yscope.com",
            env: {account: "123456789012", region: "us-east-1"},
            envoyGatewayChartVersion: "v1.8.2",
            externalSecretsChartVersion: "2.7.0",
            vpc: vpcStack.vpc,
        });

        const template = Template.fromStack(stack);

        template.resourceCountIs("Custom::AWSCDK-EKS-Cluster", 1);
        template.resourceCountIs("AWS::EKS::Addon", 1);
        template.resourceCountIs("Custom::AWSCDK-EKS-HelmChart", 2);
        template.resourceCountIs(
            "Custom::AWSCDK-EKS-KubernetesResource",
            // eslint-disable-next-line no-magic-numbers
            8,
        );
        template.hasResourceProperties("AWS::IAM::Policy", {
            PolicyDocument: {
                Statement: Match.arrayWith([
                    Match.objectLike({
                        Action: "ssm:GetParameter",
                        Effect: "Allow",
                        Resource: {
                            "Fn::Join": [
                                "",
                                [
                                    "arn:",
                                    {Ref: "AWS::Partition"},
                                    ":ssm:us-east-1:123456789012:" +
                                    "parameter/cloud/test/cloudflare-api-token",
                                ],
                            ],
                        },
                    }),
                ]),
            },
        });
        template.hasResourceProperties("Custom::AWSCDK-EKS-HelmChart", {
            Chart: "external-secrets",
            Namespace: "external-secrets",
            Repository: "https://charts.external-secrets.io",
            Values: {
                "Fn::Join": [
                    "",
                    Match.arrayWith([
                        Match.stringLikeRegexp(
                            "serviceAccountTokenCreate.*" +
                            "eks.amazonaws.com/role-arn",
                        ),
                        Match.objectLike({
                            "Fn::GetAtt": [
                                Match.stringLikeRegexp("^ExternalSecretsRole"),
                                "Arn",
                            ],
                        }),
                    ]),
                ],
            },
            Version: "2.7.0",
        });
        template.hasResourceProperties("Custom::AWSCDK-EKS-KubernetesResource", {
            Manifest: Match.serializedJson(Match.arrayWith([
                Match.objectLike({
                    apiVersion: "external-secrets.io/v1",
                    kind: "ClusterSecretStore",
                    metadata: Match.objectLike({name: "aws-parameter-store"}),
                    spec: {
                        conditions: [
                            {
                                namespaces: [
                                    "external-dns",
                                    "cert-manager",
                                ],
                            },
                        ],
                        provider: {
                            aws: {
                                region: "us-east-1",
                                service: "ParameterStore",
                            },
                        },
                    },
                }),
            ])),
        });
    });
});
/* eslint-enable max-lines-per-function */
