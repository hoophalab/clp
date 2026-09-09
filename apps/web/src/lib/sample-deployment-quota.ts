import type {DeploymentQuota} from "~/lib/deployment-quota";


// Temporary frontend fixture until the account quota API is connected.
const SAMPLE_DEPLOYMENT_QUOTA = {
    limit: 10,
    mode: "trial",
    used: 9,
} satisfies DeploymentQuota;


export {SAMPLE_DEPLOYMENT_QUOTA};
