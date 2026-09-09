import type {ReactNode} from "react";

import {
    CalendarDaysIcon,
    CloudIcon,
    CpuIcon,
    DatabaseIcon,
    type LucideIcon,
    MapPinIcon,
    ServerIcon,
} from "lucide-react";

import {Badge} from "~/components/ui/badge";
import {CardContent} from "~/components/ui/card";
import type {Deployment} from "~/lib/deployments";


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
const DeploymentMetadata = ({deployment}: {deployment: Deployment}) => {
    return (
        <CardContent>
            <dl className={"grid gap-4 sm:grid-cols-2 lg:grid-cols-6"}>
                <DeploymentDetail
                    icon={CloudIcon}
                    label={"Provider"}
                >
                    {deployment.provider}
                </DeploymentDetail>
                <DeploymentDetail
                    icon={MapPinIcon}
                    label={"Region"}
                >
                    {deployment.region}
                </DeploymentDetail>
                <DeploymentDetail
                    icon={ServerIcon}
                    label={"Version"}
                >
                    <Badge variant={"secondary"}>
                        {deployment.version}
                    </Badge>
                </DeploymentDetail>
                <DeploymentDetail
                    icon={CpuIcon}
                    label={"Compute"}
                >
                    {deployment.vCpu}
                    {" "}
                    vCPU ·
                    {deployment.memoryGiB}
                    {" "}
                    GiB RAM
                </DeploymentDetail>
                <DeploymentDetail
                    icon={DatabaseIcon}
                    label={"Storage"}
                >
                    {deployment.storageGiB}
                    {" "}
                    GiB
                </DeploymentDetail>
                <DeploymentDetail
                    icon={CalendarDaysIcon}
                    label={"Created"}
                >
                    {CREATED_AT_FORMATTER.format(new Date(deployment.createdAt))}
                </DeploymentDetail>
            </dl>
        </CardContent>
    );
};


export {DeploymentMetadata};
