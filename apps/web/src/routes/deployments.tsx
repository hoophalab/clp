import {
    CpuIcon,
    Globe2Icon,
    PlusIcon,
    ZapIcon,
} from "lucide-react";

import {DeploymentEmptyIllustration} from "~/components/deployment-empty-illustration";
import {Button} from "~/components/ui/button";
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
import {cn} from "~/lib/utils";


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
 * Renders the deployments landing page and its first-use state.
 *
 * @return A first-use page that guides users toward creating a deployment.
 */
const DeploymentsPage = () => {
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
                            <Button
                                className={"min-w-56"}
                                size={"xl"}
                                type={"button"}
                                variant={"brand"}
                            >
                                <PlusIcon data-icon={"inline-start"}/>
                                Create Deployment
                            </Button>
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
        </main>
    );
};


export default DeploymentsPage;
