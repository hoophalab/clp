import {spawn} from "node:child_process";
import {
    mkdtemp,
    rm,
} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import process from "node:process";

import type {DeploymentDocument} from "../metadata-db-schemas/deployment.js";


const STDERR_TAIL_LENGTH = 16_384;

type CdkCommandResult = {
    exitCode: number | null;
    signal: NodeJS.Signals | null;
    stderr: string;
};

type CdkSubprocessOptions = {
    args: string[];
    command: string;
    cwd: string;
    env: NodeJS.ProcessEnv;
    signal?: AbortSignal;
};

type CdkDeployment = {
    _id: DeploymentDocument["_id"];
    spec: DeploymentDocument["spec"];
};

type CdkCommandOptions = {
    action: "create" | "delete";
    changeSetName?: string;
    clusterSecret: string;
    deployment: CdkDeployment;
    environment: NodeJS.ProcessEnv;
    outputDirectory: string;
};

type CdkCommandRunner = (options: {
    action: "create" | "delete";
    changeSetName?: string;
    deployment: DeploymentDocument;
    signal?: AbortSignal;
}) => Promise<CdkCommandResult>;

type CdkCommandRunnerConfiguration = {
    clusterSecret: string;
    environment?: NodeJS.ProcessEnv;
};

/**
 * Runs CDK and waits for the subprocess to exit.
 *
 * @param options Executable, arguments, working directory, environment, and cancellation signal.
 * @return The exit status and a bounded stderr tail.
 * @throws {Error} If the process cannot be started.
 */
const runCdkSubprocess = (options: CdkSubprocessOptions): Promise<CdkCommandResult> => {
    return new Promise((resolve, reject) => {
        options.signal?.throwIfAborted();

        const child = spawn(options.command, options.args, {
            cwd: options.cwd,
            detached: true,
            env: options.env,
            stdio: [
                "ignore",
                "inherit",
                "pipe",
            ],
        });
        let stderr = "";
        const abort = () => {
            if ("undefined" === typeof child.pid) {
                return;
            }

            try {
                // CDK's pnpm and Node descendants share this POSIX process group.
                process.kill(-child.pid, "SIGKILL");
            } catch (error: unknown) {
                if ("ESRCH" !== (error as NodeJS.ErrnoException).code) {
                    reject(new Error("Failed to terminate the CDK process group.", {cause: error}));
                }
            }
        };

        options.signal?.addEventListener("abort", abort, {once: true});
        if (options.signal?.aborted) {
            abort();
        }

        child.stderr.setEncoding("utf8");
        child.stderr.on("data", (chunk: string) => {
            stderr = (stderr + chunk).slice(-STDERR_TAIL_LENGTH);
        });

        child.once("error", (error) => {
            reject(error);
        });
        child.once("close", (exitCode, signal) => {
            options.signal?.removeEventListener("abort", abort);
            resolve({
                exitCode: exitCode,
                signal: signal,
                stderr: stderr,
            });
        });
    });
};

/**
 * Builds the CDK invocation from the deployment's stored configuration.
 *
 * @param options Deployment inputs and server configuration.
 * @return The executable, arguments, working directory, and environment.
 */
const buildCdkSubprocessOptions = (options: CdkCommandOptions) => ({
    args: [
        "--silent",
        "run",
        "cdk:deployment",
        "create" === options.action ?
            "deploy" :
            "destroy",
        "-c",
        `com.yscope.cloud/clusterName=${options.deployment.spec.cluster_id}`,
        "-c",
        `com.yscope.cloud/clusterSecret=${options.clusterSecret}`,
        "-c",
        `com.yscope.cloud/deploymentId=${options.deployment._id}`,
        "-c",
        "com.yscope.cloud/clpChart=clp",
        "-c",
        `com.yscope.cloud/clpChartVersion=${options.deployment.spec.helm_chart_version}`,
        "-c",
        `com.yscope.cloud/clpImageTag=${options.deployment.spec.clp_image_tag}`,
        "create" === options.action ?
            "--require-approval=never" :
            "--force",
        ..."create" === options.action && options.changeSetName ?
            [
                "--change-set-name",
                options.changeSetName,
            ] :
            [],
        "--output",
        options.outputDirectory,
        "--all",
    ],
    command: "pnpm",
    cwd: process.env.CDK_APP_DIR ?? path.resolve(import.meta.dirname, "../../../../infra/cdk"),
    env: options.environment,
});

/**
 * Configures a CDK runner that isolates concurrent invocations' output directories.
 *
 * @param configuration Stable server configuration and optional subprocess environment.
 * @return A function that runs a deployment command and waits for it to finish.
 */
const createCdkCommandRunner = (
    configuration: CdkCommandRunnerConfiguration,
): CdkCommandRunner => async ({action, changeSetName, deployment, signal}) => {
    signal?.throwIfAborted();

    const outputDirectory = await mkdtemp(path.join(tmpdir(), "yscope-cdk-"));

    try {
        return await runCdkSubprocess({
            ...buildCdkSubprocessOptions({
                action: action,
                changeSetName: changeSetName,
                clusterSecret: configuration.clusterSecret,
                deployment: deployment,
                environment: {
                    ...configuration.environment ?? process.env,
                    AWS_DEFAULT_REGION: deployment.spec.region,
                    AWS_REGION: deployment.spec.region,
                },
                outputDirectory: outputDirectory,
            }),
            signal: signal,
        });
    } finally {
        // Cleanup failures must not replace a deployment's successful outcome.
        await rm(outputDirectory, {force: true, recursive: true}).catch((error: unknown) => {
            console.error("Failed to remove CDK output directory.", {error, outputDirectory});
        });
    }
};

export {
    buildCdkSubprocessOptions,
    type CdkCommandResult,
    type CdkCommandRunner,
    createCdkCommandRunner,
};
