import type {
    ApiTokenStatus,
    DeploymentResponse,
} from "@cloud.yscope.com/server/contracts";
import {SearchIcon} from "lucide-react";

import {
    InputGroup,
    InputGroupAddon,
    InputGroupInput,
} from "~/components/ui/input-group";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "~/components/ui/select";
import {TOKEN_STATUS_BADGES} from "~/lib/api-tokens";


type ApiTokenFiltersProps = {
    deploymentId: string | null;
    deployments: readonly DeploymentResponse[];
    onDeploymentChange: (deploymentId: string | null) => void;
    onQueryChange: (query: string) => void;
    onStatusChange: (status: ApiTokenStatus | "all") => void;
    query: string;
    status: ApiTokenStatus | "all";
};

const ALL_DEPLOYMENTS = "all";

/**
 * Renders the token table's search, deployment, and status controls.
 *
 * @param props The filter values and change handlers.
 * @param props.deploymentId The selected deployment, or null for all of them.
 * @param props.deployments The deployments offered in the dropdown.
 * @param props.onDeploymentChange
 * @param props.onQueryChange
 * @param props.onStatusChange
 * @param props.query
 * @param props.status
 * @return The token table controls.
 */
const ApiTokenFilters = ({
    deploymentId,
    deployments,
    onDeploymentChange,
    onQueryChange,
    onStatusChange,
    query,
    status,
}: ApiTokenFiltersProps) => {
    const selectedDeployment = deployments.find(({_id}) => _id === deploymentId);

    return (
        <div className={"grid gap-3 xl:grid-cols-[minmax(18rem,1fr)_16rem_12rem]"}>
            <InputGroup>
                <InputGroupInput
                    aria-label={"Search tokens"}
                    placeholder={"Search tokens..."}
                    type={"search"}
                    value={query}
                    onChange={(event) => {
                        onQueryChange(event.target.value);
                    }}/>
                <InputGroupAddon>
                    <SearchIcon/>
                </InputGroupAddon>
            </InputGroup>
            <Select
                value={deploymentId ?? ALL_DEPLOYMENTS}
                onValueChange={(value) => {
                    if (null !== value) {
                        onDeploymentChange(ALL_DEPLOYMENTS === value ?
                            null :
                            value);
                    }
                }}
            >
                <SelectTrigger
                    aria-label={"Filter by deployment"}
                    className={"w-full"}
                >
                    <SelectValue>
                        {null === deploymentId ?
                            "All deployments" :
                            selectedDeployment?.spec.deployment_name ?? deploymentId}
                    </SelectValue>
                </SelectTrigger>
                <SelectContent>
                    <SelectGroup>
                        <SelectItem value={ALL_DEPLOYMENTS}>All deployments</SelectItem>
                        {deployments.map((deployment) => (
                            <SelectItem
                                key={deployment._id}
                                value={deployment._id}
                            >
                                {deployment.spec.deployment_name}
                            </SelectItem>
                        ))}
                    </SelectGroup>
                </SelectContent>
            </Select>
            <Select
                value={status}
                onValueChange={(value) => {
                    if (null !== value) {
                        onStatusChange(value);
                    }
                }}
            >
                <SelectTrigger
                    aria-label={"Filter by status"}
                    className={"w-full"}
                >
                    <SelectValue>
                        {"all" === status ?
                            "All statuses" :
                            TOKEN_STATUS_BADGES[status].label}
                    </SelectValue>
                </SelectTrigger>
                <SelectContent>
                    <SelectGroup>
                        <SelectItem value={"all"}>All statuses</SelectItem>
                        {Object.entries(TOKEN_STATUS_BADGES).map(([value, {label}]) => (
                            <SelectItem
                                key={value}
                                value={value}
                            >
                                {label}
                            </SelectItem>
                        ))}
                    </SelectGroup>
                </SelectContent>
            </Select>
        </div>
    );
};


export {ApiTokenFilters};
