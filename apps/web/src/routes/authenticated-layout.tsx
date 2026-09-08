import {
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";
import {
    createPath,
    Outlet,
    useLocation,
} from "react-router";

import {useAuth0} from "@auth0/auth0-react";

import {
    AuthenticationLoadingScreen,
    AuthenticationSignInErrorScreen,
} from "~/components/authentication-screens";


/**
 * Redirects signed-out users to Auth0 and shows the protected child route.
 *
 * @return The authentication state screen or protected route outlet.
 */
const AuthenticatedLayout = () => {
    const {error, isAuthenticated, isLoading, loginWithRedirect} = useAuth0();
    const location = useLocation();
    const loginAttempt = useRef<string | null>(null);
    const [redirectError, setRedirectError] = useState<Error | null>(null);
    const returnTo = createPath(location);
    const startLoginWithRedirect = useCallback(
        (authorizationParams?: {prompt: "login"}) => {
            if (loginAttempt.current === returnTo) {
                return;
            }

            loginAttempt.current = returnTo;
            setRedirectError(null);
            loginWithRedirect({
                appState: {returnTo},
                ...(authorizationParams ?
                    {authorizationParams} :
                    {}),
            }).catch((e: unknown) => {
                loginAttempt.current = null;
                setRedirectError(
                    e instanceof Error ?
                        e :
                        new Error("Unable to start sign-in."),
                );
            });
        },
        [
            loginWithRedirect,
            returnTo,
        ],
    );

    useEffect(() => {
        if (isLoading || isAuthenticated || error || redirectError) {
            loginAttempt.current = null;

            return;
        }

        startLoginWithRedirect();
    }, [
        error,
        isAuthenticated,
        isLoading,
        redirectError,
        startLoginWithRedirect,
    ]);

    const signInError = redirectError ?? error;
    if (signInError) {
        const retryLogin = () => {
            startLoginWithRedirect();
        };
        const restartLogin = () => {
            startLoginWithRedirect({prompt: "login"});
        };

        return (
            <AuthenticationSignInErrorScreen
                message={signInError.message}
                onRetry={retryLogin}
                onSignIn={restartLogin}/>
        );
    }

    if (isLoading || !isAuthenticated) {
        return <AuthenticationLoadingScreen/>;
    }

    return <Outlet/>;
};


export default AuthenticatedLayout;
