import {
    createMemoryRouter,
    Outlet,
    RouterProvider,
} from "react-router";

import {
    act,
    cleanup,
    render,
    screen,
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

import ConsoleLayout from "~/routes/console-layout";
import {handle as inventoryHandle} from "~/routes/deployments";


const AUTH0_ROLES_CLAIM = "https://cloud.yscope.com/roles";

const auth0 = vi.hoisted(() => ({
    getAccessTokenSilently: vi.fn(),
    useAuth0: vi.fn(),
}));

vi.mock("@auth0/auth0-react", () => ({
    useAuth0: auth0.useAuth0,
}));

/**
 * Creates a JWT-shaped fixture containing the supplied Auth0 roles.
 *
 * @param roles Roles written by the tenant's post-login Action.
 * @return An access-token fixture.
 */
const createAccessToken = (roles: string[]): string => {
    const payload = btoa(JSON.stringify({[AUTH0_ROLES_CLAIM]: roles}))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replace(/[=]+$/u, "");

    return `header.${payload}.signature`;
};

/**
 * Renders the console layout around representative route content.
 */
const renderConsoleLayout = () => {
    const router = createMemoryRouter([{
        element: <ConsoleLayout/>,
        children: [{
            index: true,
            element: <p>Deployment content</p>,
            handle: inventoryHandle,
        }],
    }]);

    render(<RouterProvider router={router}/>);
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
    auth0.getAccessTokenSilently.mockReset();
    auth0.useAuth0.mockReset();
    auth0.getAccessTokenSilently.mockResolvedValue(createAccessToken(["admin"]));
    auth0.useAuth0.mockReturnValue({
        getAccessTokenSilently: auth0.getAccessTokenSilently,
        user: {
            email: "alice@example.com",
            name: "Alice Admin",
            picture: "https://example.com/alice.png",
            sub: "auth0|alice",
        },
    });
});

describe("ConsoleLayout", () => {
    it("renders the deployment navigation and page actions", () => {
        renderConsoleLayout();

        expect(screen.getAllByRole("link", {name: "Deployments"})[0]).toHaveAttribute(
            "href",
            "/",
        );
        expect(screen.getByRole("link", {name: "Create Deployment"})).toBeVisible();
        expect(screen.getByRole("button", {name: "Refresh deployments"})).toBeVisible();
        expect(screen.getByText("Deployment content")).toBeVisible();
    });

    it("uses the deepest page handle without inheriting another page's toolbar", () => {
        const router = createMemoryRouter([{
            element: <ConsoleLayout/>,
            children: [{
                handle: inventoryHandle,
                element: <Outlet/>,
                children: [{
                    path: "example",
                    element: <p>Example content</p>,
                    handle: {breadcrumbs: [{label: "Settings"},
                        {label: "Example"}]},
                }],
            }],
        }], {initialEntries: ["/example"]});

        render(<RouterProvider router={router}/>);
        const breadcrumbs = screen.getByRole("navigation", {name: "breadcrumb"});
        expect(within(breadcrumbs).getByText("Example")).toHaveAttribute("aria-current", "page");
        expect(within(breadcrumbs).getByText("Settings")).toBeVisible();
        expect(within(breadcrumbs).queryByText("Deployments")).not.toBeInTheDocument();
        expect(screen.queryByRole("link", {name: "Create Deployment"})).not.toBeInTheDocument();
    });

    it("renders the Auth0 user and administrator navigation", async () => {
        renderConsoleLayout();

        expect(screen.queryByText("Administration")).not.toBeInTheDocument();
        expect(screen.getByText("Alice Admin")).toBeVisible();
        expect(screen.getByText("alice@example.com")).toBeVisible();
        expect(screen.getByText("AA")).toBeVisible();
        expect(await screen.findByText("Administration")).toBeVisible();
        expect(auth0.getAccessTokenSilently).toHaveBeenCalledOnce();
    });

    it("hides administrator navigation from a non-administrator", async () => {
        auth0.getAccessTokenSilently.mockResolvedValue(createAccessToken(["reader"]));

        await act(async () => {
            renderConsoleLayout();
            await Promise.resolve();
        });
        expect(auth0.getAccessTokenSilently).toHaveBeenCalledOnce();
        expect(screen.queryByText("Administration")).not.toBeInTheDocument();
    });

    it.each(["retrieval",
        "decoding"])("hides admin links after token %s fails", async (failure) => {
        if ("retrieval" === failure) {
            auth0.getAccessTokenSilently.mockRejectedValue(new Error("Unavailable"));
        } else {
            auth0.getAccessTokenSilently.mockResolvedValue("invalid-token");
        }

        await act(async () => {
            renderConsoleLayout();
            await Promise.resolve();
        });

        expect(screen.queryByText("Administration")).not.toBeInTheDocument();
        expect(screen.getByText("Alice Admin")).toBeVisible();
    });
});
