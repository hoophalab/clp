import {
    describe,
    expect,
    it,
} from "vitest";

import {
    buildS3PolicyCommand,
    buildS3PolicyStatement,
    validateS3Input,
} from "~/lib/s3-input";


const OVERLONG_UNICODE_LENGTH = 513;

describe("S3 input", () => {
    it("rejects URLs and shell syntax as bucket names", () => {
        for (const bucket of [
            "",
            "s3://logs",
            "logs;whoami",
            "logs$(id)",
            "a..b",
            "192.0.2.1",
        ]) {
            expect(
                validateS3Input({bucket: bucket, key: "logs/example.log"}).bucket,
            ).not.toBe("");
        }
        expect(
            validateS3Input({
                bucket: "application-logs",
                key: " logs/example.log ",
            }),
        ).toEqual({bucket: "", key: ""});
    });

    it("measures object keys in UTF-8 bytes", () => {
        expect(
            validateS3Input({bucket: "application-logs", key: ""}).key,
        ).not.toBe("");
        expect(
            validateS3Input({
                bucket: "application-logs",
                key: "é".repeat(OVERLONG_UNICODE_LENGTH),
            }).key,
        ).not.toBe("");
    });

    it("limits policy permissions to listing and reading the selected bucket", () => {
        const policy = buildS3PolicyStatement(
            "application-logs",
            "arn:aws:iam::123456789012:role/log-reader",
            "dep-1",
        );

        expect(JSON.parse(policy)).toMatchObject({
            Effect: "Allow",
            Principal: {AWS: "arn:aws:iam::123456789012:role/log-reader"},
            Action: ["s3:GetObject",
                "s3:ListBucket"],
            Resource: [
                "arn:aws:s3:::application-logs",
                "arn:aws:s3:::application-logs/*",
            ],
        });
        expect(() => buildS3PolicyStatement("x;id", "*", "dep-1")).toThrow();
        const command = buildS3PolicyCommand("application-logs", policy);
        expect(command).toContain("NoSuchBucketPolicy");
        expect(command).toContain("map(select(.Sid != $statement[0].Sid))");
        expect(command).toContain("mktemp -d");
    });
});
