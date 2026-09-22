#!/usr/bin/env node

import {EcrStack} from "../lib/ecr-stack";
import {EksStack} from "../lib/eks-stack";
import {RdsStack} from "../lib/rds-stack";
import {VpcStack} from "../lib/vpc-stack";
import {
    createApp,
    getAuth0ClientId,
    getAuth0ClientSecretParameterName,
    getAuth0Domain,
    getAuthServerImageTag,
    getCertManagerChartVersion,
    getCloudflareApiTokenParameterName,
    getCloudflareZoneNames,
    getClusterAdminRoleArn,
    getClusterName,
    getDatabasePublicAccessCidrs,
    getDomainName,
    getEnv,
    getEnvoyGatewayChartVersion,
    getExternalDnsChartVersion,
    getExternalSecretsChartVersion,
    getGithubRepository,
    getNodeGroupAmiType,
    getNodeGroupDesiredSize,
    getNodeGroupInstanceType,
} from "./app-context";


const app = createApp();
const auth0ClientId = getAuth0ClientId(app);
const auth0ClientSecretParameterName = getAuth0ClientSecretParameterName(app);
const auth0Domain = getAuth0Domain(app);
const authServerImageTag = getAuthServerImageTag(app);
const certManagerChartVersion = getCertManagerChartVersion(app);
const cloudflareApiTokenParameterName = getCloudflareApiTokenParameterName(app);
const cloudflareZoneNames = getCloudflareZoneNames(app);
const clusterAdminRoleArn = getClusterAdminRoleArn(app);
const clusterName = getClusterName(app);
const databasePublicAccessCidrs = getDatabasePublicAccessCidrs(app);
const domainName = getDomainName(app);
const envoyGatewayChartVersion = getEnvoyGatewayChartVersion(app);
const externalDnsChartVersion = getExternalDnsChartVersion(app);
const externalSecretsChartVersion = getExternalSecretsChartVersion(app);
const githubRepository = getGithubRepository(app);
const nodeGroupAmiType = getNodeGroupAmiType(app);
const nodeGroupDesiredSize = getNodeGroupDesiredSize(app);
const nodeGroupInstanceType = getNodeGroupInstanceType(app);
const env = getEnv();

const vpcStack = new VpcStack(app, "Vpc", {clusterName, env});
const {vpc} = vpcStack;

const rdsStack = new RdsStack(app, "Rds", {
    clusterName: clusterName,
    env: env,
    publicAccessCidrs: databasePublicAccessCidrs,
    vpc: vpc,
});

const ecrStack = new EcrStack(app, "Ecr", {
    clusterName,
    env,
    githubRepository,
});

const eksStack = new EksStack(app, "Eks", {
    auth0ClientId: auth0ClientId,
    auth0ClientSecretParameterName: auth0ClientSecretParameterName,
    auth0Domain: auth0Domain,
    authServerImageRepository: ecrStack.authServerImageRepository.repositoryUri,
    authServerImageTag: authServerImageTag,
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
    nodeGroupAmiType: nodeGroupAmiType,
    nodeGroupDesiredSize: nodeGroupDesiredSize,
    nodeGroupInstanceType: nodeGroupInstanceType,
    rdsHost: rdsStack.host,
    rdsName: rdsStack.name,
    rdsPort: rdsStack.port,
    rdsSecretArn: rdsStack.secret.secretArn,
    rdsSecurityGroupId: rdsStack.securityGroup.securityGroupId,
    rdsUsername: rdsStack.username,
    vpc: vpc,
});

eksStack.addDependency(ecrStack);
eksStack.addDependency(rdsStack);
