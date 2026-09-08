import {
    isRouteErrorResponse,
    Links,
    Meta,
    Outlet,
    Scripts,
    ScrollRestoration,
} from "react-router";

import type {Route} from "./+types/root";

import "./styles.css";

import {AuthProvider} from "~/components/auth-provider";
import {TooltipProvider} from "~/components/ui/tooltip";


const NOT_FOUND_STATUS_CODE = 404;


/**
 * Defines metadata shared by the application routes.
 *
 * @return The document metadata descriptors.
 */
const meta = () => {
    return [
        {title: "Cloud Console"},
        {
            content: "Cloud Console frontend workspace",
            name: "description",
        },
    ];
};

/**
 * Renders the document shell around the active route.
 *
 * @param root0 The layout properties.
 * @param root0.children The active route content.
 * @return The application document.
 */
const Layout = ({children}: {children: React.ReactNode}) => {
    return (
        <html lang={"en"}>
            <head>
                <meta charSet={"utf-8"}/>
                <meta
                    content={"width=device-width, initial-scale=1"}
                    name={"viewport"}/>
                <Meta/>
                <Links/>
            </head>
            <body className={"relative"}>
                <TooltipProvider>
                    <div className={"isolate"}>
                        {children}
                    </div>
                </TooltipProvider>
                <ScrollRestoration/>
                <Scripts/>
            </body>
        </html>
    );
};

/**
 * Renders the fallback shown while the application hydrates.
 *
 * @return The hydration fallback.
 */
const HydrateFallback = () => {
    return (
        <main
            aria-busy={"true"}
            aria-live={"polite"}
            className={"grid min-h-svh place-items-center p-6"}
        >
            <p
                className={"text-sm text-muted-foreground"}
                role={"status"}
            >
                Loading Cloud Console…
            </p>
        </main>
    );
};

/**
 * Wraps the active application route with the Auth0 provider.
 *
 * @return The application route outlet.
 */
const App = () => {
    return (
        <AuthProvider>
            <Outlet/>
        </AuthProvider>
    );
};

/**
 * Renders a user-facing route error.
 *
 * @param root0 The error boundary properties.
 * @param root0.error The error raised while loading or rendering a route.
 * @return The route error page.
 */
const ErrorBoundary = ({error}: Route.ErrorBoundaryProps) => {
    let heading = "Something went wrong";
    let message = "The Cloud Console could not be displayed.";

    if (isRouteErrorResponse(error)) {
        heading = NOT_FOUND_STATUS_CODE === error.status ?
            "Page not found" :
            "Request failed";
        message =
            NOT_FOUND_STATUS_CODE === error.status ?
                "The requested page does not exist." :
                error.statusText || message;
    }

    return (
        <main className={"grid min-h-svh place-items-center p-6"}>
            <section
                aria-labelledby={"error-heading"}
                className={"flex w-full max-w-lg flex-col gap-3"}
            >
                <p className={"text-sm font-medium text-muted-foreground"}>
                    Cloud Console
                </p>
                <h1
                    className={"text-2xl font-semibold"}
                    id={"error-heading"}
                >
                    {heading}
                </h1>
                <p className={"text-muted-foreground"}>
                    {message}
                </p>
            </section>
        </main>
    );
};


export {
    ErrorBoundary,
    HydrateFallback,
    Layout,
    meta,
};
export default App;
