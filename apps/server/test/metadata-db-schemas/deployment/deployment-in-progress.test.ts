import {
    describe,
    expect,
    it,
} from "vitest";

import {
    DeploymentDocumentSchema,
    type InProgressDeploymentPhase,
    InProgressDeploymentPhaseSchema,
} from "../../../src/metadata-db-schemas/index.js";


/* eslint-disable jsdoc/informative-docs */
/**
 * Creates a deployment document in the specified in-progress phase.
 *
 * @param phase The in-progress phase.
 * @return The created deployment document.
 */
const createInProgressDeploymentDocument = (phase: InProgressDeploymentPhase) => ({
    _id: "deployment-id",
    metadata: {
        created_at: new Date("2026-08-25T11:00:00.000Z"),
        email: "owner@example.com",
        org_id: null,
        owner_id: "owner-a",
    },
    spec: {
        cloud_provider: "aws",
        clp_image_tag: "1.2.3",
        cluster_id: "default",
        deployment_name: "valid-deployment",
        helm_chart_version: "1.2.3",
        num_compression_workers: 4,
        num_search_workers: 8,
        region: "ca-central-1",
    },
    status: {
        phase: phase,
        phase_transition_records: {
            [phase]: new Date("2026-08-25T12:00:00.000Z"),
        },
        ...(
            "CONFIGURING" === phase ?
                {
                    pending_update: {
                        requested_by: "requester-a",
                        spec_patch: {num_compression_workers: 8},
                    },
                } :
                {}
        ),
    },
});
/* eslint-enable jsdoc/informative-docs */

describe("in-progress deployments", () => {
    it.each(InProgressDeploymentPhaseSchema.options)(
        "accepts a valid %s deployment document",
        (phase) => {
            const deployment = createInProgressDeploymentDocument(phase);

            expect(DeploymentDocumentSchema.parse(deployment)).toEqual(deployment);
        },
    );

    it("rejects CONFIGURING without a pending update", () => {
        const deployment = createInProgressDeploymentDocument("CONFIGURING");
        Reflect.deleteProperty(deployment.status, "pending_update");

        expect(DeploymentDocumentSchema.safeParse(deployment).success).toBe(false);
    });

    it.each([
        {
            description: "an empty specification patch",
            specPatch: {},
        },
        {
            description: "an invalid specification patch",
            specPatch: {num_compression_workers: 0},
        },
    ])("rejects CONFIGURING with $description", ({specPatch}) => {
        const deployment = createInProgressDeploymentDocument("CONFIGURING");

        expect(DeploymentDocumentSchema.safeParse({
            ...deployment,
            status: {
                ...deployment.status,
                pending_update: {
                    requested_by: "requester-a",
                    spec_patch: specPatch,
                },
            },
        }).success).toBe(false);
    });

    it.each(InProgressDeploymentPhaseSchema.options.filter((phase) => "CONFIGURING" !== phase))(
        "rejects %s with a pending update",
        (phase) => {
            const deployment = createInProgressDeploymentDocument(phase);

            expect(DeploymentDocumentSchema.safeParse({
                ...deployment,
                status: {
                    ...deployment.status,
                    pending_update: {
                        requested_by: "requester-a",
                        spec_patch: {num_compression_workers: 8},
                    },
                },
            }).success).toBe(false);
        },
    );
});
