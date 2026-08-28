import type * as React from "react";

import type {LucideIcon} from "lucide-react";

import {
    SidebarGroup,
    SidebarGroupContent,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from "~/components/ui/sidebar";


/**
 * Renders the secondary Cloud Console navigation.
 *
 * @param root0 The navigation properties.
 * @param root0.items The secondary navigation items.
 * @param root0.props Properties forwarded to the sidebar group.
 * @return The secondary sidebar group.
 */
const NavSecondary = ({
    items,
    ...props
}: {
    items: {
        title: string;
        url: string;
        icon: LucideIcon;
    }[];
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) => {
    return (
        <SidebarGroup {...props}>
            <SidebarGroupContent>
                <SidebarMenu>
                    {items.map(({icon: Icon, title, url}) => (
                        <SidebarMenuItem key={title}>
                            <SidebarMenuButton
                                render={<a href={url}/>}
                                size={"sm"}
                            >
                                <Icon/>
                                <span>
                                    {title}
                                </span>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    ))}
                </SidebarMenu>
            </SidebarGroupContent>
        </SidebarGroup>
    );
};


export {NavSecondary};
