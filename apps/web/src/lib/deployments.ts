import type {DeploymentResponse} from "@cloud.yscope.com/server/contracts";


type DeploymentPhase = DeploymentResponse["status"]["phase"];

type DeploymentStatusLabel =
    "config-failed" |
    "create-failed" |
    "creating" |
    "delete-failed" |
    "deleted" |
    "deleting" |
    "resume-failed" |
    "running" |
    "suspend-failed" |
    "suspended" |
    "updating";

type DeploymentSort = "newest" | "oldest" | "name";

type DeploymentFilters = {
    query: string;
    region: string;
    sort: DeploymentSort;
    status: DeploymentStatusLabel | "all";
};

const STARTER_WORKER_COUNT = 4;

const PHASE_TO_STATUS_LABEL = {
    CONFIG_FAILED: "config-failed",
    CONFIG_REQUESTED: "updating",
    CONFIGURING: "updating",
    CREATE_FAILED: "create-failed",
    CREATE_REQUESTED: "creating",
    CREATING: "creating",
    DELETE_FAILED: "delete-failed",
    DELETE_REQUESTED: "deleting",
    DELETED: "deleted",
    DELETING: "deleting",
    RESUME_FAILED: "resume-failed",
    RESUME_REQUESTED: "updating",
    RESUMING: "updating",
    RUNNING: "running",
    SUSPEND_FAILED: "suspend-failed",
    SUSPEND_REQUESTED: "updating",
    SUSPENDED: "suspended",
    SUSPENDING: "updating",
} as const satisfies Record<DeploymentPhase, DeploymentStatusLabel>;

const STATUS_BADGES = {
    "config-failed": {label: "Failed to update", variant: "destructive"},
    "create-failed": {label: "Failed to create", variant: "destructive"},
    "creating": {label: "Creating", variant: "secondary"},
    "delete-failed": {label: "Failed to delete", variant: "destructive"},
    "deleted": {label: "Deleted", variant: "outline"},
    "deleting": {label: "Deleting", variant: "secondary"},
    "resume-failed": {label: "Failed to resume", variant: "destructive"},
    "running": {label: "Running", variant: "success"},
    "suspend-failed": {label: "Failed to suspend", variant: "destructive"},
    "suspended": {label: "Suspended", variant: "warning"},
    "updating": {label: "Updating", variant: "secondary"},
} as const satisfies Record<DeploymentStatusLabel, {label: string; variant: string}>;

/**
 * Gets the status label that corresponds to the given deployment's lifecycle phase.
 *
 * @param deployment
 * @return The corresponding label.
 */
const getDeploymentStatusLabel = (deployment: DeploymentResponse): DeploymentStatusLabel => (
    PHASE_TO_STATUS_LABEL[deployment.status.phase]
);

/**
 * Filters and orders deployments for the inventory view.
 *
 * @param deployments The deployments available to the current user.
 * @param filters The active search, facet, and sort values.
 * @return A new array containing the matching deployments in display order.
 */
const filterDeployments = (
    deployments: readonly DeploymentResponse[],
    filters: DeploymentFilters,
): DeploymentResponse[] => {
    const normalizedQuery = filters.query.trim().toLocaleLowerCase();
    const matchingDeployments = deployments.filter((deployment) => {
        const matchesQuery = "" === normalizedQuery || [
            deployment._id,
            deployment.spec.deployment_name,
            deployment.spec.region,
        ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
        const matchesRegion = "all" === filters.region ||
            deployment.spec.region === filters.region;
        const matchesStatus = "all" === filters.status ||
            getDeploymentStatusLabel(deployment) === filters.status;

        return matchesQuery && matchesRegion && matchesStatus;
    });

    return matchingDeployments.sort((left, right) => {
        if ("name" === filters.sort) {
            return left.spec.deployment_name.localeCompare(right.spec.deployment_name);
        }

        const createdComparison = Date.parse(right.metadata.created_at) -
            Date.parse(left.metadata.created_at);

        return "newest" === filters.sort ?
            createdComparison :
            -createdComparison;
    });
};


export {
    type DeploymentFilters,
    type DeploymentSort,
    type DeploymentStatusLabel,
    filterDeployments,
    getDeploymentStatusLabel,
    STARTER_WORKER_COUNT,
    STATUS_BADGES,
};
