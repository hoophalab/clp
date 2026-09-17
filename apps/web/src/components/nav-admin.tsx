import {Link} from "react-router";

import type {LucideIcon} from "lucide-react";

import {Badge} from "~/components/ui/badge";
import {
    SidebarGroup,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from "~/components/ui/sidebar";


/**
 * Renders navigation links that are available only to administrators.
 *
 * @param root0 The navigation properties.
 * @param root0.items The administrative navigation items.
 * @return The administrative sidebar group.
 */
const NavAdmin = ({
    items,
}: {
    items: {
        title: string;
        url: string;
        icon: LucideIcon;
    }[];
}) => {
    return (
        <SidebarGroup className={"group-data-[collapsible=icon]:hidden"}>
            <SidebarGroupLabel className={"gap-2"}>
                Administration
                <Badge variant={"secondary"}>admin</Badge>
            </SidebarGroupLabel>
            <SidebarMenu>
                {items.map(({icon: Icon, title, url}) => (
                    <SidebarMenuItem key={title}>
                        <SidebarMenuButton
                            render={url.startsWith("#") ?
                                <a href={url}/> :
                                <Link to={url}/>}
                        >
                            <Icon/>
                            <span>
                                {title}
                            </span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                ))}
            </SidebarMenu>
        </SidebarGroup>
    );
};


export {NavAdmin};
