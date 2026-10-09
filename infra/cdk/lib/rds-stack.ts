import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as cdk from "aws-cdk-lib/core";
import {NagSuppressions} from "cdk-nag";
import {Construct} from "constructs";

import {clusterExportName} from "./cluster-exports";
import {
    ClusterScopedStack,
    ClusterScopedStackProps,
} from "./cluster-scoped-stack";
import {getConsoleServerRoleArn} from "./iam-constants";


const DATABASE_BACKUP_DAYS = 7;
const DATABASE_NAME = "auth";
const DATABASE_PORT = 3307;
const DATABASE_ADMIN_USERNAME = "admin";

export interface RdsStackProps extends ClusterScopedStackProps {
    publicAccessCidrs?: readonly string[];
    vpc: ec2.IVpc;
}

export class RdsStack extends ClusterScopedStack {
    public readonly host: string;

    public readonly name = DATABASE_NAME;

    public readonly port = DATABASE_PORT;

    public readonly secret: secretsmanager.ISecret;

    public readonly securityGroup: ec2.ISecurityGroup;

    public readonly username = DATABASE_ADMIN_USERNAME;

    // eslint-disable-next-line max-lines-per-function
    constructor (scope: Construct, id: string, props: RdsStackProps) {
        super(scope, id, props);

        this.securityGroup = new ec2.SecurityGroup(this, "SecurityGroup", {
            description: "Access to the shared service database",
            vpc: props.vpc,
        });
        this.securityGroup.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

        for (const cidr of props.publicAccessCidrs ?? []) {
            this.securityGroup.addIngressRule(
                ec2.Peer.ipv4(cidr),
                ec2.Port.tcp(DATABASE_PORT),
                `Direct database access from ${cidr}`,
            );
        }

        const databaseSecret = new rds.DatabaseSecret(this, "DatabaseSecret", {
            excludeCharacters: ":;\\\"'",
            username: DATABASE_ADMIN_USERNAME,
        });

        databaseSecret.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
        databaseSecret.addToResourcePolicy(new iam.PolicyStatement({
            actions: ["secretsmanager:GetSecretValue"],
            principals: [new iam.ArnPrincipal(getConsoleServerRoleArn(this))],
            resources: ["*"],
        }));

        const database = new rds.DatabaseInstance(this, "Database", {
            allocatedStorage: 20,
            autoMinorVersionUpgrade: true,
            backupRetention: cdk.Duration.days(DATABASE_BACKUP_DAYS),
            credentials: rds.Credentials.fromSecret(databaseSecret),
            databaseName: DATABASE_NAME,
            deletionProtection: true,
            engine: rds.DatabaseInstanceEngine.mariaDb({
                version: rds.MariaDbEngineVersion.VER_11_8_6,
            }),
            instanceType: ec2.InstanceType.of(
                ec2.InstanceClass.BURSTABLE4_GRAVITON,
                ec2.InstanceSize.SMALL,
            ),
            maxAllocatedStorage: 100,
            multiAz: true,
            port: this.port,
            publiclyAccessible: true,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            securityGroups: [this.securityGroup],
            storageEncrypted: true,
            storageType: rds.StorageType.GP3,
            vpc: props.vpc,
            vpcSubnets: {subnetType: ec2.SubnetType.PUBLIC},
        });

        this.host = database.dbInstanceEndpointAddress;

        if ("undefined" === typeof database.secret) {
            throw new Error("Database credentials secret was not generated");
        }
        this.secret = database.secret;

        NagSuppressions.addResourceSuppressions(database, [{
            id: "AwsSolutions-RDS6",
            reason: "Services use generated credentials from Secrets Manager.",
        }]);
        NagSuppressions.addResourceSuppressionsByPath(
            this,
            `/${this.node.path}/DatabaseSecret/Resource`,
            [{
                id: "AwsSolutions-SMG4",
                reason: "Credential rotation requires coordinated service restarts.",
            }],
        );
        /* eslint-disable no-new */
        new cdk.CfnOutput(this, "SecretArn", {
            exportName: clusterExportName(props.clusterName, "DatabaseSecretArn"),
            value: this.secret.secretArn,
        });
        new cdk.CfnOutput(this, "SecurityGroupId", {
            exportName: clusterExportName(props.clusterName, "DatabaseSecurityGroupId"),
            value: this.securityGroup.securityGroupId,
        });
        /* eslint-enable no-new */
    }
}
