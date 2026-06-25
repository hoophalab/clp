/**
 * Builds the CloudFormation export name for a cluster-scoped value.
 *
 * @param clusterName Name used to scope all infrastructure for one environment.
 * @param exportName Specific cluster attribute to publish or consume.
 * @return Fully qualified export name.
 */
export const clusterExportName = function (
    clusterName: string,
    exportName: string,
): string {
    return `${clusterName}:${exportName}`;
};
