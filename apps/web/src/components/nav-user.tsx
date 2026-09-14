"use client";

import {useState} from "react";

import {useAuth0} from "@auth0/auth0-react";
import {
    BellIcon,
    ChevronsUpDownIcon,
    LogOutIcon,
    SettingsIcon,
} from "lucide-react";

import {
    Avatar,
    AvatarFallback,
    AvatarImage,
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
import {toast} from "~/components/ui/toast";
import type {ConsoleUser} from "~/hooks/use-console-user";


const USER_MENU_LABEL_CLASS_NAME =
    "flex items-center gap-2 px-1 py-1.5 text-left text-sm";
const LOGOUT_ERROR_TOAST_ID = "logout-error";

type LogoutStatus = "ready" | "pending" | "failed";

/**
 * Renders a user's Auth0 picture with derived initials as its fallback.
 *
 * @param root0 Avatar properties.
 * @param root0.user Current Auth0 user details.
 * @return The composed user avatar.
 */
const UserAvatar = ({user}: {user: ConsoleUser}) => (
    <Avatar>
        <AvatarImage
            alt={user.name}
            src={user.picture}/>
        <AvatarFallback>
            {user.initials}
        </AvatarFallback>
    </Avatar>
);


/**
 * Renders the signed-in user's sidebar menu.
 *
 * @param root0 The user navigation properties.
 * @param root0.user The current user.
 * @return The user sidebar menu.
 */
const NavUser = ({
    user,
}: {user: ConsoleUser}) => {
    const {isMobile} = useSidebar();
    const {logout} = useAuth0();
    const [logoutStatus, setLogoutStatus] = useState<LogoutStatus>("ready");
    const isLoggingOut = "pending" === logoutStatus;
    const handleLogout = () => {
        if (isLoggingOut) {
            return;
        }

        setLogoutStatus("pending");
        toast.close(LOGOUT_ERROR_TOAST_ID);
        logout({logoutParams: {returnTo: window.location.origin}}).catch(() => {
            setLogoutStatus("failed");
            toast.add({
                id: LOGOUT_ERROR_TOAST_ID,
                title: "Could not log out",
                description: "Please try again from the user menu.",
                type: "error",
            });
        });
    };

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu>
                    <DropdownMenuTrigger
                        aria-busy={isLoggingOut}
                        disabled={isLoggingOut}
                        render={<SidebarMenuButton
                            className={"aria-expanded:bg-muted"}
                            size={"lg"}/>}
                    >
                        <UserAvatar user={user}/>
                        <div className={"grid flex-1 text-left text-sm leading-tight"}>
                            <span className={"truncate font-medium"}>
                                {isLoggingOut ?
                                    "Logging out..." :
                                    user.name}
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
                                    <UserAvatar user={user}/>
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
                        <DropdownMenuGroup>
                            <DropdownMenuItem
                                disabled={isLoggingOut}
                                onClick={handleLogout}
                            >
                                <LogOutIcon/>
                                Log out
                            </DropdownMenuItem>
                        </DropdownMenuGroup>
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    );
};


export {NavUser};
