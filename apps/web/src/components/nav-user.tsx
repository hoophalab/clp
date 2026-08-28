"use client";

import {
    BellIcon,
    ChevronsUpDownIcon,
    LogOutIcon,
    SettingsIcon,
} from "lucide-react";

import {
    Avatar,
    AvatarFallback,
} from "~/components/ui/avatar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    useSidebar,
} from "~/components/ui/sidebar";


const USER_MENU_LABEL_CLASS_NAME =
    "flex items-center gap-2 px-1 py-1.5 text-left text-sm";


/**
 * Renders the signed-in user's sidebar menu.
 *
 * @param root0 The user navigation properties.
 * @param root0.user The current user.
 * @param root0.user.name The user's display name.
 * @param root0.user.email The user's email address.
 * @return The user sidebar menu.
 */
const NavUser = ({
    user,
}: {
    user: {
        name: string;
        email: string;
    };
}) => {
    const {isMobile} = useSidebar();
    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu>
                    <DropdownMenuTrigger
                        render={<SidebarMenuButton
                            className={"aria-expanded:bg-muted"}
                            size={"lg"}/>}
                    >
                        <Avatar>
                            <AvatarFallback>CN</AvatarFallback>
                        </Avatar>
                        <div className={"grid flex-1 text-left text-sm leading-tight"}>
                            <span className={"truncate font-medium"}>
                                {user.name}
                            </span>
                            <span className={"truncate text-xs"}>
                                {user.email}
                            </span>
                        </div>
                        <ChevronsUpDownIcon className={"ml-auto size-4"}/>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        align={"end"}
                        className={"min-w-56 rounded-lg"}
                        sideOffset={4}
                        side={isMobile ?
                            "bottom" :
                            "right"}
                    >
                        <DropdownMenuGroup>
                            <DropdownMenuLabel className={"p-0 font-normal"}>
                                <div
                                    className={USER_MENU_LABEL_CLASS_NAME}
                                >
                                    <Avatar>
                                        <AvatarFallback>CN</AvatarFallback>
                                    </Avatar>
                                    <div className={"grid flex-1 text-left text-sm leading-tight"}>
                                        <span className={"truncate font-medium"}>
                                            {user.name}
                                        </span>
                                        <span className={"truncate text-xs"}>
                                            {user.email}
                                        </span>
                                    </div>
                                </div>
                            </DropdownMenuLabel>
                        </DropdownMenuGroup>
                        <DropdownMenuSeparator/>
                        <DropdownMenuGroup>
                            <DropdownMenuItem>
                                <SettingsIcon/>
                                Settings
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                                <BellIcon/>
                                Notifications
                            </DropdownMenuItem>
                        </DropdownMenuGroup>
                        <DropdownMenuSeparator/>
                        <DropdownMenuItem>
                            <LogOutIcon/>
                            Log out
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    );
};


export {NavUser};
