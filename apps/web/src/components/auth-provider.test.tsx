import {
    createRoutesStub,
    Outlet,
} from "react-router";

import type {Auth0ProviderOptions} from "@auth0/auth0-react";
import {
    act,
    cleanup,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import {
    afterEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";

import {AuthProvider} from "./auth-provider";


const auth0 = vi.hoisted(() => ({
    provider: vi.fn<(props: Auth0ProviderOptions) => void>(),
}));

vi.mock("@auth0/auth0-react", () => ({
    Auth0Provider: (props: Auth0ProviderOptions) => {
        auth0.provider(props);

        return props.children;
    },
}));

vi.mock("~/lib/auth0-config", () => ({
    readAuth0Config: () => ({
        audience: "https://api.example.test",
        clientId: "client-id",
        domain: "tenant.example.test",
    }),
}));

/**
 * Wraps test routes with the application Auth0 provider.
 *
 * @return The provider-backed route outlet.
 */
const ProviderLayout = () => {
    return (
        <AuthProvider>
            <Outlet/>
        </AuthProvider>
    );
};

/**
 * Renders the primary test route.
 *
 * @return The home heading.
 */
const Home = () => {
    return <h1>Home</h1>;
};

/**
 * Renders the callback destination test route.
 *
 * @return The feedback heading.
 */
const Feedback = () => {
    return <h1>Feedback</h1>;
};

/**
 * Returns the properties from the latest mocked Auth0 provider render.
 *
 * @return The latest Auth0 provider properties.
 * @throws {Error} When the provider has not rendered.
 */
const readProviderProps = (): Auth0ProviderOptions => {
    const providerProps = auth0.provider.mock.lastCall?.[0];

    if (!providerProps) {
        throw new Error("Expected Auth0Provider to render.");
    }

    return providerProps;
};

/**
 * Returns the redirect callback from the mocked Auth0 provider.
 *
 * @return The Auth0 redirect callback.
 * @throws {Error} When the provider omitted its redirect callback.
 */
const readRedirectCallback = (): NonNullable<
    Auth0ProviderOptions["onRedirectCallback"]
> => {
    const redirectCallback = readProviderProps().onRedirectCallback;

    if (!redirectCallback) {
        throw new Error("Expected Auth0Provider to register a redirect callback.");
    }

    return redirectCallback;
};

describe("AuthProvider", () => {
    afterEach(() => {
        cleanup();
        auth0.provider.mockClear();
    });

    it("configures Auth0 and restores the saved route after its callback", async () => {
        const RoutesStub = createRoutesStub([
            {
                Component: ProviderLayout,
                children: [
                    {Component: Home, path: "home"},
                    {Component: Feedback, path: "feedback-viewer"},
                ],
            },
        ]);

        render(<RoutesStub initialEntries={["/home"]}/>);

        expect(screen.getByRole("heading", {name: "Home"})).toBeVisible();
        const providerProps = readProviderProps();
        expect(providerProps).toMatchObject({
            authorizationParams: {
                audience: "https://api.example.test",
                redirect_uri: "http://localhost:3000",
            },
            clientId: "client-id",
            domain: "tenant.example.test",
        });

        const redirectCallback = readRedirectCallback();
        act(() => {
            redirectCallback({
                returnTo: "/feedback-viewer?source=auth#details",
            });
        });

        await waitFor(() => {
            expect(
                screen.getByRole("heading", {name: "Feedback"}),
            ).toBeVisible();
        });
    });

    it("returns to the current path when the callback carries no state", async () => {
        const RoutesStub = createRoutesStub([
            {
                Component: ProviderLayout,
                children: [{Component: Home, index: true}],
            },
        ]);

        render(<RoutesStub initialEntries={["/"]}/>);

        const redirectCallback = readRedirectCallback();
        act(() => {
            redirectCallback();
        });

        await waitFor(() => {
            expect(screen.getByRole("heading", {name: "Home"})).toBeVisible();
        });
    });
});
