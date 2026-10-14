# Publishing CLP to ECR

`clp-oss-release.yaml` builds a CLP package image and Helm chart at an exact commit and pushes both to a cluster's ECR. It is dispatched manually. The build runs inside CLP's published dependency image, so a runner needs Docker, Git and Python and nothing else, and credentials come from OIDC, not a stored secret.

Its `plan` job resolves the source ref to a commit and `arch` to a set of architectures. Then one `publish` job per architecture builds and pushes the image, a separate light `chart` job packages and pushes the chart (which needs no compilation), and `clp-oss-release-manifest.yaml` joins the image tags into one index. The build itself is handled by `.github/scripts/clp-oss-release/publish_clp_package.py`, with configuration passed as command-line arguments.

## Running it

```bash
# The cluster's role, from its Ecr stack's EcrGithubActionsRoleArn output.
role=arn:aws:iam::<account>:role/<cluster>-Ecr-GithubActionsRole...

# Preflight: commit, runner, checkout and registry access. Publishes nothing.
gh workflow run clp-oss-release.yaml --ref main -f cluster=yscope3 -f aws_role_arn="$role"

# Publish a release for both architectures.
gh workflow run clp-oss-release.yaml --ref main \
  -f cluster=yscope3 -f aws_role_arn="$role" -f mode=publish -f arch=both \
  -f source_ref=v0.5.0 -f clp_package_version=0.5.0
```

The dispatch form describes every input. Three take a decision: `mode` is a ladder (`build` does everything `preflight` does and then builds, `publish` then pushes) and defaults to `preflight` because the rest cost around 30 minutes on one of only two arm64 runners; `arch` is `arm64`, `amd64` or `both`; `components` narrows a run to the image or the chart alone.

The run summary records the commit, the chart version, the digests assigned, and the dependency image resolved to a digest; pass that digest back as `deps_image_ref` to rebuild in the same environment. Validation errors and failed build commands are reported directly in the job log.

## What gets published

Publishing `0.5.0` from `y-scope/clp@155fbdad` to `yscope3` with `arch=both` leaves seven tags under `<account>.dkr.ecr.<region>.amazonaws.com/`, the account read from the role actually assumed:

```
yscope3/clp-package:0.5.0            manifest list over the two images
yscope3/clp-package:155fbdad…        same list, addressed by commit
yscope3/clp-package:0.5.0-arm64      image
yscope3/clp-package:0.5.0-amd64      image
yscope3/clp-package:155fbdad…-arm64  same digest as 0.5.0-arm64
yscope3/clp-package:155fbdad…-amd64  same digest as 0.5.0-amd64
yscope3/clp:0.4.1-dev.4              chart, at the source's own version
```

A deployment can pin the release or the commit, and both resolve to the same index; a single-architecture run publishes an index of one, so `0.5.0` always means the same thing.

The chart is the one to watch: its version is the source commit's own, so it does not follow `clp_package_version`. Nothing else is written: no `latest`, no floating tag, and every tag is immutable.

## Finishing an interrupted publish

Re-run the same command. Before building, a publish drops whatever is already there: the image when the version tag and this commit's provenance tag resolve to the same digest, the chart when its version exists, and each index tag that is taken. A version tag built from a *different* commit fails the run rather than quietly leaving the old image in place.

That is also what makes promotion cheap: a commit that already shipped as `0.5.0-rc1` is copied to `0.5.0`, same digest and no layer moved, and the summary marks it *reused, not rebuilt*. A job left with nothing to publish exits in seconds, so re-running `arch=both` builds only what is missing.

## Configuration

Nothing per cluster is stored in this repository. `cluster` is required on the dispatch line and names the ECR namespace, so a staging publish cannot disturb a production tag. `aws_region` defaults to `us-west-1`.

The role is required too: `aws_role_arn` is one role per cluster, and each cluster's Ecr stack exports the ARN as `EcrGithubActionsRoleArn`, the same pattern that the auth server's image workflow uses, so nothing here goes stale when clusters come and go.

The Ecr stack's role already carries the needed grants; a role provisioned outside that stack needs pull as well as push, since every mode reads the registry before building. A preflight cannot tell the two apart: the probe it makes is a read-tier action, so a pull-only role passes it and then fails at the push.

The trust policy accepts workflows on `main` and `image/*` branches, so test runs come from an `image/…` branch.

Runners come from the `GH_RUNNER_LINUX_*` repository variables: heavy per architecture for the builds, light for `plan`, the chart and the manifest. They are required and have no fallback, so a missing or wrong value means that the job never runs.

A private source needs a `SOURCE_READ_TOKEN` secret with read access, used for both the ref lookup and the checkout, falling back to the default token when unset.

## Known limitations

* The build sees the publishing credentials: OIDC is established before the script runs, and the build executes code from whichever commit was named. Do not publish a `source_ref` that you would not run on the runner.
* A publish is not atomic. Image and chart are pushed independently with no rollback; re-running is the recovery path.
* An existing chart version is skipped, and that skip cannot be told apart from a genuine re-release under an unchanged version.
* No approval gate. The roles trust branches, not GitHub environments, so environment protection rules cannot gate a publish; adding that means teaching each cluster's role the `environment:` OIDC subject and adding `environment:` to the publishing jobs.
