import * as cdk from "aws-cdk-lib/core";
import {Construct} from "constructs";


export interface ClusterScopedStackProps extends cdk.StackProps {
    clusterName: string;
}

export class ClusterScopedStack extends cdk.Stack {
    constructor (scope: Construct, id: string, props: ClusterScopedStackProps) {
        const clusterNameId = `${props.clusterName}-${id}`;
        super(scope, clusterNameId, props);
    }
}
