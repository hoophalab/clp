import type {Auth0ContextInterface} from "@auth0/auth0-react";
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";

import {NavUser} from "./nav-user";

import {SidebarProvider} from "~/components/ui/sidebar";
import {Toaster} from "~/components/ui/toast";


const auth0 = vi.hoisted(() => ({
    logout: vi.fn<Auth0ContextInterface["logout"]>(),
}));

vi.mock("@auth0/auth0-react", () => ({
    useAuth0: () => auth0,
}));

/**
 * Renders and opens the signed-in user's sidebar menu.
 *
 * @return The logout menu item.
 */
const openUserMenu = async () => {
    render(
        <>
            <SidebarProvider>
                <NavUser
                    user={{
                        email: "alice@example.com",
                        initials: "AA",
                        isAdmin: false,
                        name: "Alice Admin",
                    }}/>
            </SidebarProvider>
            <Toaster/>
        </>
    );

    fireEvent.click(screen.getByRole("button", {name: /Alice Admin/u}));

    return screen.findByRole("menuitem", {name: "Log out"});
};

afterEach(cleanup);

beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: vi.fn().mockReturnValue({
            addEventListener: vi.fn(),
            matches: false,
            removeEventListener: vi.fn(),
        }),
    });
    auth0.logout.mockReset().mockReturnValue(new Promise<void>(() => {
        // Keep logout pending until the browser leaves the console.
    }));
});

describe("NavUser logout", () => {
    it.each(["mouse",
        "keyboard"])("logs out through Auth0 using the %s", async (input) => {
        const logoutItem = await openUserMenu();

        if ("keyboard" === input) {
            fireEvent.keyDown(logoutItem, {key: "Enter"});
        } else {
            fireEvent.click(logoutItem);
        }

        expect(auth0.logout).toHaveBeenCalledExactlyOnceWith({
            logoutParams: {returnTo: window.location.origin},
        });
    });

    it("shows progress and prevents repeated logout while redirecting", async () => {
        const logoutItem = await openUserMenu();

        fireEvent.click(logoutItem);

        const trigger = screen.getByRole("button", {name: /Logging out/u});
        expect(trigger).toBeDisabled();
        expect(trigger).toHaveAttribute("aria-busy", "true");
        fireEvent.click(trigger);
        fireEvent.click(logoutItem);
        expect(auth0.logout).toHaveBeenCalledOnce();
    });

    it("reports a failed logout and allows retrying", async () => {
        auth0.logout.mockRejectedValueOnce(new Error("Redirect failed"));
        const logoutItem = await openUserMenu();

        fireEvent.click(logoutItem);

        expect(await screen.findByText("Could not log out")).toBeVisible();
        expect(within(screen.getByRole("list")).queryByText("Could not log out"))
            .not.toBeInTheDocument();
        const trigger = screen.getByRole("button", {name: /Alice Admin/u});
        expect(trigger).toBeEnabled();
        fireEvent.click(trigger);
        fireEvent.click(await screen.findByRole("menuitem", {name: "Log out"}));

        expect(auth0.logout).toHaveBeenCalledTimes(2);
        await waitFor(() => {
            expect(screen.queryByText("Could not log out")).not.toBeInTheDocument();
        });
        expect(screen.getByRole("button", {name: /Logging out/u})).toBeDisabled();
    });
});
