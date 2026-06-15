#!/usr/bin/env node

import * as cdk from "aws-cdk-lib/core";
import {AwsSolutionsChecks} from "cdk-nag";

import {EksStack} from "../lib/eks-stack";
import {VpcStack} from "../lib/vpc-stack";


/**
 * Throws an error with the given message.
 *
 * @param message Error message.
 * @throws {Error} Always throws with the given message.
 */
const panic = function (message: string): never {
    throw new Error(message);
};

const app = new cdk.App();

cdk.Aspects.of(app).add(new AwsSolutionsChecks());

const clusterName = app.node.tryGetContext("com.yscope.cloud/clusterName") as string | undefined ??
    panic(
        "Missing required context variable: 'com.yscope.cloud/clusterName'. " +
        "Pass it via cdk.json or the CLI (-c com.yscope.cloud/clusterName=MyCluster). " +
        "'clusterName' is required to isolate stacks across environments " +
        "(e.g., dev, staging, prod)."
    );

const clusterAdminRoleArn = app.node.tryGetContext(
    "com.yscope.cloud/clusterAdminRoleArn"
) as string | undefined ?? panic(
    "Missing required context variable: " +
    "'com.yscope.cloud/clusterAdminRoleArn'. Pass it via cdk.json or the " +
    "CLI (-c com.yscope.cloud/clusterAdminRoleArn=arn:aws:iam::...). " +
    "This role is used to map an IAM role to the EKS cluster admin " +
    "(system:masters group)."
);

const env: cdk.Environment = {
    account: process.env.CDK_DEFAULT_ACCOUNT ??
        panic("CDK_DEFAULT_ACCOUNT is not set. Please verify login using aws cli"),
    region: process.env.CDK_DEFAULT_REGION ??
        panic("CDK_DEFAULT_REGION is not set. Please verify login using aws cli"),
};

const vpcStack = new VpcStack(app, "Vpc", {clusterName, env});

// eslint-disable-next-line no-new
new EksStack(app, "Eks", {
    clusterAdminRoleArn: clusterAdminRoleArn,
    clusterName: clusterName,
    env: env,
    vpc: vpcStack.vpc,
});
