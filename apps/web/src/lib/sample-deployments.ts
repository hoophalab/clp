import type {DeploymentResponse} from "@cloud.yscope.com/server/contracts";


const CREATED_AT = "2026-09-22T12:00:00.000Z";

/**
 * Builds a deployment shaped like one returned by the list endpoint.
 *
 * @param id
 * @param name
 * @param region
 * @param phase
 * @return The deployment fixture.
 */
const createSampleDeployment = (
    id: string,
    name: string,
    region: string,
    phase: DeploymentResponse["status"]["phase"],
): DeploymentResponse => ({
    _id: id,
    metadata: {
        created_at: CREATED_AT,
        email: "member@example.com",
        org_id: null,
        owner_id: "member-user",
    },
    spec: {
        cloud_provider: "aws",
        clp_image_tag: "0.5.0",
        cluster_id: "default",
        deployment_name: name,
        helm_chart_version: "0.4.1",
        num_compression_workers: 4,
        num_search_workers: 4,
        region: region,
    },
    status: {
        phase: phase,
        phase_transition_records: {[phase]: CREATED_AT},
        ...("RUNNING" === phase ?
            {public_url: `https://${name}.example.com`} :
            {}),
    },
});

// Frontend fixtures for component tests.
const SAMPLE_DEPLOYMENTS = [
    createSampleDeployment("7c9a9fc1", "logs-running", "ca-central-1", "RUNNING"),
    createSampleDeployment("d4c2b8e7", "logs-suspended", "ca-central-1", "SUSPENDED"),
    createSampleDeployment("01213b05", "logs-failed", "ca-central-1", "CREATE_FAILED"),
    createSampleDeployment("a1b2c3d4", "logs-creating", "eu-west-1", "CREATE_REQUESTED"),
];


export {SAMPLE_DEPLOYMENTS};
