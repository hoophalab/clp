#!/usr/bin/env node

import {DeploymentStack} from "../lib/deployment-stack";
import {
    createApp,
    DEFAULT_WORKER_SLOTS_PER_POD,
    getClpChartConfig,
    getClpDeploymentId,
    getClpImageTag,
    getClusterName,
    getClusterSecret,
    getEnv,
    getKubernetesResources,
    getWorkerSlotsPerPod,
} from "./app-context";


const app = createApp();
const clusterName = getClusterName(app);
const clusterSecret = getClusterSecret(app);
const env = getEnv();
const clpChartConfig = getClpChartConfig(app);
const compressionWorkerSlotsPerPod = getWorkerSlotsPerPod(app, "compressionWorkerSlotsPerPod");
const compressionWorkerResource = getKubernetesResources(
    app,
    "compressionWorkerResource",
    {cpu: String(compressionWorkerSlotsPerPod), memory: "1536Mi"},
);
const deploymentId = getClpDeploymentId(app);
const imageTag = getClpImageTag(app);
const prestoWorkerResource = getKubernetesResources(
    app,
    "prestoWorkerResource",
    {cpu: String(DEFAULT_WORKER_SLOTS_PER_POD), memory: "1536Mi"},
);
const queryWorkerSlotsPerPod = getWorkerSlotsPerPod(app, "queryWorkerSlotsPerPod");
const queryWorkerResource = getKubernetesResources(
    app,
    "queryWorkerResource",
    {cpu: String(queryWorkerSlotsPerPod), memory: "1536Mi"},
);
const resultsCacheResource = getKubernetesResources(
    app,
    "resultsCacheResource",
    {memory: "1024Mi"},
);

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
    prestoWorkerResource: prestoWorkerResource,
    queryWorkerResource: queryWorkerResource,
    queryWorkerSlotsPerPod: queryWorkerSlotsPerPod,
    resultsCacheResource: resultsCacheResource,
});
