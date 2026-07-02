#!/usr/bin/env node

import {ClpRegistryStack} from "../lib/clp-registry-stack";
import {EksStack} from "../lib/eks-stack";
import {VpcStack} from "../lib/vpc-stack";
import {
    createApp,
    getClusterAdminRoleArn,
    getClusterName,
    getEnv,
} from "./app-context";


const app = createApp();
const clusterAdminRoleArn = getClusterAdminRoleArn(app);
const clusterName = getClusterName(app);
const env = getEnv();

const vpcStack = new VpcStack(app, "Vpc", {clusterName, env});

// eslint-disable-next-line no-new
new ClpRegistryStack(app, "ClpRegistry", {clusterName, env});

// eslint-disable-next-line no-new
new EksStack(app, "Eks", {
    clusterAdminRoleArn: clusterAdminRoleArn,
    clusterName: clusterName,
    env: env,
    vpc: vpcStack.vpc,
});
