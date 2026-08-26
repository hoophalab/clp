import {
    expect,
    it,
} from "vitest";

import {readMetadataDbUri} from "../src/configuration.js";


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
