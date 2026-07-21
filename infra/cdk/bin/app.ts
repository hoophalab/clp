#!/usr/bin/env node

import {ClpRegistryStack} from "../lib/clp-registry-stack";
import {EksStack} from "../lib/eks-stack";
import {VpcStack} from "../lib/vpc-stack";
import {
    createApp,
    getCertManagerChartVersion,
    getCloudflareApiTokenParameterName,
    getCloudflareZoneNames,
    getClusterAdminRoleArn,
    getClusterName,
    getDomainName,
    getEnv,
    getEnvoyGatewayChartVersion,
    getExternalDnsChartVersion,
    getExternalSecretsChartVersion,
} from "./app-context";


const app = createApp();
const certManagerChartVersion = getCertManagerChartVersion(app);
const cloudflareApiTokenParameterName = getCloudflareApiTokenParameterName(app);
const cloudflareZoneNames = getCloudflareZoneNames(app);
const clusterAdminRoleArn = getClusterAdminRoleArn(app);
const clusterName = getClusterName(app);
const domainName = getDomainName(app);
const envoyGatewayChartVersion = getEnvoyGatewayChartVersion(app);
const externalDnsChartVersion = getExternalDnsChartVersion(app);
const externalSecretsChartVersion = getExternalSecretsChartVersion(app);
const env = getEnv();

const vpcStack = new VpcStack(app, "Vpc", {clusterName, env});

// eslint-disable-next-line no-new
new ClpRegistryStack(app, "ClpRegistry", {clusterName, env});

// eslint-disable-next-line no-new
new EksStack(app, "Eks", {
    certManagerChartVersion: certManagerChartVersion,
    cloudflareApiTokenParameterName: cloudflareApiTokenParameterName,
    cloudflareZoneNames: cloudflareZoneNames,
    clusterAdminRoleArn: clusterAdminRoleArn,
    clusterName: clusterName,
    domainName: domainName,
    env: env,
    envoyGatewayChartVersion: envoyGatewayChartVersion,
    externalDnsChartVersion: externalDnsChartVersion,
    externalSecretsChartVersion: externalSecretsChartVersion,
    vpc: vpcStack.vpc,
});
