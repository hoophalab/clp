import * as iam from "aws-cdk-lib/aws-iam";
import * as cdk from "aws-cdk-lib/core";
import {NagSuppressions} from "cdk-nag";
import {Construct} from "constructs";

import {CONSOLE_SERVER_ROLE_NAME} from "./iam-constants";


export interface IamStackProps extends cdk.StackProps {
    consoleServerUserNames: readonly string[];
}

export class IamStack extends cdk.Stack {
    constructor (scope: Construct, id: string, props: IamStackProps) {
        super(scope, id, props);

        // eslint-disable-next-line no-new
        new iam.OidcProviderNative(this, "GithubOidcProvider", {
            clientIds: ["sts.amazonaws.com"],
            url: "https://token.actions.githubusercontent.com",
        });

        this.addConsoleServerRole(props.consoleServerUserNames);
    }

    private getConsoleServerPrincipal (userNames: readonly string[]): iam.IPrincipal {
        if (0 === userNames.length) {
            return new iam.AccountRootPrincipal().withConditions({
                Null: {"aws:PrincipalArn": "true"},
            });
        }

        return new iam.CompositePrincipal(...userNames.map((userName) => new iam.ArnPrincipal(
            this.formatArn({
                region: "",
                resource: "user",
                resourceName: userName,
                service: "iam",
            }),
        )));
    }

    private addConsoleServerRole (userNames: readonly string[]) {
        const consoleServerRole = new iam.Role(this, "ConsoleServerRole", {
            assumedBy: this.getConsoleServerPrincipal(userNames),
            description: "Machine identity for the cloud console server.",
            roleName: CONSOLE_SERVER_ROLE_NAME,
        });

        consoleServerRole.addToPolicy(new iam.PolicyStatement({
            actions: [
                "sts:AssumeRole",
                "sts:TagSession",
            ],
            resources: [
                this.formatArn({
                    region: "",
                    resource: "role",
                    resourceName: "cloud-*-s3",
                    service: "iam",
                }),
                this.formatArn({
                    region: "",
                    resource: "role",
                    resourceName: `cdk-${cdk.DefaultStackSynthesizer.DEFAULT_QUALIFIER}-*-role-` +
                        `${this.account}-*`,
                    service: "iam",
                }),
            ],
        }));

        consoleServerRole.addToPolicy(new iam.PolicyStatement({
            actions: ["cloudformation:DescribeStacks"],
            resources: [
                this.formatArn({
                    region: "*",
                    resource: "stack",
                    resourceName: "*-Deployment-*/*",
                    service: "cloudformation",
                }),
            ],
        }));

        consoleServerRole.addToPolicy(new iam.PolicyStatement({
            actions: ["cloudformation:ListExports"],
            resources: ["*"],
        }));

        NagSuppressions.addResourceSuppressions(
            consoleServerRole,
            [{
                id: "AwsSolutions-IAM5",
                reason: "Deployment roles, CDK bootstrap roles, and deployment stacks are" +
                    " created per deployment or region and are not known at synthesis time;" +
                    " cloudformation:ListExports does not support resource-level permissions.",
            }],
            true,
        );
    }
}
