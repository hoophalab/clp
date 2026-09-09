"use client";

import * as React from "react";

import {
    BookOpenIcon,
    ChartNoAxesColumnIncreasingIcon,
    CreditCardIcon,
    KeyRoundIcon,
    MessageSquareIcon,
    ScrollTextIcon,
    SendIcon,
    ServerIcon,
    WorkflowIcon,
} from "lucide-react";

import {NavAdmin} from "~/components/nav-admin";
import {NavMain} from "~/components/nav-main";
import {NavSecondary} from "~/components/nav-secondary";
import {NavUser} from "~/components/nav-user";
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from "~/components/ui/sidebar";
import {useConsoleUser} from "~/hooks/use-console-user";


const data = {
    navMain: [
        {
            icon: ServerIcon,
            isActive: true,
            items: [
                {
                    icon: ServerIcon,
                    isActive: true,
                    title: "Deployments",
                    url: "/",
                },
                {
                    icon: KeyRoundIcon,
                    title: "API keys",
                    url: "#",
                },
                {
                    icon: ChartNoAxesColumnIncreasingIcon,
                    title: "Metrics",
                    url: "#",
                },
            ],
            title: "Operations",
            url: "#",
        },
        {
            title: "Billing",
            url: "#",
            icon: CreditCardIcon,
        },
    ],
    navSecondary: [
        {
            title: "Documentation",
            url: "#",
            icon: BookOpenIcon,
        },
        {
            title: "Send feedback",
            url: "#",
            icon: SendIcon,
        },
    ],
    admin: [
        {
            title: "Feedback",
            url: "#",
            icon: MessageSquareIcon,
        },
        {
            title: "Builds",
            url: "#",
            icon: WorkflowIcon,
        },
        {
            title: "Audit logs",
            url: "#",
            icon: ScrollTextIcon,
        },
    ],
};

/**
 * Renders the Cloud Console application sidebar.
 *
 * @param props Properties forwarded to the sidebar primitive.
 * @return The application sidebar.
 */
const AppSidebar = (props: React.ComponentProps<typeof Sidebar>) => {
    const currentUser = useConsoleUser();

    return (
        <Sidebar
            variant={"inset"}
            {...props}
        >
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton
                            render={<a href={"/"}/>}
                            size={"lg"}
                        >
                            <img
                                alt={""}
                                className={"size-8"}
                                src={"/favicon.svg"}/>
                            <div className={"grid flex-1 text-left text-sm leading-tight"}>
                                <span className={"truncate font-medium"}>YScope</span>
                                <span className={"truncate text-xs"}>Cloud Console</span>
                            </div>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>
            <SidebarContent>
                <NavMain items={data.navMain}/>
                {currentUser.isAdmin ?
                    <NavAdmin items={data.admin}/> :
                    null}
                <NavSecondary
                    className={"mt-auto"}
                    items={data.navSecondary}/>
            </SidebarContent>
            <SidebarFooter>
                <NavUser user={currentUser}/>
            </SidebarFooter>
        </Sidebar>
    );
};


export {AppSidebar};
