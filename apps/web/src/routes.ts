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
            route("tokens", "routes/tokens.tsx"),
            route("s3-input", "routes/s3-input.tsx"),
        ]),
    ]),
] satisfies RouteConfig;
