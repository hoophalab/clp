type DeploymentAction = "config" |
    "create" |
    "delete" |
    "resume" |
    "suspend";

type DeploymentId = string;

type RequestId = string;

type TenantId = string;

type DeploymentRequest = Readonly<{
    action: DeploymentAction;
    deploymentId: DeploymentId;
    requestId: RequestId;
    requestedAt: Date;
    tenantId: TenantId;
}>;

export {
    type DeploymentAction,
    type DeploymentId,
    type DeploymentRequest,
    type RequestId,
    type TenantId,
};
