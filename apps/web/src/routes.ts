import {
    index,
    layout,
    route,
    type RouteConfig,
} from "@react-router/dev/routes";


export default [
    layout("routes/authenticated-layout.tsx", [
        layout("routes/console-layout.tsx", [
            index("routes/deployments.tsx"),
            route("deployments/new", "routes/create-deployment.tsx"),
        ]),
    ]),
] satisfies RouteConfig;
