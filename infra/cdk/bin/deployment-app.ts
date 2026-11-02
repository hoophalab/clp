#!/usr/bin/env node

import {DeploymentStack} from "../lib/deployment-stack";
import {getKubernetesResources} from "../lib/kubernetes-resources";
import {
    createApp,
    getClpChartConfig,
    getClpDeploymentId,
    getClpImageTag,
    getClusterName,
    getClusterSecret,
    getEnv,
    getWorkerSlotsPerPod,
} from "./app-context";


const app = createApp();
const clusterName = getClusterName(app);
const clusterSecret = getClusterSecret(app);
const env = getEnv();
const clpChartConfig = getClpChartConfig(app);
const compressionWorkerResource = getKubernetesResources(
    app,
    "compressionWorkerResource",
    {memory: "1536Mi"},
);
const compressionWorkerSlotsPerPod = getWorkerSlotsPerPod(app, "compressionWorkerSlotsPerPod");
const deploymentId = getClpDeploymentId(app);
const imageTag = getClpImageTag(app);
const queryWorkerResource = getKubernetesResources(
    app,
    "queryWorkerResource",
    {memory: "1536Mi"},
);
const queryWorkerSlotsPerPod = getWorkerSlotsPerPod(app, "queryWorkerSlotsPerPod");
const resultsCacheResource = getKubernetesResources(app, "resultsCacheResource", {memory: "768Mi"});

// eslint-disable-next-line no-new
new DeploymentStack(app, `Deployment-${deploymentId}`, {
    chart: clpChartConfig.chart,
    chartVersion: clpChartConfig.chartVersion,
    clusterName: clusterName,
    clusterSecret: clusterSecret,
    compressionWorkerResource: compressionWorkerResource,
    compressionWorkerSlotsPerPod: compressionWorkerSlotsPerPod,
    deploymentId: deploymentId,
    env: env,
    imageTag: imageTag,
    queryWorkerResource: queryWorkerResource,
    queryWorkerSlotsPerPod: queryWorkerSlotsPerPod,
    resultsCacheResource: resultsCacheResource,
});
