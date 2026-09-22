import {reactRouter} from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import {defineConfig} from "vite";


export default defineConfig({
    envDir: "../..",

    // Avoid prerender failures in CI when the server binds to IPv6 but requests use IPv4.
    // Ref: https://github.com/remix-run/react-router/pull/15325
    preview: {host: "127.0.0.1"},
    resolve: {tsconfigPaths: true},
    plugins: [
        tailwindcss(),
        reactRouter(),
    ],
});
