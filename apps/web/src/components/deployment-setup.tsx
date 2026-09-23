import {ServerIcon} from "lucide-react";

import {Badge} from "~/components/ui/badge";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "~/components/ui/card";
import {
    Field,
    FieldDescription,
    FieldLabel,
    FieldLegend,
    FieldSet,
} from "~/components/ui/field";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "~/components/ui/select";
import {Separator} from "~/components/ui/separator";
import type {Region} from "~/hooks/use-regions";
import {cn} from "~/lib/utils";


const GETTING_STARTED_STEPS = ["Create deployment",
    "Add logs",
    "Run a search"];

/**
 * Describes the three stages without linking to unavailable screens.
 *
 * @return The informational getting-started sequence.
 */
const GettingStartedSteps = () => (
    <ol
        aria-label={"Getting started"}
        className={"flex flex-col gap-4 sm:flex-row sm:items-center"}
    >
        {GETTING_STARTED_STEPS.map((step, index) => (
            <li
                key={step}
                aria-current={0 === index ?
                    "step" :
                    false}
                className={cn(
                    "flex flex-1 items-center gap-3 text-sm",
                    0 === index ?
                        "font-medium text-brand" :
                        "text-muted-foreground",
                )}
            >
                <span
                    className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-full",
                        0 === index ?
                            "bg-brand text-brand-foreground" :
                            "bg-muted",
                    )}
                >
                    {index + 1}
                </span>
                <span>
                    {step}
                </span>
            </li>
        ))}
    </ol>
);

type DeploymentConfigurationProps = {
    hasLoadFailed: boolean;
    onRegionChange: (region: string) => void;
    regions: readonly Region[] | null;
    selectedRegion: Region | null;
};

/**
 * Explains the region list's state below the region select.
 *
 * @param regions The available regions, or null while loading.
 * @param hasLoadFailed Whether loading the regions failed.
 * @return The region help text.
 */
const getRegionHelp = (regions: readonly Region[] | null, hasLoadFailed: boolean) => {
    if (hasLoadFailed) {
        return "Regions could not be loaded. Reload the page to try again.";
    }
    if (null === regions) {
        return "Loading regions…";
    }

    return 0 === regions.length ?
        "No regions are available yet." :
        "Your logs are stored and searched in this region.";
};

/**
 * Offers the regions the API reports.
 *
 * @param props The region catalog, the selection, and the change handler.
 * @param props.hasLoadFailed Whether loading the regions failed.
 * @param props.onRegionChange Selects a region by name.
 * @param props.regions The available regions, or null while loading.
 * @param props.selectedRegion The selected region, if any.
 * @return The region and configuration controls.
 */
const DeploymentConfiguration = ({
    hasLoadFailed,
    onRegionChange,
    regions,
    selectedRegion,
}: DeploymentConfigurationProps) => (
    <>
        <Field data-disabled={null === regions || 0 === regions.length}>
            <FieldLabel htmlFor={"deployment-region"}>Region</FieldLabel>
            <Select
                disabled={null === regions || 0 === regions.length}
                value={selectedRegion?.region ?? null}
                onValueChange={(value) => {
                    if (null !== value) {
                        onRegionChange(value);
                    }
                }}
            >
                <SelectTrigger
                    aria-describedby={"region-help"}
                    className={"h-11 w-full"}
                    id={"deployment-region"}
                >
                    <SelectValue placeholder={"Regions unavailable"}>
                        {selectedRegion?.region ?? null}
                    </SelectValue>
                </SelectTrigger>
                <SelectContent>
                    <SelectGroup>
                        {(regions ?? []).map((region) => (
                            <SelectItem
                                key={region.region}
                                value={region.region}
                            >
                                {region.region}
                            </SelectItem>
                        ))}
                    </SelectGroup>
                </SelectContent>
            </Select>
            <FieldDescription id={"region-help"}>
                {getRegionHelp(regions, hasLoadFailed)}
            </FieldDescription>
        </Field>
        <FieldSet>
            <FieldLegend
                className={"mb-2 leading-snug"}
                variant={"label"}
            >
                Configuration
            </FieldLegend>
            <Card>
                <CardHeader>
                    <CardTitle className={"flex items-center gap-3"}>
                        <ServerIcon
                            aria-hidden={true}
                            className={"size-5 text-muted-foreground"}/>
                        Starter
                        <Badge variant={"secondary"}>Unavailable</Badge>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className={"text-muted-foreground"}>
                        Starter configuration is not available yet.
                    </p>
                </CardContent>
            </Card>
        </FieldSet>
    </>
);

/**
 * Summarizes the currently entered deployment details.
 *
 * @param props Review properties.
 * @param props.name The current deployment name.
 * @param props.selectedRegion The selected region, if any.
 * @return The synchronized deployment summary.
 */
const DeploymentReview = ({
    name,
    selectedRegion,
}: {name: string; selectedRegion: Region | null}) => (
    <aside
        aria-labelledby={"review-heading"}
        className={"min-w-0 xl:flex xl:self-stretch"}
    >
        <Card className={"min-h-80 xl:flex-1"}>
            <CardHeader>
                <CardTitle>
                    <h2 id={"review-heading"}>Review deployment</h2>
                </CardTitle>
            </CardHeader>
            <CardContent className={"flex flex-col gap-6 xl:flex-1"}>
                <dl className={"flex flex-col gap-6"}>
                    <div className={"flex flex-col gap-2"}>
                        <dt className={"font-medium"}>Deployment name</dt>
                        <dd className={"break-all text-muted-foreground"}>
                            {name.trim() || "Not entered"}
                        </dd>
                    </div>
                    <div className={"flex flex-col gap-2"}>
                        <dt className={"font-medium"}>Region</dt>
                        <dd className={"text-muted-foreground"}>
                            {selectedRegion?.region ?? "Unavailable"}
                        </dd>
                    </div>
                    <div className={"flex flex-col gap-2"}>
                        <dt className={"font-medium"}>Configuration</dt>
                        <dd className={"text-muted-foreground"}>Unavailable</dd>
                    </div>
                </dl>
                <Separator className={"xl:mt-auto"}/>
                <p className={"text-sm text-muted-foreground"}>
                    No deployment will be created.
                </p>
            </CardContent>
        </Card>
    </aside>
);

export {
    DeploymentConfiguration, DeploymentReview, GettingStartedSteps,
};
