import {spawnSync} from "node:child_process";
import {
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

import {
    describe,
    expect,
    it,
} from "vitest";

import {
    buildS3PolicyCommand,
    buildS3PolicyStatement,
} from "~/lib/s3-input";


/**
 * Runs the generated command with an isolated AWS CLI fake and no AWS credentials.
 *
 * @param existing An existing bucket policy, or null for NoSuchBucketPolicy.
 * @param failure Whether AWS should reject reading the existing policy.
 * @return The command status and resulting policy.
 */
const runCommand = (existing: unknown, failure = false) => {
    const dir = mkdtempSync(join(tmpdir(), "yscope-policy-test-"));
    try {
        writeFileSync(join(dir, "existing.json"), JSON.stringify(existing));
        writeFileSync(join(dir, "aws"), `#!/bin/sh
if [ "$2" = get-bucket-policy ]; then
  if [ "$POLICY_FAILURE" = true ]; then echo AccessDenied >&2; exit 1; fi
  if [ "$POLICY_MISSING" = true ]; then echo NoSuchBucketPolicy >&2; exit 1; fi
  cat "$POLICY_DIR/existing.json"
else
  for arg in "$@"; do
    case "$arg" in file://*) cp "\${arg#file://}" "$POLICY_DIR/result.json";; esac
  done
fi
`, {mode: 0o700});
        const statement = buildS3PolicyStatement(
            "application-logs",
            "arn:aws:iam::123456789012:role/reader",
            "dep-1",
        );
        const result = spawnSync("/bin/sh", ["-c",
            buildS3PolicyCommand("application-logs", statement)], {
            encoding: "utf8",
            env: {PATH: `${dir}:/usr/bin:/bin`,
                POLICY_DIR: dir,
                POLICY_FAILURE: String(failure),
                POLICY_MISSING: String(null === existing)},
        });

        return {status: result.status,
            stderr: result.stderr,
            policy: 0 === result.status ?
                JSON.parse(readFileSync(join(dir, "result.json"), "utf8")) as unknown :
                null};
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
};

// This suite executes a POSIX shell snippet and needs jq, just like the displayed command.
const hasShellAndJq = 0 === spawnSync("/bin/sh", ["-c",
    "command -v jq"]).status;

describe.skipIf(!hasShellAndJq)("Generated S3 policy command", () => {
    it("preserves unrelated statements and replaces only its own Sid on repeated runs", () => {
        const unrelated = {Sid: "KeepMe", Effect: "Deny", Action: "s3:DeleteObject", Resource: "*"};
        const first = runCommand({Version: "2012-10-17", Statement: unrelated});
        expect(first.status).toBe(0);
        expect(first.policy).toMatchObject({Statement: [unrelated,
            {Effect: "Allow"}]});
        const again = runCommand(first.policy);
        expect(again.status).toBe(0);
        expect(again.policy).toEqual(first.policy);
    });

    it("creates a policy only when the existing policy is absent", () => {
        expect(runCommand(null).status).toBe(0);
        const denied = runCommand(null, true);
        expect(denied.status).not.toBe(0);
        expect(denied.stderr).toContain("AccessDenied");
        expect(denied.policy).toBeNull();
    });
});
