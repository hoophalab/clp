import {
    index,
    layout,
    type RouteConfig,
} from "@react-router/dev/routes";


export default [
    layout("routes/authenticated-layout.tsx", [
        layout("routes/console-layout.tsx", [index("routes/deployments.tsx")]),
    ]),
] satisfies RouteConfig;
