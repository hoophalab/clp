import type {Auth0IdentityVerifierOptions} from "./auth0-identity-verifier.js";


/**
 * Reads the Auth0 verifier settings from the process environment.
 *
 * @param environment The process environment to read from.
 * @return The Auth0 identity verifier options.
 * @throws {Error} When either required setting is absent or blank.
 */
const readAuth0Configuration = (
    environment: NodeJS.ProcessEnv,
): Auth0IdentityVerifierOptions => {
    const audience = environment.AUTH0_API_AUDIENCE?.trim();
    const domain = environment.AUTH0_DOMAIN?.trim();

    if ("undefined" === typeof audience || "" === audience) {
        throw new Error("AUTH0_API_AUDIENCE must be configured.");
    }
    if ("undefined" === typeof domain || "" === domain) {
        throw new Error("AUTH0_DOMAIN must be configured.");
    }

    return {
        audience: audience,
        domain: domain,
    };
};

/**
 * Reads the complete MongoDB connection URI from the process environment.
 *
 * @param environment Process environment containing runtime configuration.
 * @return Trimmed MongoDB connection URI.
 * @throws When MONGODB_URI is absent or blank.
 */
const readMetadataDbUri = (
    environment: NodeJS.ProcessEnv,
): string => {
    const uri = environment.MONGODB_URI;

    if ("undefined" === typeof uri || "" === uri.trim()) {
        throw new Error("MONGODB_URI must be configured");
    }

    return uri.trim();
};

/**
 * Reads the secret used to derive deployment database credentials.
 *
 * @param environment Process environment containing runtime configuration.
 * @return The configured cluster secret.
 * @throws When CLUSTER_SECRET is absent or blank.
 */
const readClusterSecret = (
    environment: NodeJS.ProcessEnv,
): string => {
    const clusterSecret = environment.CLUSTER_SECRET?.trim();

    if (!clusterSecret) {
        throw new Error("CLUSTER_SECRET must be configured.");
    }

    return clusterSecret;
};

export {
    readAuth0Configuration,
    readClusterSecret,
    readMetadataDbUri,
};
