import {
    Outlet,
    useMatches,
} from "react-router";

import {BellIcon} from "lucide-react";

import {AppSidebar} from "~/components/app-sidebar";
import {ConsoleBreadcrumbs} from "~/components/console-breadcrumbs";
import {Button} from "~/components/ui/button";
import {Separator} from "~/components/ui/separator";
import {
    SidebarInset,
    SidebarProvider,
    SidebarTrigger,
} from "~/components/ui/sidebar";
import type {ConsoleRouteHandle} from "~/lib/console-route";
import {cn} from "~/lib/utils";


/**
 * Renders the authenticated console shell around deployment routes.
 *
 * @return The console navigation, toolbar, and active route.
 */
const ConsoleLayout = () => {
    // Route modules check their handles with `satisfies ConsoleRouteHandle`.
    // React Router exposes handles as unknown, so apply that local contract here.
    const page = useMatches()
        .map((match) => match.handle as ConsoleRouteHandle | undefined)
        .reverse()
        .find((handle) => handle?.breadcrumbs);

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
                        <ConsoleBreadcrumbs breadcrumbs={page?.breadcrumbs ?? []}/>
                    </div>
                    <div className={"flex shrink-0 items-center gap-1 sm:gap-2"}>
                        {page?.toolbar}
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
