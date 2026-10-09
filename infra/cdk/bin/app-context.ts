/* eslint-disable max-lines */
import * as cdk from "aws-cdk-lib/core";
import {AwsSolutionsChecks} from "cdk-nag";


const MAX_CLP_DEPLOYMENT_ID_LENGTH = 32;
const MAX_CLUSTER_NAME_LENGTH = 16;
const DEFAULT_CERT_MANAGER_CHART_VERSION = "v1.21.0";
const DEFAULT_EXTERNAL_DNS_CHART_VERSION = "1.21.1";
const DEFAULT_EXTERNAL_SECRETS_CHART_VERSION = "2.7.0";
const DEFAULT_ENVOY_GATEWAY_CHART_VERSION = "v1.8.2";
const GIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const GITHUB_REPOSITORY_PATTERN = /^[\w.-]+\/[\w.-]+$/;
const IAM_USER_NAME_PATTERN = /^[\w+=.@-]{1,64}$/;
const IPV4_OCTET = "(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
const IPV4_CIDR_PATTERN = new RegExp(
    `^${IPV4_OCTET}(?:\\.${IPV4_OCTET}){3}/(?:3[0-2]|[12]?\\d)$`,
);
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
    const clusterName = app.node.tryGetContext(
        "com.yscope.cloud/clusterName",
    ) as string | undefined ?? panic(
        "Missing required context variable: 'com.yscope.cloud/clusterName'. " +
        "Pass it via cdk.json or the CLI (-c com.yscope.cloud/clusterName=prod). " +
        "'clusterName' is required to isolate stacks across environments " +
        "(e.g., dev, staging, prod)."
    );

    if (
        MAX_CLUSTER_NAME_LENGTH < clusterName.length ||
        false === KUBERNETES_NAMESPACE_LABEL_PATTERN.test(clusterName)
    ) {
        panic(
            "Invalid context variable: 'com.yscope.cloud/clusterName'. Use at most " +
            `${MAX_CLUSTER_NAME_LENGTH} lowercase letters, numbers, and hyphens, ` +
            "starting and ending with a letter or number."
        );
    }

    return clusterName;
};

/**
 * Gets the secret used to derive per-deployment database passwords.
 *
 * @param app CDK app.
 * @return Stable secret used as the password-derivation key.
 */
export const getClusterSecret = function (app: cdk.App): string {
    const clusterSecret: unknown = app.node.tryGetContext(
        "com.yscope.cloud/clusterSecret",
    );

    if ("string" !== typeof clusterSecret || 0 === clusterSecret.length) {
        return panic(
            "Missing or invalid context variable: " +
            "'com.yscope.cloud/clusterSecret'. Pass a non-empty cluster secret " +
            "via cdk.json or the CLI " +
            "(-c com.yscope.cloud/clusterSecret=CLUSTER_SECRET).",
        );
    }

    return clusterSecret;
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
 * Gets the EKS managed node group AMI type from CDK context.
 *
 * @param app CDK app.
 * @return EKS managed node group AMI type.
 */
export const getNodeGroupAmiType = function (
    app: cdk.App,
): string {
    const amiType: unknown = app.node.tryGetContext(
        "com.yscope.cloud/nodeGroupAmiType",
    ) ?? "AL2023_ARM_64_STANDARD";

    if ("string" !== typeof amiType || 0 === amiType.length) {
        return panic(
            "Invalid context variable: " +
            "'com.yscope.cloud/nodeGroupAmiType'. Pass a non-empty EKS managed " +
            "node group AMI type (for example, AL2023_ARM_64_STANDARD).",
        );
    }

    return amiType;
};

/**
 * Gets the EKS managed node group instance type from CDK context.
 *
 * @param app CDK app.
 * @return EC2 instance type.
 */
export const getNodeGroupInstanceType = function (app: cdk.App): string {
    const instanceType: unknown = app.node.tryGetContext(
        "com.yscope.cloud/nodeGroupInstanceType",
    ) ?? "c6g.xlarge";

    if ("string" !== typeof instanceType || 0 === instanceType.length) {
        return panic(
            "Invalid context variable: " +
            "'com.yscope.cloud/nodeGroupInstanceType'. Pass a non-empty EC2 " +
            "instance type (for example, c6g.xlarge).",
        );
    }

    return instanceType;
};

/**
 * Gets the EKS managed node group desired size from CDK context.
 *
 * @param app CDK app.
 * @return Desired number of nodes.
 */
export const getNodeGroupDesiredSize = function (app: cdk.App): number {
    const contextValue: unknown = app.node.tryGetContext(
        "com.yscope.cloud/nodeGroupDesiredSize",
    ) ?? 2;
    const desiredSize = Number(contextValue);

    if (
        false === Number.isInteger(desiredSize) ||
        0 > desiredSize
    ) {
        return panic(
            "Invalid context variable: " +
            "'com.yscope.cloud/nodeGroupDesiredSize'. Pass a non-negative integer.",
        );
    }

    return desiredSize;
};

/**
 * Gets the public IPv4 CIDR ranges allowed to reach the cluster database directly.
 *
 * @param app CDK app.
 * @return IPv4 CIDR ranges; empty when unset, which admits no client from outside the VPC.
 */
export const getDatabasePublicAccessCidrs = function (app: cdk.App): string[] {
    const contextValue: unknown = app.node.tryGetContext(
        "com.yscope.cloud/databasePublicAccessCidrs",
    ) ?? "";

    if ("string" !== typeof contextValue) {
        return panic(
            "Invalid context variable: 'com.yscope.cloud/databasePublicAccessCidrs'. " +
            "Pass a comma-separated list of IPv4 CIDR ranges " +
            "(-c com.yscope.cloud/databasePublicAccessCidrs=203.0.113.10/32).",
        );
    }
    if ("" === contextValue) {
        return [];
    }

    const cidrs = contextValue.split(",");

    for (const cidr of cidrs) {
        if (!IPV4_CIDR_PATTERN.test(cidr)) {
            panic(
                "Invalid context variable: 'com.yscope.cloud/databasePublicAccessCidrs'. " +
                `'${cidr}' is not an IPv4 CIDR range (e.g. 203.0.113.10/32).`,
            );
        }
    }

    return cidrs;
};

/**
 * Gets the IAM users allowed to assume the console server role.
 *
 * @param app CDK app.
 * @return IAM user names; empty when unset, which lets no one assume the role.
 */
export const getConsoleServerUserNames = function (app: cdk.App): string[] {
    const contextValue: unknown = app.node.tryGetContext(
        "com.yscope.cloud/consoleServerUserNames",
    ) ?? [];

    if (
        false === Array.isArray(contextValue) ||
        false === contextValue.every(
            (userName) => "string" === typeof userName && IAM_USER_NAME_PATTERN.test(userName),
        )
    ) {
        return panic(
            "Invalid context variable: 'com.yscope.cloud/consoleServerUserNames'." +
            " It should be a list of IAM user names in cdk.json (e.g. [\"alice\", \"bob\"]).",
        );
    }

    return contextValue as string[];
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
            `Use at most ${MAX_CLP_DEPLOYMENT_ID_LENGTH} characters.`
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
 * Gets the Auth0 tenant domain used as the OIDC issuer.
 *
 * @param app CDK app.
 * @return Auth0 tenant domain without a scheme or path.
 */
export const getAuth0Domain = function (app: cdk.App): string {
    const domain: unknown = app.node.tryGetContext(
        "com.yscope.cloud/auth0Domain",
    );

    if ("string" !== typeof domain || 0 === domain.length) {
        return panic(
            "Missing or invalid context variable: " +
            "'com.yscope.cloud/auth0Domain'. Pass the Auth0 tenant domain " +
            "without a scheme or path (for example, tenant.us.auth0.com).",
        );
    }

    return domain;
};

/**
 * Gets the public Auth0 application client ID.
 *
 * @param app CDK app.
 * @return Auth0 application client ID.
 */
export const getAuth0ClientId = function (app: cdk.App): string {
    const clientId: unknown = app.node.tryGetContext(
        "com.yscope.cloud/auth0ClientId",
    );

    if ("string" !== typeof clientId || 0 === clientId.length) {
        return panic(
            "Missing or invalid context variable: " +
            "'com.yscope.cloud/auth0ClientId'. Pass the Auth0 application " +
            "client ID via cdk.json or the CLI.",
        );
    }

    return clientId;
};

/**
 * Gets the SSM SecureString parameter containing the Auth0 client secret.
 *
 * @param app CDK app.
 * @return SSM parameter name.
 */
export const getAuth0ClientSecretParameterName = function (app: cdk.App): string {
    const parameterName: unknown = app.node.tryGetContext(
        "com.yscope.cloud/auth0ClientSecretParameterName",
    );

    if ("string" !== typeof parameterName || 0 === parameterName.length) {
        return panic(
            "Missing or invalid context variable: " +
            "'com.yscope.cloud/auth0ClientSecretParameterName'. Pass a " +
            "non-empty SSM SecureString parameter name via cdk.json or the CLI.",
        );
    }

    return parameterName;
};

/**
 * Gets the auth server image commit SHA.
 *
 * @param app CDK app.
 * @return Immutable container image tag.
 */
export const getAuthServerImageTag = function (app: cdk.App): string {
    const tag: unknown = app.node.tryGetContext(
        "com.yscope.cloud/authServerImageTag",
    );

    if ("string" !== typeof tag || false === GIT_SHA_PATTERN.test(tag)) {
        return panic(
            "Missing or invalid context variable: " +
            "'com.yscope.cloud/authServerImageTag'. Pass the 40-character " +
            "Git commit SHA published by the auth-server image workflow.",
        );
    }

    return tag;
};

/**
 * Gets the GitHub repository trusted to assume the image publishing role.
 *
 * @param app CDK app.
 * @return GitHub repository in "owner/name" form.
 */
export const getGithubRepository = function (app: cdk.App): string {
    const repository: unknown = app.node.tryGetContext(
        "com.yscope.cloud/githubRepository",
    );

    if (
        "string" !== typeof repository ||
        false === GITHUB_REPOSITORY_PATTERN.test(repository)
    ) {
        return panic(
            "Missing or invalid context variable: " +
            "'com.yscope.cloud/githubRepository'. Pass the GitHub repository " +
            "in \"owner/name\" form via cdk.json or the CLI " +
            "(-c com.yscope.cloud/githubRepository=y-scope/cloud.yscope.com).",
        );
    }

    return repository;
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
 * Gets the cert-manager Helm chart version from CDK context.
 *
 * @param app CDK app.
 * @return cert-manager Helm chart version.
 */
export const getCertManagerChartVersion = function (app: cdk.App): string {
    return app.node.tryGetContext(
        "com.yscope.cloud/certManagerChartVersion",
    ) as string | undefined ?? DEFAULT_CERT_MANAGER_CHART_VERSION;
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
/* eslint-enable max-lines */
