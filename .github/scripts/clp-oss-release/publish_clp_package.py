#!/usr/bin/env python3
"""Build and optionally publish the CLP package image and Helm chart."""
from __future__ import annotations

import argparse
import grp
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

import boto3
from botocore.exceptions import BotoCoreError, ClientError

CHART_NAME = "clp"
CONTAINER_WORKSPACE = "/mnt/repo"
DEPS_IMAGES_BY_MACHINE = {
    "aarch64": "clp-core-dependencies-aarch64-ubuntu-jammy",
    "x86_64": "clp-core-dependencies-x86-ubuntu-jammy",
}


def call(*command: str) -> None:
    subprocess.run(command, check=True)


def output(*command: str) -> str:
    return subprocess.check_output(command, text=True).strip()


class Ecr:
    def __init__(self, region: str) -> None:
        session = boto3.Session(region_name=region)
        account = session.client("sts").get_caller_identity()["Account"]
        self.client = session.client("ecr")
        self.host = f"{account}.dkr.ecr.{region}.amazonaws.com"

    def image(self, repository: str, tag: str) -> dict | None:
        response = self.client.batch_get_image(
            repositoryName=repository,
            imageIds=[{"imageTag": tag}],
        )
        return next(iter(response.get("images") or []), None)

    def digest(self, repository: str, tag: str) -> str:
        image = self.image(repository, tag)
        return image["imageId"]["imageDigest"] if image else ""

    def retag(self, repository: str, source_tag: str, target_tag: str) -> bool:
        image = self.image(repository, source_tag)
        if not image:
            return False
        self.client.put_image(
            repositoryName=repository,
            imageTag=target_tag,
            imageManifest=image["imageManifest"],
        )
        return True

    def check_access(self, repository: str) -> None:
        self.image(repository, "clp-oss-release-probe")
        self.client.batch_check_layer_availability(
            repositoryName=repository,
            layerDigests=["sha256:" + "0" * 64],
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--mode", choices=("preflight", "build", "publish"),
        default="build")
    parser.add_argument(
        "--components", choices=("both", "image", "chart"),
        default="both")
    parser.add_argument("--cluster", required=True)
    parser.add_argument("--aws-region", dest="region", required=True)
    parser.add_argument("--package-version", dest="version", default="")
    parser.add_argument("--arch", choices=("arm64", "amd64"), default="")
    parser.add_argument("--source-commit-sha", dest="source_sha", required=True)
    parser.add_argument("--source-dir", required=True)
    parser.add_argument("--deps-image-ref", default="main")
    parser.add_argument("--source-ref", default="")
    parser.add_argument("--source-repository", default="")
    parser.add_argument("--cpp-parallelism", default="")
    config = parser.parse_args()
    if not re.fullmatch(r"[a-z0-9-]+", config.region):
        parser.error(f"invalid AWS region: {config.region}")
    if not re.fullmatch(r"[0-9a-fA-F]{40}", config.source_sha):
        parser.error("source commit must be an exact 40-character SHA")

    suffix = f"-{config.arch}" if config.arch else ""
    config.image_tag = f"{config.version}{suffix}"
    config.commit_tag = f"{config.source_sha}{suffix}"
    config.image_repo = f"{config.cluster}/clp-package"
    config.chart_repo = f"{config.cluster}/{CHART_NAME}"
    config.want_image = config.components in ("both", "image")
    config.want_chart = config.components in ("both", "chart")
    if (
        config.mode == "publish"
        and config.want_image
        and not re.fullmatch(r"[A-Za-z0-9_][\w.-]{0,127}", config.image_tag)
    ):
        parser.error(f"invalid image tag: {config.image_tag}")
    return config


def preflight(config: argparse.Namespace, ecr: Ecr) -> None:
    for tool in ("docker", "git"):
        if not shutil.which(tool):
            raise SystemExit(f"required command not found: {tool}")
    call("docker", "info")

    os.chdir(config.source_dir)
    if output("git", "rev-parse", "HEAD").lower() != config.source_sha.lower():
        raise SystemExit("the source checkout is not at the resolved commit")
    submodules = output("git", "submodule", "status", "--recursive")
    if any(line.startswith(("+", "-")) for line in submodules.splitlines()):
        raise SystemExit("the source checkout has missing or divergent submodules")

    repositories = []
    if config.want_image:
        repositories.append(config.image_repo)
    if config.want_chart:
        repositories.append(config.chart_repo)
    for repository in repositories:
        ecr.check_access(repository)


def dependency_image(config: argparse.Namespace) -> str:
    machine = os.uname().machine
    if machine not in DEPS_IMAGES_BY_MACHINE:
        raise SystemExit(f"unsupported architecture: {machine}")
    separator = "@" if config.deps_image_ref.startswith("sha256:") else ":"
    return f"ghcr.io/y-scope/clp/{DEPS_IMAGES_BY_MACHINE[machine]}{separator}{config.deps_image_ref}"


def run_tasks(config: argparse.Namespace, result: dict[str, str], *tasks: str) -> None:
    image = dependency_image(config)
    parallelism = config.cpp_parallelism or str(os.cpu_count())
    call(
        "docker", "run", "--rm",
        "--user", f"{os.getuid()}:{os.getgid()}",
        "--group-add", str(grp.getgrnam("docker").gr_gid),
        "--volume", f"{Path.cwd()}:{CONTAINER_WORKSPACE}",
        "--volume", f"{shutil.which('docker')}:/usr/local/bin/docker:ro",
        "--volume", "/var/run/docker.sock:/var/run/docker.sock",
        "--workdir", CONTAINER_WORKSPACE,
        "--env", f"CLP_CPP_MAX_PARALLELISM_PER_BUILD_TASK={parallelism}",
        "--env", "HOME=/tmp",
        image, "task", *tasks,
    )
    try:
        digest_list = json.loads(
            output("docker", "image", "inspect", "--format", "{{json .RepoDigests}}", image)
        )
    except (subprocess.CalledProcessError, json.JSONDecodeError):
        digest_list = []
    result.setdefault("deps_image", digest_list[0] if digest_list else image)


def image_needs_build(
    config: argparse.Namespace, ecr: Ecr, result: dict[str, str]
) -> bool:
    if not config.want_image or config.mode != "publish":
        return config.want_image

    version_image = ecr.image(config.image_repo, config.image_tag)
    if version_image:
        if ecr.digest(config.image_repo, config.commit_tag) != version_image["imageId"][
            "imageDigest"
        ]:
            raise SystemExit(f"{config.image_tag} belongs to a different commit")
        print(f"Image {config.image_tag} is already published")
        return False

    if not ecr.image(config.image_repo, config.commit_tag):
        return True
    if not ecr.retag(config.image_repo, config.commit_tag, config.image_tag):
        raise SystemExit(f"could not tag {config.commit_tag} as {config.image_tag}")
    result.update(image=config.image_tag, image_reused="true")
    try:
        result["image_digest"] = ecr.digest(config.image_repo, config.image_tag)
    except (BotoCoreError, ClientError):
        pass
    return False


def build_image(config: argparse.Namespace, result: dict[str, str]) -> str:
    print("Building image", flush=True)
    run_tasks(config, result, "package-build-deps", "docker-images:package")
    return Path("build/clp-package-image.id").read_text(encoding="utf-8").strip()


def push_image(
    config: argparse.Namespace, ecr: Ecr, result: dict[str, str], image_id: str
) -> None:
    commit_uri = f"{ecr.host}/{config.image_repo}:{config.commit_tag}"
    call("docker", "tag", image_id, commit_uri)
    try:
        call("docker", "push", commit_uri)
    except subprocess.CalledProcessError:
        if not ecr.image(config.image_repo, config.commit_tag):
            raise

    result["commit_image"] = config.commit_tag
    if config.image_tag != config.commit_tag and not ecr.retag(
        config.image_repo, config.commit_tag, config.image_tag
    ):
        raise SystemExit(f"could not tag {config.commit_tag} as {config.image_tag}")
    result["image"] = config.image_tag
    try:
        result["image_digest"] = ecr.digest(config.image_repo, config.image_tag)
    except (BotoCoreError, ClientError):
        pass


def chart_version() -> str:
    chart_file = Path("tools/deployment/package-helm/Chart.yaml")
    if not chart_file.is_file():
        return ""
    match = re.search(r"^version:\s*['\"]?([^'\"\s]+)", chart_file.read_text(), re.MULTILINE)
    return match.group(1) if match else ""


def chart_needs_build(config: argparse.Namespace, ecr: Ecr) -> bool:
    if not config.want_chart or config.mode != "publish":
        return config.want_chart
    version = chart_version()
    if version and ecr.image(config.chart_repo, version):
        print(f"Chart {version} is already published")
        return False
    return True


def build_chart(
    config: argparse.Namespace, result: dict[str, str]
) -> tuple[Path, str]:
    print("Building chart", flush=True)
    run_tasks(config, result, "helm:package")
    charts = sorted(Path("build/clp-package-helm").glob(f"{CHART_NAME}-*.tgz"))
    if not charts:
        raise SystemExit("the Helm package was not created")
    version = charts[0].stem.removeprefix(f"{CHART_NAME}-")
    result["chart_version"] = version
    return charts[0], version


def push_chart(
    config: argparse.Namespace,
    ecr: Ecr,
    result: dict[str, str],
    chart: Path,
    version: str,
) -> None:
    helm = Path("build/toolchains/helm/helm").resolve()
    if not os.access(helm, os.X_OK):
        raise SystemExit(f"Helm was not provisioned: {helm}")
    call(str(helm), "push", str(chart), f"oci://{ecr.host}/{config.cluster}")
    result["chart"] = version
    try:
        result["chart_digest"] = ecr.digest(config.chart_repo, version)
    except (BotoCoreError, ClientError):
        pass


def write_summary(config: argparse.Namespace, result: dict[str, str]) -> None:
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if not path:
        return
    lines = [
        "## CLP OSS release",
        "",
        f"- Mode: `{config.mode}`",
        f"- Source: `{config.source_repository}@{config.source_sha}` (from `{config.source_ref}`)",
        f"- Target: `{config.cluster}` in `{config.region}`",
    ]
    if result.get("deps_image"):
        lines.append(f"- Built in: `{result['deps_image']}`")
    lines += ["", "### Artifacts", ""]
    if result.get("chart_version"):
        lines.append(f"- Chart version: `{result['chart_version']}`")
    if result.get("image"):
        reused = " (reused, not rebuilt)" if result.get("image_reused") else ""
        lines.append(f"- Image: `{config.image_repo}:{result['image']}`{reused}")
        if result.get("image_digest"):
            lines.append(f"  - `{result['image_digest']}`")
    elif result.get("commit_image"):
        lines.append(
            f"- Image: `{config.image_repo}:{result['commit_image']}` (commit tag only;"
            f" re-run to write `{config.image_tag}`)"
        )
    if result.get("chart"):
        lines.append(f"- Chart: `{config.chart_repo}:{result['chart']}`")
        if result.get("chart_digest"):
            lines.append(f"  - `{result['chart_digest']}`")
    if not any(result.get(key) for key in ("image", "commit_image", "chart")):
        lines.append("- Nothing was pushed.")
    with open(path, "a", encoding="utf-8") as summary:
        summary.write("\n".join(lines) + "\n")


def main() -> int:
    config = parse_args()
    result: dict[str, str] = {}
    try:
        ecr = Ecr(config.region)
        preflight(config, ecr)
        build_image_requested = image_needs_build(config, ecr, result)
        build_chart_requested = chart_needs_build(config, ecr)
        if config.mode == "preflight":
            return 0

        if build_image_requested:
            image_id = build_image(config, result)
            if config.mode == "publish":
                push_image(config, ecr, result, image_id)
        if build_chart_requested:
            chart, version = build_chart(config, result)
            if config.mode == "publish":
                push_chart(config, ecr, result, chart, version)
        return 0
    finally:
        write_summary(config, result)


if __name__ == "__main__":
   sys.exit(main())
