import * as cdk from "aws-cdk-lib/core";
import {AwsSolutionsChecks} from "cdk-nag";


const MAX_CLP_DEPLOYMENT_ID_LENGTH = 59;
const DEFAULT_EXTERNAL_DNS_CHART_VERSION = "1.21.1";
const DEFAULT_EXTERNAL_SECRETS_CHART_VERSION = "2.7.0";
const DEFAULT_ENVOY_GATEWAY_CHART_VERSION = "v1.8.2";

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

/**
 * Gets the public base domain from CDK context.
 *
 * @param app CDK app.
 * @return Public base domain.
 */
export const getDomainName = function (app: cdk.App): string {
    return app.node.tryGetContext("com.yscope.cloud/domainName") as string | undefined ??
        panic(
            "Missing required context variable: 'com.yscope.cloud/domainName'. " +
            "Pass it via cdk.json or the CLI " +
            "(-c com.yscope.cloud/domainName=cloud.yscope.com)."
        );
};

/**
 * Gets the authoritative Cloudflare zones ExternalDNS may manage.
 *
 * @param app CDK app.
 * @return Authoritative Cloudflare zone names.
 */
export const getCloudflareZoneNames = function (app: cdk.App): string[] {
    const zoneNames: unknown = app.node.tryGetContext(
        "com.yscope.cloud/cloudflareZoneNames",
    );
    const untrimmedZoneNames: unknown = (
        "string" === typeof zoneNames ?
            zoneNames.split(",") :
            zoneNames
    );

    if (
        false === Array.isArray(untrimmedZoneNames) ||
        false === untrimmedZoneNames.every(
            (zoneName: unknown): zoneName is string => "string" === typeof zoneName,
        )
    ) {
        return panic(
            "Missing or invalid context variable: " +
            "'com.yscope.cloud/cloudflareZoneNames'. Pass a comma-separated list " +
            "via the CLI (-c com.yscope.cloud/cloudflareZoneNames=yscope.com).",
        );
    }
    const parsedZoneNames = untrimmedZoneNames.map(
        (zoneName) => zoneName.trim(),
    );

    if (0 >= parsedZoneNames.length || !parsedZoneNames.every(Boolean)) {
        return panic(
            "Invalid context variable: " +
            "'com.yscope.cloud/cloudflareZoneNames'. Expected a non-empty comma-separated " +
            `list of zone names but got: ${JSON.stringify(zoneNames)}. ` +
            "Pass a comma-separated list via the CLI " +
            "(-c com.yscope.cloud/cloudflareZoneNames=yscope.com).",
        );
    }

    return parsedZoneNames;
};

/**
 * Gets the SSM SecureString parameter containing the Cloudflare API token.
 *
 * The parameter value must be the token itself.
 *
 * @param app CDK app.
 * @return SSM parameter name.
 */
export const getCloudflareApiTokenParameterName = function (app: cdk.App): string {
    const parameterName: unknown = app.node.tryGetContext(
        "com.yscope.cloud/cloudflareApiTokenParameterName",
    );

    if ("string" !== typeof parameterName || 0 === parameterName.length) {
        return panic(
            "Missing or invalid context variable: " +
            "'com.yscope.cloud/cloudflareApiTokenParameterName'. Pass a " +
            "non-empty SSM parameter name via cdk.json or the CLI.",
        );
    }

    return parameterName;
};

/**
 * Gets the ExternalDNS Helm chart version from CDK context.
 *
 * @param app CDK app.
 * @return ExternalDNS Helm chart version.
 */
export const getExternalDnsChartVersion = function (app: cdk.App): string {
    return app.node.tryGetContext(
        "com.yscope.cloud/externalDnsChartVersion",
    ) as string | undefined ?? DEFAULT_EXTERNAL_DNS_CHART_VERSION;
};

/**
 * Gets the External Secrets Operator Helm chart version from CDK context.
 *
 * @param app CDK app.
 * @return External Secrets Operator Helm chart version.
 */
export const getExternalSecretsChartVersion = function (app: cdk.App): string {
    return app.node.tryGetContext(
        "com.yscope.cloud/externalSecretsChartVersion",
    ) as string | undefined ?? DEFAULT_EXTERNAL_SECRETS_CHART_VERSION;
};

/**
 * Gets the Envoy Gateway Helm chart version from CDK context.
 *
 * @param app CDK app.
 * @return Envoy Gateway Helm chart version.
 */
export const getEnvoyGatewayChartVersion = function (app: cdk.App): string {
    return app.node.tryGetContext(
        "com.yscope.cloud/envoyGatewayChartVersion",
    ) as string | undefined ?? DEFAULT_ENVOY_GATEWAY_CHART_VERSION;
};
