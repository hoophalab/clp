import {
    expect,
    it,
} from "vitest";

import {
    readAuth0Configuration,
    readMetadataDbUri,
} from "../src/configuration.js";


it("reads the trimmed Auth0 token contract from the environment", () => {
    expect(readAuth0Configuration({
        AUTH0_API_AUDIENCE: " https://api.example.test ",
        AUTH0_DOMAIN: " tenant.auth0.com ",
    })).toEqual({
        audience: "https://api.example.test",
        domain: "tenant.auth0.com",
    });
});

it.each([
    {
        environment: {AUTH0_API_AUDIENCE: "https://api.example.test"},
        name: "AUTH0_DOMAIN",
    },
    {
        environment: {
            AUTH0_API_AUDIENCE: "",
            AUTH0_DOMAIN: "tenant.auth0.com",
        },
        name: "AUTH0_API_AUDIENCE",
    },
])(
    "rejects a missing or blank $name",
    ({environment, name}) => {
        expect(() => readAuth0Configuration(environment)).toThrow(
            `${name} must be configured.`,
        );
    },
);

it("reads the complete MongoDB connection URI", () => {
    const uri = "mongodb://username:password@cluster.example.com:27017/cloud?tls=true&replicaSet=rs0&readPreference=secondaryPreferred&retryWrites=false";

    expect(readMetadataDbUri({MONGODB_URI: ` ${uri} `})).toBe(uri);
});

it.each([
    {},
    {MONGODB_URI: ""},
    {MONGODB_URI: "   "},
])("requires a non-blank MONGODB_URI", (environment) => {
    expect(() => readMetadataDbUri(environment)).toThrow(
        "MONGODB_URI must be configured",
    );
});
