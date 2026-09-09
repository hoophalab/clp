import {
    CopyIcon,
    ExternalLinkIcon,
    MoreHorizontalIcon,
    PlayIcon,
    RefreshCwIcon,
    ServerIcon,
    Settings2Icon,
} from "lucide-react";

import {DeploymentMetadata} from "~/components/deployment-metadata";
import {Badge} from "~/components/ui/badge";
import {Button} from "~/components/ui/button";
import {
    Card,
    CardAction,
    CardDescription,
    CardHeader,
    CardTitle,
} from "~/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import type {Deployment} from "~/lib/deployments";
import {cn} from "~/lib/utils";


const STATUS_BADGES = {
    "create-failed": {
        label: "Create failed",
        variant: "destructive",
    },
    "running": {
        label: "Running",
        variant: "success",
    },
    "suspended": {
        label: "Suspended",
        variant: "warning",
    },
} as const;

/**
 * Copies text without allowing clipboard failures to escape an event handler.
 *
 * @param value The text to copy.
 */
const copyText = (value: string): void => {
    if ("undefined" === typeof navigator.clipboard) {
        return;
    }

    try {
        navigator.clipboard.writeText(value).catch(() => {
            // Clipboard permission can be denied after the request starts.
        });
    } catch {
        // Leave the inventory usable when clipboard access is unavailable.
    }
};

/**
 * Selects the primary action for a deployment lifecycle state.
 *
 * @param props The deployment that owns the action.
 * @param props.deployment
 * @return The status-appropriate deployment action.
 */
const DeploymentAction = ({deployment}: {deployment: Deployment}) => {
    if ("running" === deployment.status) {
        return (
            <Button
                type={"button"}
                variant={"success"}
            >
                <ExternalLinkIcon data-icon={"inline-start"}/>
                Open
            </Button>
        );
    }

    if ("suspended" === deployment.status) {
        return (
            <Button
                type={"button"}
                variant={"outline"}
            >
                <PlayIcon data-icon={"inline-start"}/>
                Wake Up
            </Button>
        );
    }

    return (
        <Button
            type={"button"}
            variant={"outline"}
        >
            <RefreshCwIcon data-icon={"inline-start"}/>
            Retry
        </Button>
    );
};

type DeploymentCardHeaderProps = {
    deployment: Deployment;
    titleId: string;
};

/**
 * Renders deployment identity, state, and card actions.
 *
 * @param props The deployment and accessible title identifier.
 * @param props.deployment
 * @param props.titleId
 * @return The composed card header.
 */
const DeploymentCardHeader = ({
    deployment,
    titleId,
}: DeploymentCardHeaderProps) => {
    const badge = STATUS_BADGES[deployment.status];

    return (
        <CardHeader
            className={cn(
                "has-data-[slot=card-action]:grid-cols-1",
                "sm:has-data-[slot=card-action]:grid-cols-[1fr_auto]",
            )}
        >
            <div
                aria-label={`${deployment.name} identity`}
                className={"flex min-w-0 items-center gap-3"}
                role={"group"}
            >
                <div
                    className={cn(
                        "grid size-10 shrink-0 place-items-center rounded-lg",
                        "bg-muted text-muted-foreground",
                    )}
                >
                    <ServerIcon className={"size-5"}/>
                </div>
                <div className={"flex min-w-0 flex-col"}>
                    <CardTitle>
                        <div className={"flex min-w-0 flex-wrap items-center gap-2"}>
                            <span
                                className={"truncate"}
                                id={titleId}
                            >
                                {deployment.name}
                            </span>
                            <Badge variant={badge.variant}>
                                {badge.label}
                            </Badge>
                        </div>
                    </CardTitle>
                    <CardDescription className={"flex min-w-0 items-center gap-2"}>
                        <span>ID</span>
                        <span className={"truncate"}>
                            {deployment.id}
                        </span>
                        <Button
                            aria-label={`Copy ${deployment.name} ID`}
                            size={"icon-xs"}
                            type={"button"}
                            variant={"ghost"}
                            onClick={() => {
                                copyText(deployment.id);
                            }}
                        >
                            <CopyIcon/>
                        </Button>
                    </CardDescription>
                </div>
            </div>
            <CardAction
                className={cn(
                    "col-start-1 row-start-auto flex items-center gap-2 self-center",
                    "justify-self-start",
                    "sm:col-start-2 sm:row-start-1 sm:justify-self-end",
                )}
            >
                <DeploymentAction deployment={deployment}/>
                <DropdownMenu>
                    <DropdownMenuTrigger
                        render={
                            <Button
                                aria-label={`More actions for ${deployment.name}`}
                                size={"icon"}
                                type={"button"}
                                variant={"outline"}/>
                        }
                    >
                        <MoreHorizontalIcon/>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align={"end"}>
                        <DropdownMenuGroup>
                            <DropdownMenuItem>
                                <Settings2Icon/>
                                View details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => {
                                    copyText(deployment.id);
                                }}
                            >
                                <CopyIcon/>
                                Copy deployment ID
                            </DropdownMenuItem>
                        </DropdownMenuGroup>
                    </DropdownMenuContent>
                </DropdownMenu>
            </CardAction>
        </CardHeader>
    );
};

/**
 * Renders one deployment and its status-dependent actions.
 *
 * @param props The deployment to present.
 * @param props.deployment
 * @return A responsive deployment summary card.
 */
const DeploymentCard = ({deployment}: {deployment: Deployment}) => {
    const titleId = `deployment-${deployment.id}`;

    return (
        <Card
            aria-labelledby={titleId}
            role={"article"}
            size={"sm"}
        >
            <DeploymentCardHeader
                deployment={deployment}
                titleId={titleId}/>
            <DeploymentMetadata deployment={deployment}/>
        </Card>
    );
};


export {DeploymentCard};
