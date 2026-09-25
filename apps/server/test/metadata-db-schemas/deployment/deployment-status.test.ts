import {
    describe,
    expect,
    it,
} from "vitest";

import {
    DEPLOYMENT_PHASES,
    type DeploymentPhase,
    DeploymentStatusSchema,
} from "../../../src/metadata-db-schemas/index.js";


/**
 * Creates a valid deployment status with a timestamp for its current phase.
 *
 * @param phase The current deployment phase.
 * @return A valid deployment status.
 */
const createValidDeploymentStatus = (phase: DeploymentPhase) => ({
    phase: phase,
    phase_transition_records: {
        [phase]: new Date("2026-08-25T12:00:00.000Z"),
    },
    ...(
        "CONFIG_REQUESTED" === phase || "CONFIGURING" === phase || "CONFIG_FAILED" === phase ?
            {
                pending_update: {
                    requested_by: "requester-a",
                    spec_patch: {num_compression_workers: 8},
                },
            } :
            {}
    ),
});

describe.each(DEPLOYMENT_PHASES)("deployment phase %s", (phase) => {
    it("accepts a valid status with a phase-transition record for the current phase", () => {
        const status = createValidDeploymentStatus(phase);

        expect(DeploymentStatusSchema.parse(status)).toEqual(status);
    });

    it("rejects empty phase-transition records", () => {
        expect(DeploymentStatusSchema.safeParse({
            ...createValidDeploymentStatus(phase),
            phase_transition_records: {},
        }).success).toBe(false);
    });

    it("rejects a missing phase-transition record for the current phase", () => {
        const otherPhase = "CREATE_REQUESTED" === phase ?
            "DELETE_REQUESTED" :
            "CREATE_REQUESTED";

        expect(DeploymentStatusSchema.safeParse({
            ...createValidDeploymentStatus(phase),
            phase_transition_records: {
                [otherPhase]: new Date("2026-08-25T12:00:00.000Z"),
            },
        }).success).toBe(false);
    });
});

describe("timestamp ordering in phase-transition records", () => {
    it("accepts if the current phase's timestamp is tied for the latest timestamp", () => {
        const status = {
            ...createValidDeploymentStatus("SUSPEND_REQUESTED"),
            phase_transition_records: {
                SUSPEND_REQUESTED: new Date("2026-08-25T12:00:00.000Z"),
                RUNNING: new Date("2026-08-25T12:00:00.000Z"),
            },
        };

        expect(DeploymentStatusSchema.parse(status)).toEqual(status);
    });

    it("rejects if the current phase's timestamp is older than another phase's timestamp", () => {
        expect(DeploymentStatusSchema.safeParse({
            ...createValidDeploymentStatus("SUSPEND_REQUESTED"),
            phase_transition_records: {
                RUNNING: new Date("2026-08-25T12:01:00.000Z"),
                SUSPEND_REQUESTED: new Date("2026-08-25T12:00:00.000Z"),
            },
        }).success).toBe(false);
    });
});

describe("deployment status fields validation", () => {
    it("rejects an invalid Date for the timestamp", () => {
        expect(DeploymentStatusSchema.safeParse({
            ...createValidDeploymentStatus("DELETE_REQUESTED"),
            phase_transition_records: {DELETE_REQUESTED: new Date(Number.NaN)},
        }).success).toBe(false);
    });

    it("rejects an unknown phase", () => {
        expect(DeploymentStatusSchema.safeParse({
            ...createValidDeploymentStatus("DELETE_REQUESTED"),
            phase: "UNKNOWN_PHASE",
        }).success).toBe(false);
    });

    it("rejects a missing phase_transition_records field", () => {
        const status = createValidDeploymentStatus("DELETE_REQUESTED");
        Reflect.deleteProperty(status, "phase_transition_records");

        expect(DeploymentStatusSchema.safeParse(status).success).toBe(false);
    });
});
