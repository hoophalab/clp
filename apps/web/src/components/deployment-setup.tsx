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
    SelectTrigger,
    SelectValue,
} from "~/components/ui/select";
import {Separator} from "~/components/ui/separator";
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

/**
 * Shows the unavailable configuration controls.
 *
 * @return Configuration availability without inventing selectable values.
 */
const DeploymentConfiguration = () => (
    <>
        <Field data-disabled={true}>
            <FieldLabel htmlFor={"deployment-region"}>Region</FieldLabel>
            <Select disabled={true}>
                <SelectTrigger
                    aria-describedby={"region-help"}
                    className={"h-11 w-full"}
                    id={"deployment-region"}
                >
                    <SelectValue placeholder={"Regions unavailable"}/>
                </SelectTrigger>
            </Select>
            <FieldDescription id={"region-help"}>
                Supported regions are not available yet.
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
 * @return The synchronized deployment summary.
 */
const DeploymentReview = ({name}: {name: string}) => (
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
                        <dd className={"text-muted-foreground"}>Unavailable</dd>
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
