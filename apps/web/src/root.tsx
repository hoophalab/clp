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

export function meta() {
    return [
        {title: "Cloud Console"},
        {
            content: "Cloud Console frontend workspace",
            name: "description",
        },
    ];
}

export function Layout({children}: {children: React.ReactNode}) {
    return (
        <html lang="en">
            <head>
                <meta charSet="utf-8" />
                <meta
                    content="width=device-width, initial-scale=1"
                    name="viewport"
                />
                <Meta />
                <Links />
            </head>
            <body className="relative">
                <div className="isolate">{children}</div>
                <ScrollRestoration />
                <Scripts />
            </body>
        </html>
    );
}

export function HydrateFallback() {
    return (
        <main
            aria-busy="true"
            aria-live="polite"
            className="grid min-h-svh place-items-center p-6"
        >
            <p className="text-sm text-muted-foreground" role="status">
                Loading Cloud Console…
            </p>
        </main>
    );
}

export default function App() {
    return <Outlet />;
}

export function ErrorBoundary({error}: Route.ErrorBoundaryProps) {
    let heading = "Something went wrong";
    let message = "The Cloud Console could not be displayed.";

    if (isRouteErrorResponse(error)) {
        heading = error.status === 404 ? "Page not found" : "Request failed";
        message =
            error.status === 404
                ? "The requested page does not exist."
                : error.statusText || message;
    }

    return (
        <main className="grid min-h-svh place-items-center p-6">
            <section
                aria-labelledby="error-heading"
                className="flex w-full max-w-lg flex-col gap-3"
            >
                <p className="text-sm font-medium text-muted-foreground">
                    Cloud Console
                </p>
                <h1 className="text-2xl font-semibold" id="error-heading">
                    {heading}
                </h1>
                <p className="text-muted-foreground">{message}</p>
            </section>
        </main>
    );
}
