import * as ecr from "aws-cdk-lib/aws-ecr";
import * as cdk from "aws-cdk-lib/core";
import {Construct} from "constructs";

import {clusterExportName} from "./cluster-exports";
import {
    ClusterScopedStack,
    ClusterScopedStackProps,
} from "./cluster-scoped-stack";


// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ClpRegistryStackProps extends ClusterScopedStackProps {}

export class ClpRegistryStack extends ClusterScopedStack {
    public readonly clpChartRepository: ecr.Repository;

    public readonly clpPackageRepository: ecr.Repository;

    constructor (scope: Construct, id: string, props: ClpRegistryStackProps) {
        super(scope, id, props);

        this.clpChartRepository = new ecr.Repository(this, "ClpChartRepository", {
            imageScanOnPush: true,
            imageTagMutability: ecr.TagMutability.IMMUTABLE,
            repositoryName: `${props.clusterName}/clp`,
        });

        // eslint-disable-next-line no-new
        new cdk.CfnOutput(this, "ClpRegistryChartRepositoryUrl", {
            exportName: clusterExportName(
                props.clusterName,
                "ClpRegistryChartRepositoryUrl",
            ),
            value: cdk.Fn.join("", [
                "oci://",
                this.clpChartRepository.repositoryUri,
            ]),
        });

        this.clpPackageRepository = new ecr.Repository(this, "ClpPackageRepository", {
            imageScanOnPush: true,
            imageTagMutability: ecr.TagMutability.IMMUTABLE,
            repositoryName: `${props.clusterName}/clp-package`,
        });

        // eslint-disable-next-line no-new
        new cdk.CfnOutput(this, "ClpRegistryPackageRepositoryUri", {
            exportName: clusterExportName(
                props.clusterName,
                "ClpRegistryPackageRepositoryUri",
            ),
            value: this.clpPackageRepository.repositoryUri,
        });
    }
}
