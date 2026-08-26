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

export {readMetadataDbUri};
