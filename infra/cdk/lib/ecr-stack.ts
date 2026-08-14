import * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cdk from "aws-cdk-lib/core";
import {NagSuppressions} from "cdk-nag";
import {Construct} from "constructs";

import {clusterExportName} from "./cluster-exports";
import {
    ClusterScopedStack,
    ClusterScopedStackProps,
} from "./cluster-scoped-stack";


export interface EcrStackProps extends ClusterScopedStackProps {
    githubRepository: string;
}

export class EcrStack extends ClusterScopedStack {
    public readonly authServerImageRepository: ecr.Repository;

    public readonly clpChartRepository: ecr.Repository;

    public readonly clpPackageRepository: ecr.Repository;

    public readonly githubActionsRole: iam.Role;

    constructor (scope: Construct, id: string, props: EcrStackProps) {
        super(scope, id, props);

        this.authServerImageRepository = new ecr.Repository(
            this,
            "AuthServerImageRepository",
            {
                imageScanOnPush: true,
                imageTagMutability: ecr.TagMutability.IMMUTABLE,
                repositoryName: `${props.clusterName}/auth-server`,
            },
        );

        // eslint-disable-next-line no-new
        new cdk.CfnOutput(this, "EcrAuthServerRepositoryUri", {
            exportName: clusterExportName(
                props.clusterName,
                "EcrAuthServerRepositoryUri",
            ),
            value: this.authServerImageRepository.repositoryUri,
        });

        this.clpChartRepository = new ecr.Repository(this, "ClpChartRepository", {
            imageScanOnPush: true,
            imageTagMutability: ecr.TagMutability.IMMUTABLE,
            repositoryName: `${props.clusterName}/clp`,
        });

        // eslint-disable-next-line no-new
        new cdk.CfnOutput(this, "ClpRegistryChartRepositoryUrl", {
            exportName: clusterExportName(
                props.clusterName,
                "ClpRegistryChartRepositoryUrl",
            ),
            value: cdk.Fn.join("", [
                "oci://",
                this.clpChartRepository.repositoryUri,
            ]),
        });

        this.clpPackageRepository = new ecr.Repository(this, "ClpPackageRepository", {
            imageScanOnPush: true,
            imageTagMutability: ecr.TagMutability.IMMUTABLE,
            repositoryName: `${props.clusterName}/clp-package`,
        });

        // eslint-disable-next-line no-new
        new cdk.CfnOutput(this, "ClpRegistryPackageRepositoryUri", {
            exportName: clusterExportName(
                props.clusterName,
                "ClpRegistryPackageRepositoryUri",
            ),
            value: this.clpPackageRepository.repositoryUri,
        });

        this.githubActionsRole = this.createGithubActionsRole(props);
    }

    private createGithubActionsRole (props: EcrStackProps): iam.Role {
        const githubOidcProvider = iam.OidcProviderNative.fromOidcProviderArn(
            this,
            "GithubOidcProvider",
            cdk.Stack.of(this).formatArn({
                arnFormat: cdk.ArnFormat.SLASH_RESOURCE_NAME,
                region: "",
                resource: "oidc-provider",
                resourceName: "token.actions.githubusercontent.com",
                service: "iam",
            }),
        );

        const githubActionsRole = new iam.Role(this, "GithubActionsRole", {
            assumedBy: new iam.WebIdentityPrincipal(
                githubOidcProvider.oidcProviderArn,
                {
                    StringEquals: {
                        "token.actions.githubusercontent.com:aud":
                            "sts.amazonaws.com",
                    },
                    StringLike: {
                        "token.actions.githubusercontent.com:sub": [
                            `repo:${props.githubRepository}:ref:refs/heads/main`,
                            `repo:${props.githubRepository}:ref:refs/heads/image/*`,
                        ],
                    },
                },
            ),
            description: "Assumed by GitHub Actions through OIDC to publish " +
                "images to the cluster's ECR repositories.",
        });

        this.authServerImageRepository.grantPullPush(githubActionsRole);
        this.clpChartRepository.grantPullPush(githubActionsRole);
        this.clpPackageRepository.grantPullPush(githubActionsRole);

        // AwsSolutions-IAM5 flags IAM policies that contain wildcards.
        //
        // Suppress it here because "ecr:GetAuthorizationToken" only supports
        // the "*" resource, and the remaining grants are scoped to the
        // cluster's repositories.
        NagSuppressions.addResourceSuppressions(
            githubActionsRole,
            [
                {
                    id: "AwsSolutions-IAM5",
                    reason: "\"ecr:GetAuthorizationToken\" only supports the " +
                        "\"*\" resource.",
                },
            ],
            true,
        );

        // eslint-disable-next-line no-new
        new cdk.CfnOutput(this, "EcrGithubActionsRoleArn", {
            exportName: clusterExportName(
                props.clusterName,
                "EcrGithubActionsRoleArn",
            ),
            value: githubActionsRole.roleArn,
        });

        return githubActionsRole;
    }
}
