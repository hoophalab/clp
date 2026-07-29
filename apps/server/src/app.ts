import {Hono} from "hono";


/**
 * Creates the Hono application with the service routes.
 *
 * @return The configured Hono application.
 */
const createApp = () => {
    const app = new Hono();

    app.get("/api/v1/health", (context) => context.json({status: "ok"}));

    return app;
};

export {createApp};
