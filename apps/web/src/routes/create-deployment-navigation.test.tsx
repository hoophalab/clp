import {
    createMemoryRouter,
    RouterProvider,
} from "react-router";

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

import AuthenticatedLayout from "~/routes/authenticated-layout";
import ConsoleLayout from "~/routes/console-layout";
import CreateDeploymentPage, {handle as creationHandle} from "~/routes/create-deployment";
import DeploymentsPage, {handle as inventoryHandle} from "~/routes/deployments";


const auth = vi.hoisted(() => ({useAuth0: vi.fn(), loginWithRedirect: vi.fn()}));
vi.mock("@auth0/auth0-react", () => ({useAuth0: auth.useAuth0}));
afterEach(cleanup);
beforeEach(() => {
    auth.loginWithRedirect.mockReset().mockResolvedValue(null);
    auth.useAuth0.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        getAccessTokenSilently: vi.fn().mockResolvedValue("invalid-token"),
        loginWithRedirect: auth.loginWithRedirect,
    });
    Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: vi.fn().mockReturnValue({
            addEventListener: vi.fn(), removeEventListener: vi.fn(), matches: false,
        }),
    });
});

/**
 * Renders the protected console with an empty deployment inventory.
 *
 * @param path The initial route.
 */
const renderConsole = (path = "/") => {
    const router = createMemoryRouter([{
        element: <AuthenticatedLayout/>,
        children: [{
            element: <ConsoleLayout/>,
            children: [
                {
                    index: true,
                    element: <DeploymentsPage deployments={[]}/>,
                    handle: inventoryHandle,
                },
                {
                    path: "deployments/new",
                    element: <CreateDeploymentPage/>,
                    handle: creationHandle,
                },
            ],
        }],
    }], {initialEntries: [path]});

    render(<RouterProvider router={router}/>);
};

describe("Deployment creation navigation", () => {
    it.each([0,
        1])("opens the page through entry point %s and navigates back", async (index) => {
        renderConsole();
        const entry = screen.getAllByRole("link", {name: "Create Deployment"})[index];
        expect(entry).toHaveAttribute("href", "/deployments/new");
        fireEvent.click(entry);
        expect(screen.getByRole("heading", {name: "Create your first deployment"})).toBeVisible();
        expect(screen.queryByText("Trial plan")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Refresh deployments"})).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("link", {name: "Back"}));
        expect(screen.getByText("No deployments yet")).toBeVisible();
        await waitFor(() => {
            expect(auth.loginWithRedirect).not.toHaveBeenCalled();
        });
    });

    it.each(["sidebar-menu-sub-button",
        "sidebar-header"])("returns home through %s", async (slot) => {
        renderConsole("/deployments/new");
        const sidebar = document.querySelector('[data-slot="sidebar"]');
        expect(sidebar).not.toBeNull();
        const link = (sidebar as HTMLElement).querySelector(
            `[data-slot="${slot}"][href="/"], [data-slot="${slot}"] a[href="/"]`,
        );

        expect(link).not.toBeNull();
        expect(link).toHaveAttribute("href", "/");
        expect(fireEvent.click(link as HTMLElement)).toBe(false);
        expect(await screen.findByText("No deployments yet")).toBeVisible();
        expect(auth.loginWithRedirect).not.toHaveBeenCalled();
    });

    it("uses the creation toolbar for a trailing-slash URL", () => {
        renderConsole("/deployments/new/");
        expect(screen.getByRole("heading", {name: "Create your first deployment"})).toBeVisible();
        expect(screen.queryByText("Trial plan")).not.toBeInTheDocument();
        expect(screen.queryByRole("link", {name: "Create Deployment"})).not.toBeInTheDocument();
    });

    it.each(["/deployments/new",
        "/deployments/new/?source=bookmark#review"])("follows its parent", async (path) => {
        renderConsole(path);
        const breadcrumbs = screen.getByRole("navigation", {name: "breadcrumb"});
        expect(within(breadcrumbs).getByText("Operations")).toBeVisible();
        const sectionLink = within(breadcrumbs).queryByRole("link", {name: "Operations"});
        expect(sectionLink).not.toBeInTheDocument();
        const parent = within(breadcrumbs).getByRole("link", {name: "Deployments"});
        expect(parent).toHaveAttribute("href", "/");
        expect(within(breadcrumbs).getByText("Create")).toHaveAttribute("aria-current", "page");
        fireEvent.click(parent);
        expect(await screen.findByText("No deployments yet")).toBeVisible();
        expect(within(breadcrumbs).getByText("Deployments"))
            .toHaveAttribute("aria-current", "page");
        expect(within(breadcrumbs).queryByText("Create")).not.toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Refresh deployments"})).toBeVisible();
    });

    it("protects direct navigation and preserves the Auth0 return path", async () => {
        auth.useAuth0.mockReturnValue({
            isAuthenticated: false,
            isLoading: false,
            loginWithRedirect: auth.loginWithRedirect,
        });
        renderConsole("/deployments/new");
        expect(screen.queryByRole("textbox", {name: "Deployment name"})).not.toBeInTheDocument();
        await waitFor(() => {
            expect(auth.loginWithRedirect).toHaveBeenCalledWith({
                appState: {returnTo: "/deployments/new"},
            });
        });
    });
});
