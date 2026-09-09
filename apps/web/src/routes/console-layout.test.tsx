import {
    MemoryRouter,
    Route,
    Routes,
} from "react-router";

import {
    act,
    cleanup,
    render,
    screen,
} from "@testing-library/react";
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";

import type {DeploymentQuota} from "~/lib/deployment-quota";
import {SAMPLE_DEPLOYMENT_QUOTA} from "~/lib/sample-deployment-quota";
import ConsoleLayout from "~/routes/console-layout";


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
 *
 * @param quota The account deployment quota.
 */
const renderConsoleLayout = (quota: DeploymentQuota = SAMPLE_DEPLOYMENT_QUOTA) => {
    render(
        <MemoryRouter>
            <Routes>
                <Route element={<ConsoleLayout quota={quota}/>}>
                    <Route
                        element={<p>Deployment content</p>}
                        index={true}/>
                </Route>
            </Routes>
        </MemoryRouter>,
    );
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
    it("omits the trial widget for PPU accounts", async () => {
        await act(async () => {
            renderConsoleLayout({mode: "ppu"});
            await Promise.resolve();
        });
        expect(screen.queryByText("Trial plan")).not.toBeInTheDocument();
        expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Create Deployment"})).toBeVisible();
    });

    it("renders the deployment navigation and page actions", () => {
        renderConsoleLayout();

        expect(screen.getAllByRole("link", {name: "Deployments"})[0]).toHaveAttribute(
            "aria-current",
            "page",
        );
        expect(screen.getByRole("button", {name: "Create Deployment"})).toBeVisible();
        expect(screen.getByRole("button", {name: "Refresh deployments"})).toBeVisible();
        expect(screen.getByRole("button", {name: "Notifications"})).toBeVisible();
        expect(screen.getByText("Trial plan")).toBeVisible();
        expect(screen.getByText("9 / 10")).toBeVisible();
        expect(screen.getByRole("progressbar", {
            name: "Trial plan deployment quota",
        })).toHaveAttribute("aria-valuetext", "9 of 10 deployments used");
        expect(screen.getByText("Deployment content")).toBeVisible();
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
