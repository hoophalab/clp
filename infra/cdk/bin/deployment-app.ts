#!/usr/bin/env node

import {DeploymentStack} from "../lib/deployment-stack";
import {
    createApp,
    getClpChartConfig,
    getClpDeploymentId,
    getClpImageTag,
    getClusterName,
    getClusterSecret,
    getEnv,
} from "./app-context";


const app = createApp();
const clusterName = getClusterName(app);
const clusterSecret = getClusterSecret(app);
const env = getEnv();
const clpChartConfig = getClpChartConfig(app);
const deploymentId = getClpDeploymentId(app);
const imageTag = getClpImageTag(app);

// eslint-disable-next-line no-new
new DeploymentStack(app, `Deployment-${deploymentId}`, {
    chart: clpChartConfig.chart,
    chartVersion: clpChartConfig.chartVersion,
    clusterName: clusterName,
    clusterSecret: clusterSecret,
    deploymentId: deploymentId,
    env: env,
    imageTag: imageTag,
});
