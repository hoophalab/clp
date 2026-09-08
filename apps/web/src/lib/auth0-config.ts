type Auth0Config = {
    audience: string;
    clientId: string;
    domain: string;
};


/**
 * Reads a required public environment variable.
 *
 * @param name The identifier included in configuration errors.
 * @param value The untrusted Vite environment value.
 * @return The configured string value.
 * @throws {Error} When the value is absent or not a string.
 */
const requirePublicEnvironmentVariable = (
    name: string,
    value: unknown,
): string => {
    if ("string" !== typeof value || "" === value) {
        throw new Error(`${name} must be configured`);
    }

    return value;
};

/**
 * Reads the public Auth0 settings exposed to the browser by Vite.
 *
 * `VITE_AUTH0_API_AUDIENCE` must exactly match the server's `AUTH0_API_AUDIENCE`.
 * Otherwise, the server rejects the access tokens requested by the console.
 *
 * The values are read when this function runs so static HTML generation can import this module
 * without Auth0 configuration.
 *
 * @return The Auth0 tenant and API configuration.
 * @throws {Error} When a required Auth0 setting is absent.
 */
const readAuth0Config = (): Auth0Config => {
    return {
        audience: requirePublicEnvironmentVariable(
            "VITE_AUTH0_API_AUDIENCE",
            import.meta.env.VITE_AUTH0_API_AUDIENCE,
        ),
        clientId: requirePublicEnvironmentVariable(
            "VITE_AUTH0_CLIENT_ID",
            import.meta.env.VITE_AUTH0_CLIENT_ID,
        ),
        domain: requirePublicEnvironmentVariable(
            "VITE_AUTH0_DOMAIN",
            import.meta.env.VITE_AUTH0_DOMAIN,
        ),
    };
};


export {readAuth0Config};
