import {
    useCallback,
    useMemo,
} from "react";
import {useNavigate} from "react-router";

import {
    type AppState,
    Auth0Provider,
} from "@auth0/auth0-react";

import {readAuth0Config} from "~/lib/auth0-config";


type AuthProviderProps = {
    children: React.ReactNode;
};

/**
 * Provides the Auth0 client and restores the requested route after login.
 *
 * @param props The component properties.
 * @param props.children Content that uses the Auth0 context.
 * @return The configured Auth0 provider.
 */
const AuthProvider = ({children}: AuthProviderProps) => {
    const auth0Config = useMemo(() => readAuth0Config(), []);
    const navigate = useNavigate();
    const handleRedirect = useCallback(
        (appState?: AppState) => {
            const navigationResult = navigate(
                appState?.returnTo ?? window.location.pathname,
                {replace: true},
            );

            if (navigationResult) {
                navigationResult.catch((e: unknown) => {
                    console.error(
                        "Failed to restore the Auth0 callback route.",
                        e,
                    );
                });
            }
        },
        [navigate],
    );

    return (
        <Auth0Provider
            clientId={auth0Config.clientId}
            domain={auth0Config.domain}
            authorizationParams={{
                audience: auth0Config.audience,
                ...("undefined" === typeof window ?
                    {} :
                    {redirect_uri: window.location.origin}),
            }}
            onRedirectCallback={handleRedirect}
        >
            {children}
        </Auth0Provider>
    );
};


export {AuthProvider};
