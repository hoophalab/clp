import {
    type DeploymentResponse,
    TOKEN_CREATION_BLOCKED_PHASES,
} from "@cloud.yscope.com/server/contracts";

import {Badge} from "~/components/ui/badge";
import {
    Field,
    FieldDescription,
    FieldError,
    FieldLabel,
} from "~/components/ui/field";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "~/components/ui/select";
import {
    getDeploymentStatusLabel,
    STATUS_BADGES,
} from "~/lib/deployments";


type DeploymentPhase = DeploymentResponse["status"]["phase"];

const BLOCKED_PHASE_REASONS: Partial<Record<DeploymentPhase, string>> = {
    CREATE_FAILED: "This deployment failed to create",
    CREATE_REQUESTED: "Available once the deployment is running",
    CREATING: "Available once the deployment is running",
    DELETE_FAILED: "This deployment is being deleted",
    DELETE_REQUESTED: "This deployment is being deleted",
    DELETED: "This deployment has been deleted",
    DELETING: "This deployment is being deleted",
};

/**
 * Explains why the server would refuse a new token on a deployment.
 *
 * @param deployment
 * @return The reason, or null when a token can be created.
 */
const getTokenCreationBlocker = (deployment: DeploymentResponse): string | null => {
    const {phase} = deployment.status;

    return TOKEN_CREATION_BLOCKED_PHASES.has(phase) ?
        BLOCKED_PHASE_REASONS[phase] ?? "Tokens cannot be created on this deployment right now" :
        null;
};

type TokenDeploymentFieldProps = {

    /** The deployments to offer, or null while they load. */
    deployments: readonly DeploymentResponse[] | null;

    /** A message to show under the field, on top of any phase reason. */
    error: string | null;
    onChange: (deploymentId: string | null) => void;

    /** The selected deployment, or null for none. */
    selected: DeploymentResponse | null;
    value: string | null;
};

/**
 * Renders one deployment in the picker, with its status and, when a token
 * cannot be created on it, the reason.
 *
 * @param props
 * @param props.deployment
 * @return The picker option.
 */
const DeploymentOption = ({deployment}: {deployment: DeploymentResponse}) => {
    const badge = STATUS_BADGES[getDeploymentStatusLabel(deployment)];
    const blocker = getTokenCreationBlocker(deployment);

    return (
        <SelectItem
            disabled={null !== blocker}
            value={deployment._id}
        >
            <div className={"flex flex-col gap-0.5"}>
                <span className={"flex items-center gap-2"}>
                    {deployment.spec.deployment_name}
                    <Badge variant={badge.variant}>
                        {badge.label}
                    </Badge>
                </span>
                <span className={"text-xs text-muted-foreground"}>
                    {`${deployment._id} · ${deployment.spec.region}`}
                    {null === blocker ?
                        null :
                        ` · ${blocker}`}
                </span>
            </div>
        </SelectItem>
    );
};

/**
 * Renders the deployment picker of the create-token form.
 *
 * @param props
 * @param props.deployments
 * @param props.error
 * @param props.onChange
 * @param props.selected
 * @param props.value
 * @return The labeled picker with its messages.
 */
const TokenDeploymentField = ({
    deployments,
    error,
    onChange,
    selected,
    value,
}: TokenDeploymentFieldProps) => {
    const blocker = null === selected ?
        null :
        getTokenCreationBlocker(selected);

    return (
        <Field data-invalid={null !== blocker || null !== error}>
            <FieldLabel htmlFor={"token-deployment"}>Deployment</FieldLabel>
            <Select
                value={value}
                onValueChange={onChange}
            >
                <SelectTrigger
                    className={"w-full"}
                    id={"token-deployment"}
                >
                    <SelectValue placeholder={"Choose a deployment"}>
                        {null === selected ?
                            value :
                            selected.spec.deployment_name}
                    </SelectValue>
                </SelectTrigger>
                <SelectContent>
                    <SelectGroup>
                        {(deployments ?? []).map((deployment) => (
                            <DeploymentOption
                                deployment={deployment}
                                key={deployment._id}/>
                        ))}
                    </SelectGroup>
                </SelectContent>
            </Select>
            {null === deployments ?
                <FieldDescription>Loading deployments...</FieldDescription> :
                null}
            {null === blocker ?
                null :
                <FieldError>
                    {blocker}
                </FieldError>}
            {null === error ?
                null :
                <FieldError>
                    {error}
                </FieldError>}
        </Field>
    );
};


export {TokenDeploymentField};
