import type {Deployment} from "~/lib/deployments";


// Temporary frontend fixtures until the deployment inventory API is connected.
const SAMPLE_DEPLOYMENTS = [
    {
        createdAt: "2025-05-15T10:24:00Z",
        id: "yscope-admin-ca-central-1",
        memoryGiB: 16,
        name: "yscope-admin-ca-central-1",
        provider: "AWS",
        region: "ca-central-1",
        status: "running",
        storageGiB: 100,
        vCpu: 4,
        version: "0.3.3-clap.41",
    },
    {
        createdAt: "2025-05-14T15:11:00Z",
        id: "7c9a9fc1e7f9d4a7e96af46",
        memoryGiB: 16,
        name: "test-deployment-2",
        provider: "AWS",
        region: "ca-central-1",
        status: "suspended",
        storageGiB: 50,
        vCpu: 4,
        version: "0.3.3-clap.41",
    },
    {
        createdAt: "2025-05-12T09:12:00Z",
        id: "01213b052ee8b522227",
        memoryGiB: 16,
        name: "testagain",
        provider: "AWS",
        region: "ca-central-1",
        status: "create-failed",
        storageGiB: 50,
        vCpu: 4,
        version: "0.3.3-clap.41",
    },
    {
        createdAt: "2025-05-12T11:03:00Z",
        id: "d4c2b8e7f3d048c9d72e1a5",
        memoryGiB: 16,
        name: "test-prod-eu-west-1",
        provider: "AWS",
        region: "eu-west-1",
        status: "running",
        storageGiB: 100,
        vCpu: 4,
        version: "0.3.3-clap.41",
    },
] as const satisfies readonly Deployment[];


export {SAMPLE_DEPLOYMENTS};
