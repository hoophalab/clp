import type {ReactNode} from "react";

import type {DeploymentResponse} from "@cloud.yscope.com/server/contracts";
import {
    CalendarDaysIcon,
    CloudIcon,
    CpuIcon,
    type LucideIcon,
    MapPinIcon,
    ServerIcon,
} from "lucide-react";

import {Badge} from "~/components/ui/badge";
import {CardContent} from "~/components/ui/card";


const CREATED_AT_FORMATTER = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
});

type DeploymentDetailProps = {
    children: ReactNode;
    icon: LucideIcon;
    label: string;
};

/**
 * Renders one labeled deployment property.
 *
 * @param props The icon, label, and formatted value.
 * @param props.children
 * @param props.icon
 * @param props.label
 * @return A description-list entry for deployment metadata.
 */
const DeploymentDetail = ({
    children,
    icon: Icon,
    label,
}: DeploymentDetailProps) => {
    return (
        <div className={"flex min-w-0 flex-col gap-1"}>
            <dt className={"flex items-center gap-1.5 text-xs text-muted-foreground"}>
                <Icon className={"size-3.5"}/>
                {label}
            </dt>
            <dd className={"truncate font-medium"}>
                {children}
            </dd>
        </div>
    );
};

/**
 * Renders the provider, sizing, version, and creation metadata.
 *
 * @param props The deployment whose metadata is shown.
 * @param props.deployment
 * @return The card content description list.
 */
const DeploymentMetadata = ({deployment}: {deployment: DeploymentResponse}) => {
    return (
        <CardContent>
            <dl className={"grid gap-4 sm:grid-cols-2 lg:grid-cols-5"}>
                <DeploymentDetail
                    icon={CloudIcon}
                    label={"Provider"}
                >
                    {deployment.spec.cloud_provider.toUpperCase()}
                </DeploymentDetail>
                <DeploymentDetail
                    icon={MapPinIcon}
                    label={"Region"}
                >
                    {deployment.spec.region}
                </DeploymentDetail>
                <DeploymentDetail
                    icon={ServerIcon}
                    label={"Version"}
                >
                    <Badge variant={"secondary"}>
                        {deployment.spec.helm_chart_version}
                    </Badge>
                </DeploymentDetail>
                <DeploymentDetail
                    icon={CpuIcon}
                    label={"Compute"}
                >
                    {`${deployment.spec.num_compression_workers} compression · `}
                    {`${deployment.spec.num_search_workers} search workers`}
                </DeploymentDetail>
                <DeploymentDetail
                    icon={CalendarDaysIcon}
                    label={"Created"}
                >
                    {CREATED_AT_FORMATTER.format(new Date(deployment.metadata.created_at))}
                </DeploymentDetail>
            </dl>
        </CardContent>
    );
};


export {DeploymentMetadata};
