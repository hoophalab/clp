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
import type {
    DeploymentSort,
    DeploymentStatus,
} from "~/lib/deployments";


type DeploymentFiltersProps = {
    onQueryChange: (query: string) => void;
    onRegionChange: (region: string) => void;
    onSortChange: (sort: DeploymentSort) => void;
    onStatusChange: (status: DeploymentStatus | "all") => void;
    query: string;
    region: string;
    regions: readonly string[];
    sort: DeploymentSort;
    status: DeploymentStatus | "all";
};

const STATUS_LABELS: Record<DeploymentStatus | "all", string> = {
    "all": "All Status",
    "create-failed": "Create failed",
    "running": "Running",
    "suspended": "Suspended",
};

const SORT_LABELS: Record<DeploymentSort, string> = {
    name: "Sort: Name",
    newest: "Sort: Recently Created",
    oldest: "Sort: Oldest Created",
};

/**
 * Renders inventory search, facet, and ordering controls.
 *
 * @param props The filter values and change handlers.
 * @param props.onQueryChange
 * @param props.onRegionChange
 * @param props.onSortChange
 * @param props.onStatusChange
 * @param props.query
 * @param props.region
 * @param props.regions
 * @param props.sort
 * @param props.status
 * @return The deployment inventory controls.
 */
const DeploymentFilters = ({
    onQueryChange,
    onRegionChange,
    onSortChange,
    onStatusChange,
    query,
    region,
    regions,
    sort,
    status,
}: DeploymentFiltersProps) => {
    return (
        <div className={"grid gap-3 lg:grid-cols-[minmax(18rem,1fr)_12rem_12rem_14rem]"}>
            <InputGroup className={"h-11"}>
                <InputGroupInput
                    aria-label={"Search deployments"}
                    placeholder={"Search deployments..."}
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
                value={status}
                onValueChange={(value) => {
                    if (null !== value) {
                        onStatusChange(value);
                    }
                }}
            >
                <SelectTrigger
                    aria-label={"Filter by status"}
                    className={"h-11 w-full"}
                >
                    <SelectValue>
                        {STATUS_LABELS[status]}
                    </SelectValue>
                </SelectTrigger>
                <SelectContent>
                    <SelectGroup>
                        <SelectItem value={"all"}>All Status</SelectItem>
                        <SelectItem value={"running"}>Running</SelectItem>
                        <SelectItem value={"suspended"}>Suspended</SelectItem>
                        <SelectItem value={"create-failed"}>Create failed</SelectItem>
                    </SelectGroup>
                </SelectContent>
            </Select>
            <Select
                value={region}
                onValueChange={(value) => {
                    if (null !== value) {
                        onRegionChange(value);
                    }
                }}
            >
                <SelectTrigger
                    aria-label={"Filter by region"}
                    className={"h-11 w-full"}
                >
                    <SelectValue>
                        {"all" === region ?
                            "All Regions" :
                            region}
                    </SelectValue>
                </SelectTrigger>
                <SelectContent>
                    <SelectGroup>
                        <SelectItem value={"all"}>All Regions</SelectItem>
                        {regions.map((regionName) => (
                            <SelectItem
                                key={regionName}
                                value={regionName}
                            >
                                {regionName}
                            </SelectItem>
                        ))}
                    </SelectGroup>
                </SelectContent>
            </Select>
            <Select
                value={sort}
                onValueChange={(value) => {
                    if (null !== value) {
                        onSortChange(value);
                    }
                }}
            >
                <SelectTrigger
                    aria-label={"Sort deployments"}
                    className={"h-11 w-full"}
                >
                    <SelectValue>
                        {SORT_LABELS[sort]}
                    </SelectValue>
                </SelectTrigger>
                <SelectContent>
                    <SelectGroup>
                        <SelectItem value={"newest"}>Sort: Recently Created</SelectItem>
                        <SelectItem value={"oldest"}>Sort: Oldest Created</SelectItem>
                        <SelectItem value={"name"}>Sort: Name</SelectItem>
                    </SelectGroup>
                </SelectContent>
            </Select>
        </div>
    );
};


export {DeploymentFilters};
