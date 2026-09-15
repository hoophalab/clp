import type {ReactNode} from "react";


type ConsoleBreadcrumb = {
    label: string;
    to?: string;
};

/** Metadata supplied by a page to the shared console header. */
type ConsoleRouteHandle = {
    breadcrumbs: readonly [ConsoleBreadcrumb, ...ConsoleBreadcrumb[]];
    toolbar?: ReactNode;
};

const DEPLOYMENT_BREADCRUMBS = [
    {label: "Operations"},
    {label: "Deployments", to: "/"},
] as const satisfies ConsoleRouteHandle["breadcrumbs"];


export {
    type ConsoleBreadcrumb, type ConsoleRouteHandle, DEPLOYMENT_BREADCRUMBS,
};
