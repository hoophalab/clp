type DeploymentStatus = "running" | "suspended" | "create-failed";

type Deployment = {
    createdAt: string;
    id: string;
    memoryGiB: number;
    name: string;
    provider: "AWS";
    region: string;
    status: DeploymentStatus;
    storageGiB: number;
    vCpu: number;
    version: string;
};

type DeploymentSort = "newest" | "oldest" | "name";

type DeploymentFilters = {
    query: string;
    region: string;
    sort: DeploymentSort;
    status: DeploymentStatus | "all";
};

/**
 * Filters and orders deployments for the inventory view.
 *
 * @param deployments The deployments available to the current user.
 * @param filters The active search, facet, and sort values.
 * @return A new array containing the matching deployments in display order.
 */
const filterDeployments = (
    deployments: readonly Deployment[],
    filters: DeploymentFilters,
): Deployment[] => {
    const normalizedQuery = filters.query.trim().toLocaleLowerCase();
    const matchingDeployments = deployments.filter((deployment) => {
        const matchesQuery = "" === normalizedQuery || [
            deployment.id,
            deployment.name,
            deployment.region,
        ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
        const matchesRegion = "all" === filters.region ||
            deployment.region === filters.region;
        const matchesStatus = "all" === filters.status ||
            deployment.status === filters.status;

        return matchesQuery && matchesRegion && matchesStatus;
    });

    return matchingDeployments.sort((left, right) => {
        if ("name" === filters.sort) {
            return left.name.localeCompare(right.name);
        }

        const createdComparison = Date.parse(right.createdAt) - Date.parse(left.createdAt);

        return "newest" === filters.sort ?
            createdComparison :
            -createdComparison;
    });
};


export {
    type Deployment,
    type DeploymentFilters,
    type DeploymentSort,
    type DeploymentStatus,
    filterDeployments,
};
