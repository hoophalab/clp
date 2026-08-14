import * as iam from "aws-cdk-lib/aws-iam";
import * as cdk from "aws-cdk-lib/core";
import {Construct} from "constructs";


export class IamStack extends cdk.Stack {
    constructor (scope: Construct, id: string, props: cdk.StackProps) {
        super(scope, id, props);

        // eslint-disable-next-line no-new
        new iam.OidcProviderNative(this, "GithubOidcProvider", {
            clientIds: ["sts.amazonaws.com"],
            url: "https://token.actions.githubusercontent.com",
        });
    }
}
