import {useSyncExternalStore} from "react";
import {createRoutesStub} from "react-router";

import type {Auth0ContextInterface} from "@auth0/auth0-react";
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";

import AuthenticatedLayout from "./authenticated-layout";


const auth0 = vi.hoisted(() => ({
    useAuth0: vi.fn(),
}));

vi.mock("@auth0/auth0-react", () => ({
    useAuth0: auth0.useAuth0,
}));

const loginWithRedirect = vi.fn<Auth0ContextInterface["loginWithRedirect"]>();

type TestAuthState = {
    error?: Error;
    isAuthenticated: boolean;
    isLoading: boolean;
    loginWithRedirect: typeof loginWithRedirect;
};

let authState: TestAuthState;
const authStateListeners = new Set<() => void>();

/**
 * Connects the mocked Auth0 hook to the current test state.
 *
 * @return The current mocked Auth0 state.
 */
const useAuth0Mock = (): TestAuthState => {
    return useSyncExternalStore(
        (listener) => {
            authStateListeners.add(listener);

            return () => authStateListeners.delete(listener);
        },
        () => authState,
        () => authState,
    );
};

auth0.useAuth0.mockImplementation(useAuth0Mock);

/**
 * Renders the child route used by the layout tests.
 *
 * @return The protected content heading.
 */
const ProtectedContent = () => {
    return <h1>Protected content</h1>;
};

/**
 * Renders the authenticated layout at the requested location.
 *
 * @param initialEntry The initial in-memory route.
 * @return The rendered test application.
 */
const renderAuthenticatedLayout = (initialEntry = "/dashboard") => {
    const RoutesStub = createRoutesStub([
        {
            Component: AuthenticatedLayout,
            children: [
                {Component: ProtectedContent, index: true},
                {Component: ProtectedContent, path: "dashboard"},
            ],
        },
    ]);

    return render(<RoutesStub initialEntries={[initialEntry]}/>);
};

/**
 * Updates the Auth0 state and rerenders subscribed components.
 *
 * @param next The next Auth0 state.
 * @param next.error An optional Auth0 failure.
 * @param next.isAuthenticated Whether the session is authenticated.
 * @param next.isLoading Whether Auth0 is still initializing.
 */
const setAuthState = (next: {
    error?: Error;
    isAuthenticated: boolean;
    isLoading: boolean;
}) => {
    authState = {...next, loginWithRedirect};
    authStateListeners.forEach((listener) => {
        listener();
    });
};

afterEach(cleanup);

beforeEach(() => {
    loginWithRedirect.mockReset().mockImplementation(() => Promise.resolve());
});

describe("AuthenticatedLayout", () => {
    it("shows the loading screen while Auth0 initializes", () => {
        setAuthState({isAuthenticated: false, isLoading: true});

        renderAuthenticatedLayout();

        expect(screen.getByText("YScope")).toBeVisible();
        expect(screen.getByRole("status")).toHaveTextContent("Signing you in");
        expect(screen.getByRole("status")).toHaveTextContent(
            "Securely verifying your session.",
        );
        expect(
            screen.queryByText("Protected content"),
        ).not.toBeInTheDocument();
        expect(loginWithRedirect).not.toHaveBeenCalled();
    });

    it("redirects unauthenticated users with the complete return path", async () => {
        setAuthState({isAuthenticated: false, isLoading: false});

        renderAuthenticatedLayout("/dashboard?tab=usage#today");

        expect(screen.getByRole("status")).toHaveTextContent("Signing you in");
        await waitFor(() => {
            expect(loginWithRedirect).toHaveBeenCalledOnce();
        });
        expect(loginWithRedirect).toHaveBeenCalledWith({
            appState: {returnTo: "/dashboard?tab=usage#today"},
        });
    });

    it("renders the protected child route once authenticated", () => {
        setAuthState({isAuthenticated: true, isLoading: false});

        renderAuthenticatedLayout();

        expect(
            screen.getByRole("heading", {name: "Protected content"}),
        ).toBeVisible();
        expect(loginWithRedirect).not.toHaveBeenCalled();
    });

    it("can start a new login after the authenticated session ends", async () => {
        setAuthState({isAuthenticated: false, isLoading: false});
        renderAuthenticatedLayout();
        await waitFor(() => {
            expect(loginWithRedirect).toHaveBeenCalledOnce();
        });

        act(() => {
            setAuthState({isAuthenticated: true, isLoading: false});
        });
        expect(
            screen.getByRole("heading", {name: "Protected content"}),
        ).toBeVisible();

        act(() => {
            setAuthState({isAuthenticated: false, isLoading: false});
        });
        await waitFor(() => {
            expect(loginWithRedirect).toHaveBeenCalledTimes(2);
        });
    });

    it("shows an error when the redirect fails to start", async () => {
        loginWithRedirect.mockReset().mockRejectedValue(
            new Error("redirect failed"),
        );
        setAuthState({isAuthenticated: false, isLoading: false});

        renderAuthenticatedLayout();

        await waitFor(() => {
            expect(screen.getByRole("alert")).toHaveTextContent(
                "redirect failed",
            );
        });
        expect(loginWithRedirect).toHaveBeenCalledOnce();
    });
});

describe("AuthenticatedLayout sign-in failures", () => {
    it("reports a rejected sign-in instead of retrying it", () => {
        setAuthState({
            error: new Error("Service not found: https://cloud.yscope.com/api"),
            isAuthenticated: false,
            isLoading: false,
        });

        renderAuthenticatedLayout();

        expect(screen.getByRole("alert")).toHaveTextContent("Sign-in failed");
        expect(screen.getByRole("alert")).toHaveTextContent(
            "Service not found: https://cloud.yscope.com/api",
        );
        expect(screen.getByRole("link", {
            name: "support@yscope.com",
        })).toHaveAttribute("href", "mailto:support@yscope.com");
        expect(
            screen.queryByText("Protected content"),
        ).not.toBeInTheDocument();
        expect(loginWithRedirect).not.toHaveBeenCalled();
    });

    it.each([
        {
            buttonName: "Try again",
            expectedOptions: {
                appState: {returnTo: "/dashboard?tab=usage#today"},
            },
        },
        {
            buttonName: "Go back to sign-in",
            expectedOptions: {
                appState: {returnTo: "/dashboard?tab=usage#today"},
                authorizationParams: {prompt: "login"},
            },
        },
    ])(
        "$buttonName starts a redirect after a rejected sign-in",
        async ({buttonName, expectedOptions}) => {
            setAuthState({
                error: new Error("Invalid state"),
                isAuthenticated: false,
                isLoading: false,
            });

            renderAuthenticatedLayout("/dashboard?tab=usage#today");

            fireEvent.click(screen.getByRole("button", {name: buttonName}));
            await waitFor(() => {
                expect(loginWithRedirect).toHaveBeenCalledWith(expectedOptions);
            });
        },
    );

    it("starts only one redirect when retry is clicked twice", () => {
        const pendingRedirect = new Promise<void>(() => {
            // Keep the first redirect pending while the second click occurs.
        });

        loginWithRedirect.mockReturnValue(pendingRedirect);
        setAuthState({
            error: new Error("Invalid state"),
            isAuthenticated: false,
            isLoading: false,
        });

        renderAuthenticatedLayout();

        const retryButton = screen.getByRole("button", {name: "Try again"});
        fireEvent.click(retryButton);
        fireEvent.click(retryButton);

        expect(loginWithRedirect).toHaveBeenCalledOnce();
    });

    it("does not loop when the callback location contains an error", async () => {
        setAuthState({
            error: new Error("access_denied"),
            isAuthenticated: false,
            isLoading: false,
        });

        renderAuthenticatedLayout("/?error=access_denied&state=first");

        await waitFor(() => {
            expect(screen.getByRole("alert")).toBeInTheDocument();
        });

        act(() => {
            setAuthState({
                error: new Error("access_denied"),
                isAuthenticated: false,
                isLoading: false,
            });
        });

        expect(loginWithRedirect).not.toHaveBeenCalled();
    });
});
