import type * as cdk from "aws-cdk-lib/core";


// Resource names and quantities are validated by Kubernetes, not CDK.
export type ResourceQuantities = Record<string, unknown>;

/**
 * Reads a resource map supplied as a context object or a JSON object string.
 *
 * @param app CDK app.
 * @param key Context variable name without the "com.yscope.cloud/" prefix.
 * @param defaultValue Map used only when the context variable is unset.
 * @return Resource map, without validating its names or values.
 * @throws {Error} If the context value isn't an object or a JSON object string.
 */
export const getKubernetesResources = function (
    app: cdk.App,
    key: string,
    defaultValue: ResourceQuantities = {},
): ResourceQuantities {
    let value: unknown = app.node.tryGetContext(`com.yscope.cloud/${key}`);
    if ("undefined" === typeof value) {
        return defaultValue;
    }
    const errorMessage = `Invalid context variable: 'com.yscope.cloud/${key}'. ` +
        "Pass a resource map object or a JSON object string.";

    if ("string" === typeof value) {
        try {
            value = JSON.parse(value) as unknown;
        } catch {
            throw new Error(errorMessage);
        }
    }
    if (null === value || "object" !== typeof value || Array.isArray(value)) {
        throw new Error(errorMessage);
    }

    return value as ResourceQuantities;
};
