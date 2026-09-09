import {Outlet} from "react-router";

import {
    BellIcon,
    HomeIcon,
    PlusIcon,
    RefreshCwIcon,
} from "lucide-react";

import {AppSidebar} from "~/components/app-sidebar";
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "~/components/ui/breadcrumb";
import {Button} from "~/components/ui/button";
import {Separator} from "~/components/ui/separator";
import {
    SidebarInset,
    SidebarProvider,
    SidebarTrigger,
} from "~/components/ui/sidebar";
import {cn} from "~/lib/utils";


/**
 * Renders the authenticated console shell around deployment routes.
 *
 * @return The console navigation, toolbar, and active route.
 */
const ConsoleLayout = () => {
    return (
        <SidebarProvider>
            <AppSidebar/>
            <SidebarInset>
                <header
                    className={cn(
                        "flex h-20 shrink-0 items-center justify-between gap-4",
                        "px-4 lg:px-8",
                    )}
                >
                    <div className={"flex min-w-0 items-center gap-2"}>
                        <SidebarTrigger className={"-ml-1 lg:hidden"}/>
                        <Separator
                            className={"mr-2 data-vertical:h-4 data-vertical:self-auto lg:hidden"}
                            orientation={"vertical"}/>
                        <Breadcrumb>
                            <BreadcrumbList>
                                <BreadcrumbItem>
                                    <BreadcrumbLink
                                        aria-label={"Cloud Console home"}
                                        href={"/"}
                                    >
                                        <HomeIcon className={"size-4"}/>
                                    </BreadcrumbLink>
                                </BreadcrumbItem>
                                <BreadcrumbSeparator/>
                                <BreadcrumbItem className={"hidden sm:block"}>
                                    <BreadcrumbLink href={"/"}>Operations</BreadcrumbLink>
                                </BreadcrumbItem>
                                <BreadcrumbSeparator className={"hidden sm:block"}/>
                                <BreadcrumbItem>
                                    <BreadcrumbPage>Deployments</BreadcrumbPage>
                                </BreadcrumbItem>
                            </BreadcrumbList>
                        </Breadcrumb>
                    </div>
                    <div className={"flex shrink-0 items-center gap-1 sm:gap-2"}>
                        <Button
                            className={"hidden sm:inline-flex"}
                            size={"lg"}
                            type={"button"}
                            variant={"brand"}
                        >
                            <PlusIcon data-icon={"inline-start"}/>
                            Create Deployment
                        </Button>
                        <Button
                            aria-label={"Refresh deployments"}
                            size={"icon-lg"}
                            type={"button"}
                            variant={"ghost"}
                        >
                            <RefreshCwIcon/>
                        </Button>
                        <Button
                            aria-label={"Notifications"}
                            className={"relative"}
                            size={"icon-lg"}
                            type={"button"}
                            variant={"ghost"}
                        >
                            <BellIcon/>
                            <span
                                aria-hidden={"true"}
                                className={cn(
                                    "absolute right-1.5 top-1.5 size-2 rounded-full",
                                    "bg-destructive",
                                )}/>
                        </Button>
                    </div>
                </header>
                <Outlet/>
            </SidebarInset>
        </SidebarProvider>
    );
};


export default ConsoleLayout;
