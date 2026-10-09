import * as cdk from "aws-cdk-lib/core";


export const CONSOLE_SERVER_ROLE_NAME = "cloud-console-server";

export const getConsoleServerRoleArn = (stack: cdk.Stack): string => stack.formatArn({
    region: "",
    resource: "role",
    resourceName: CONSOLE_SERVER_ROLE_NAME,
    service: "iam",
});
