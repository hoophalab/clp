import path from "node:path";

import {
    afterEach,
    beforeEach,
    expect,
    it,
    vi,
} from "vitest";

import {buildCdkSubprocessOptions} from "../../src/deployment-orchestrator/cdk-command-runner.js";


const CLUSTER_SECRET = "cluster-secret";
const OUTPUT_DIRECTORY = "/tmp/cdk.out-request-a";
const CHANGE_SET_NAME = "request-a-attempt-a";

const DEPLOYMENT = {
    _id: "deployment-a",
    spec: {
        cloud_provider: "aws",
        clp_image_tag: "0.5.0-main-test",
        cluster_id: "yscope1",
        compression_workers: 1,
        deployment_name: "deployment-a",
        helm_chart_version: "0.4.1-dev.11",
        region: "us-west-1",
        search_workers: 1,
    },
} as const;

const COMMAND_CASES = [
    {
        action: "create",
        decisionFlag: "--require-approval=never",
        subcommand: "deploy",
    },
    {
        action: "delete",
        decisionFlag: "--force",
        subcommand: "destroy",
    },
] as const;

beforeEach(() => {
    // eslint-disable-next-line no-undefined -- Vitest uses undefined to remove the variable.
    vi.stubEnv("CDK_APP_DIR", undefined);
});

afterEach(() => {
    vi.unstubAllEnvs();
});

it.each(COMMAND_CASES)("builds the $action command", (testCase) => {
    const environment = {
        AWS_ACCESS_KEY_ID: "access-key",
        AWS_SECRET_ACCESS_KEY: "secret-key",
        AWS_SESSION_TOKEN: "session-token",
        PATH: "/usr/bin",
    };

    const command = buildCdkSubprocessOptions({
        action: testCase.action,
        changeSetName: CHANGE_SET_NAME,
        clusterSecret: CLUSTER_SECRET,
        deployment: DEPLOYMENT,
        environment: environment,
        outputDirectory: OUTPUT_DIRECTORY,
    });

    expect(command).toEqual({
        args: [
            "--silent",
            "run",
            "cdk:deployment",
            testCase.subcommand,
            "-c",
            "com.yscope.cloud/clusterName=yscope1",
            "-c",
            `com.yscope.cloud/clusterSecret=${CLUSTER_SECRET}`,
            "-c",
            "com.yscope.cloud/deploymentId=deployment-a",
            "-c",
            "com.yscope.cloud/clpChart=clp",
            "-c",
            "com.yscope.cloud/clpChartVersion=0.4.1-dev.11",
            "-c",
            "com.yscope.cloud/clpImageTag=0.5.0-main-test",
            testCase.decisionFlag,
            ..."create" === testCase.action ?
                [
                    "--change-set-name",
                    CHANGE_SET_NAME,
                ] :
                [],
            "--output",
            OUTPUT_DIRECTORY,
            "--all",
        ],
        command: "pnpm",
        cwd: path.resolve(import.meta.dirname, "../../../../infra/cdk"),
        env: environment,
    });
});
