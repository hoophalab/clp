import {Hono} from "hono";
import type {Db} from "mongodb";

import {ListRegionsResponseSchema} from "../contracts/region.js";
import type {ServerEnv} from "../environment.js";
import {HTTP_STATUS_OK} from "../http-status.js";
import {
    type RegionDocument,
    RegionDocumentSchema,
    REGIONS_COLLECTION,
} from "../metadata-db-schemas/region.js";
import {parseContractResponse} from "../response-validation.js";


/**
 * Creates the public region catalog route.
 *
 * Only where a deployment can be created is returned. The cluster serving a
 * region, its starter release, and the cluster secret all stay server-side, so
 * a region backed by several clusters is listed once.
 *
 * @param database Metadata database.
 * @return The public route listing where deployments can be created.
 */
const createRegionRoutes = (database: Db) => new Hono<ServerEnv>()
    .get("/", async (context) => {
        const documents = await database
            .collection<RegionDocument>(REGIONS_COLLECTION)
            .find({})
            .sort({region: 1, cluster_id: 1})
            .toArray();

        const regionsByProvider = new Map<
            RegionDocument["cloud_provider"],
            Set<string>
        >();

        for (const document of documents) {
            const parsed = RegionDocumentSchema.safeParse(document);
            if (!parsed.success) {
                // One bad document must not hide every other region.
                console.error("Skipping invalid region document.", {
                    error: parsed.error.message,
                    regionId: document._id,
                });
                continue;
            }

            const regions = regionsByProvider.get(parsed.data.cloud_provider) ??
                new Set<string>();

            regions.add(parsed.data.region);
            regionsByProvider.set(parsed.data.cloud_provider, regions);
        }

        return context.json(
            parseContractResponse(
                ListRegionsResponseSchema,
                [...regionsByProvider].map(([cloudProvider, regions]) => ({
                    cloud_provider: cloudProvider,
                    regions: [...regions],
                })),
            ),
            HTTP_STATUS_OK,
        );
    });

export {createRegionRoutes};
