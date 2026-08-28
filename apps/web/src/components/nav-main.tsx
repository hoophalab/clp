import {
    ChevronRightIcon,
    type LucideIcon,
} from "lucide-react";

import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "~/components/ui/collapsible";
import {
    SidebarGroup,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuAction,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSub,
    SidebarMenuSubButton,
    SidebarMenuSubItem,
} from "~/components/ui/sidebar";


type NavMainItem = {
    title: string;
    url: string;
    icon: LucideIcon;
    disabled?: boolean;
    isActive?: boolean;
    items?: {
        title: string;
        url: string;
    }[];
};

/**
 * Renders the primary Cloud Console navigation.
 *
 * @param root0 The navigation properties.
 * @param root0.items The primary navigation items.
 * @return The primary sidebar group.
 */
const NavMain = ({
    items,
}: {
    items: NavMainItem[];
}) => {
    return (
        <SidebarGroup>
            <SidebarGroupLabel>Platform</SidebarGroupLabel>
            <SidebarMenu>
                {items.map((item) => {
                    const Icon = item.icon;

                    if (item.disabled) {
                        return (
                            <SidebarMenuItem key={item.title}>
                                <SidebarMenuButton disabled={true}>
                                    <Icon/>
                                    <span>
                                        {item.title}
                                    </span>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        );
                    }

                    return (
                        <Collapsible
                            defaultOpen={item.isActive}
                            key={item.title}
                            render={<SidebarMenuItem/>}
                        >
                            <SidebarMenuButton
                                render={<a href={item.url}/>}
                                tooltip={item.title}
                            >
                                <Icon/>
                                <span>
                                    {item.title}
                                </span>
                            </SidebarMenuButton>
                            {item.items?.length ?
                                (
                                    <>
                                        <CollapsibleTrigger
                                            render={
                                                <SidebarMenuAction
                                                    className={"aria-expanded:rotate-90"}/>
                                            }
                                        >
                                            <ChevronRightIcon/>
                                            <span className={"sr-only"}>Toggle</span>
                                        </CollapsibleTrigger>
                                        <CollapsibleContent>
                                            <SidebarMenuSub>
                                                {item.items.map((subItem) => (
                                                    <SidebarMenuSubItem key={subItem.title}>
                                                        <SidebarMenuSubButton
                                                            render={<a href={subItem.url}/>}
                                                        >
                                                            <span>
                                                                {subItem.title}
                                                            </span>
                                                        </SidebarMenuSubButton>
                                                    </SidebarMenuSubItem>
                                                ))}
                                            </SidebarMenuSub>
                                        </CollapsibleContent>
                                    </>
                                ) :
                                null}
                        </Collapsible>
                    );
                })}
            </SidebarMenu>
        </SidebarGroup>
    );
};


export {NavMain};
