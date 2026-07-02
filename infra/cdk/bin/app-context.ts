import * as cdk from "aws-cdk-lib/core";
import {AwsSolutionsChecks} from "cdk-nag";


const MAX_CLP_DEPLOYMENT_ID_LENGTH = 59;

const KUBERNETES_NAMESPACE_LABEL_PATTERN = (
    /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/
);

/**
 * Throws an error with the given message.
 *
 * @param message Error message.
 * @throws {Error} Always throws with the given message.
 */
export const panic = function (message: string): never {
    throw new Error(message);
};

/**
 * Creates a CDK app configured with shared aspects.
 *
 * @return CDK app.
 */
export const createApp = function (): cdk.App {
    const app = new cdk.App();

    cdk.Aspects.of(app).add(new AwsSolutionsChecks());

    return app;
};

/**
 * Gets the cluster name from CDK context.
 *
 * @param app CDK app.
 * @return Environment-scoped cluster identifier.
 */
export const getClusterName = function (app: cdk.App): string {
    return app.node.tryGetContext("com.yscope.cloud/clusterName") as string | undefined ??
        panic(
            "Missing required context variable: 'com.yscope.cloud/clusterName'. " +
            "Pass it via cdk.json or the CLI (-c com.yscope.cloud/clusterName=MyCluster). " +
            "'clusterName' is required to isolate stacks across environments " +
            "(e.g., dev, staging, prod)."
        );
};

/**
 * Gets the IAM role ARN to map as the EKS cluster admin.
 *
 * @param app CDK app.
 * @return IAM role ARN to grant cluster administrator permissions.
 */
export const getClusterAdminRoleArn = function (app: cdk.App): string {
    return app.node.tryGetContext(
        "com.yscope.cloud/clusterAdminRoleArn",
    ) as string | undefined ?? panic(
        "Missing required context variable: " +
        "'com.yscope.cloud/clusterAdminRoleArn'. Pass it via cdk.json or the " +
        "CLI (-c com.yscope.cloud/clusterAdminRoleArn=arn:aws:iam::...). " +
        "This role is used to map an IAM role to the EKS cluster admin " +
        "(system:masters group).",
    );
};

/**
 * Gets the CDK target account and region from the environment.
 *
 * @return CDK environment.
 */
export const getEnv = function (): cdk.Environment {
    return {
        account: process.env.CDK_DEFAULT_ACCOUNT ??
            panic("CDK_DEFAULT_ACCOUNT is not set. Please verify login using aws cli"),
        region: process.env.CDK_DEFAULT_REGION ??
            panic("CDK_DEFAULT_REGION is not set. Please verify login using aws cli"),
    };
};

/**
 * Gets the CLP deployment identifier from CDK context.
 *
 * @param app CDK app.
 * @return CLP deployment identifier.
 */
export const getClpDeploymentId = function (app: cdk.App): string {
    const deploymentId = app.node.tryGetContext(
        "com.yscope.cloud/deploymentId",
    ) as string | undefined ?? panic(
        "Missing required context variable: 'com.yscope.cloud/deploymentId'. " +
        "Pass it via cdk.json or the CLI " +
        "(-c com.yscope.cloud/deploymentId=0123456789abcdef)."
    );

    if (false === KUBERNETES_NAMESPACE_LABEL_PATTERN.test(deploymentId)) {
        panic(
            "Invalid context variable: 'com.yscope.cloud/deploymentId'. " +
            "Use a Kubernetes namespace-safe value: lowercase letters, " +
            "numbers, and hyphens, starting and ending with a letter or number."
        );
    }

    if (MAX_CLP_DEPLOYMENT_ID_LENGTH < deploymentId.length) {
        panic(
            "Invalid context variable: 'com.yscope.cloud/deploymentId'. " +
            "Use at most 59 characters so the generated 'clp-' namespace " +
            "stays within Kubernetes' 63-character limit."
        );
    }

    return deploymentId;
};

/**
 * Gets the CLP package image tag from CDK context.
 *
 * @param app CDK app.
 * @return CLP package image tag.
 */
export const getClpImageTag = function (app: cdk.App): string {
    return app.node.tryGetContext("com.yscope.cloud/clpImageTag") as string | undefined ??
        panic(
            "Missing required context variable: 'com.yscope.cloud/clpImageTag'. " +
            "Pass it via cdk.json or the CLI " +
            "(-c com.yscope.cloud/clpImageTag=IMAGE_TAG)."
        );
};

/**
 * Gets CLP chart deployment settings from CDK context.
 *
 * @param app CDK app.
 * @return CLP chart settings.
 */
export const getClpChartConfig = function (
    app: cdk.App,
): {
    chart: string;
    chartVersion: string;
} {
    return {
        chart: app.node.tryGetContext("com.yscope.cloud/clpChart") as string | undefined ??
            panic(
                "Missing required context variable: 'com.yscope.cloud/clpChart'. " +
                "Pass it via cdk.json or the CLI " +
                "(-c com.yscope.cloud/clpChart=CHART_NAME)."
            ),
        chartVersion: app.node.tryGetContext(
            "com.yscope.cloud/clpChartVersion",
        ) as string | undefined ??
            panic(
                "Missing required context variable: 'com.yscope.cloud/clpChartVersion'. " +
                "Pass it via cdk.json or the CLI " +
                "(-c com.yscope.cloud/clpChartVersion=1.2.3)."
            ),
    };
};
