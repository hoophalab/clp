import {useState} from "react";
import {Link} from "react-router";

import {
    CpuIcon,
    Globe2Icon,
    PlusIcon,
    SearchXIcon,
    ZapIcon,
} from "lucide-react";

import {DeploymentCard} from "~/components/deployment-card";
import {DeploymentEmptyIllustration} from "~/components/deployment-empty-illustration";
import {DeploymentFilters} from "~/components/deployment-filters";
import {DeploymentToolbar} from "~/components/deployment-toolbar";
import {
    Button,
    buttonVariants,
} from "~/components/ui/button";
import {
    Card,
    CardContent,
    CardFooter,
} from "~/components/ui/card";
import {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from "~/components/ui/empty";
import {Separator} from "~/components/ui/separator";
import {
    type ConsoleRouteHandle,
    DEPLOYMENT_BREADCRUMBS,
} from "~/lib/console-route";
import {
    type Deployment,
    type DeploymentSort,
    type DeploymentStatus,
    filterDeployments,
} from "~/lib/deployments";
import {SAMPLE_DEPLOYMENTS} from "~/lib/sample-deployments";
import {cn} from "~/lib/utils";


const handle = {
    breadcrumbs: DEPLOYMENT_BREADCRUMBS,
    toolbar: <DeploymentToolbar/>,
} satisfies ConsoleRouteHandle;

const DEPLOYMENT_BENEFITS = [
    {
        icon: Globe2Icon,
        label: "Choose a region",
    },
    {
        icon: CpuIcon,
        label: "Configure compute",
    },
    {
        icon: ZapIcon,
        label: "Deploy in minutes",
    },
];

/**
 * Guides a user who has not created a deployment yet.
 *
 * @return The deployment first-use card.
 */
const DeploymentFirstUseState = () => {
    return (
        <Card className={"mt-3 min-h-[36rem] flex-1"}>
            <CardContent className={"flex flex-1"}>
                <Empty className={"gap-7 py-8"}>
                    <EmptyHeader className={"max-w-2xl gap-4"}>
                        <EmptyMedia className={"mb-4"}>
                            <DeploymentEmptyIllustration/>
                        </EmptyMedia>
                        <div className={"relative top-3 flex flex-col gap-4"}>
                            <EmptyTitle className={"text-3xl"}>
                                No deployments yet
                            </EmptyTitle>
                            <EmptyDescription className={"text-lg/relaxed"}>
                                Create your first deployment to start fetching and
                                searching your data.
                            </EmptyDescription>
                        </div>
                    </EmptyHeader>
                    <EmptyContent
                        className={cn(
                            "relative top-3 gap-6",
                            "sm:max-w-none sm:flex-row sm:justify-center",
                        )}
                    >
                        <Link
                            to={"/deployments/new"}
                            className={cn(
                                buttonVariants({size: "xl", variant: "brand"}),
                                "min-w-56",
                            )}
                        >
                            <PlusIcon data-icon={"inline-start"}/>
                            Create Deployment
                        </Link>
                        <Button
                            nativeButton={false}
                            size={"lg"}
                            variant={"brand-link"}
                            render={
                                <a
                                    href={"https://docs.yscope.com/"}
                                    rel={"noreferrer"}
                                    target={"_blank"}/>
                            }
                        >
                            Read documentation
                        </Button>
                    </EmptyContent>
                </Empty>
            </CardContent>
            <CardFooter
                className={cn(
                    "mx-auto grid min-h-40 w-[calc(100%-3rem)] max-w-[58rem]",
                    "gap-4 bg-card px-0 py-8",
                    "sm:grid-cols-[1fr_auto_1fr_auto_1fr]",
                )}
            >
                {DEPLOYMENT_BENEFITS.map(({icon: Icon, label}, index) => (
                    <div
                        className={"contents"}
                        key={label}
                    >
                        {0 < index ?
                            <Separator
                                orientation={"vertical"}
                                className={cn(
                                    "hidden translate-y-1 data-vertical:h-8",
                                    "sm:block",
                                )}/> :
                            null}
                        <div
                            className={cn(
                                "flex -translate-y-3 items-center justify-center gap-3 py-2",
                                "text-sm text-muted-foreground",
                            )}
                        >
                            <Icon className={"size-5"}/>
                            <span>
                                {label}
                            </span>
                        </div>
                    </div>
                ))}
            </CardFooter>
        </Card>
    );
};

type DeploymentsPageProps = {
    deployments?: readonly Deployment[];
};

/**
 * Renders the searchable deployment inventory or its first-use state.
 *
 * @param props Optional deployments supplied by a data route or a test.
 * @param props.deployments
 * @return The deployments inventory page.
 */
const DeploymentsPage = ({
    deployments = SAMPLE_DEPLOYMENTS,
}: DeploymentsPageProps) => {
    const [query, setQuery] = useState("");
    const [region, setRegion] = useState("all");
    const [sort, setSort] = useState<DeploymentSort>("newest");
    const [status, setStatus] = useState<DeploymentStatus | "all">("all");
    const regions = Array.from(
        new Set(deployments.map((deployment) => deployment.region)),
    ).sort();
    const visibleDeployments = filterDeployments(deployments, {
        query,
        region,
        sort,
        status,
    });

    return (
        <main
            className={cn(
                "flex flex-1 flex-col gap-8 px-4 pb-4 pt-2",
                "lg:pb-8 lg:pl-11 lg:pr-9",
            )}
        >
            <div className={"flex flex-col gap-1"}>
                <h1 className={"text-3xl font-semibold tracking-tight"}>Deployments</h1>
                <p className={"text-muted-foreground"}>
                    Manage and monitor your data fetching deployments.
                </p>
            </div>
            {0 === deployments.length ?
                <DeploymentFirstUseState/> :
                <div className={"flex flex-col gap-6"}>
                    <DeploymentFilters
                        query={query}
                        region={region}
                        regions={regions}
                        sort={sort}
                        status={status}
                        onQueryChange={setQuery}
                        onRegionChange={setRegion}
                        onSortChange={setSort}
                        onStatusChange={setStatus}/>
                    {0 === visibleDeployments.length ?
                        <Empty className={"min-h-64 border"}>
                            <EmptyHeader>
                                <EmptyMedia variant={"icon"}>
                                    <SearchXIcon/>
                                </EmptyMedia>
                                <EmptyTitle size={"lg"}>No deployments found</EmptyTitle>
                                <EmptyDescription>
                                    Adjust the search or filters to see more deployments.
                                </EmptyDescription>
                            </EmptyHeader>
                        </Empty> :
                        <ul className={"flex flex-col gap-4"}>
                            {visibleDeployments.map((deployment) => (
                                <li key={deployment.id}>
                                    <DeploymentCard deployment={deployment}/>
                                </li>
                            ))}
                        </ul>}
                </div>}
        </main>
    );
};


export {handle};
export default DeploymentsPage;
