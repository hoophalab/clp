import type {Db} from "mongodb";

import {
    type RegionDocument,
    REGIONS_COLLECTION,
} from "./metadata-db-schemas/region.js";


/**
 * Creates the indexes that enforce uniqueness and back the list queries.
 *
 * @param database Metadata database.
 */
const ensureIndexes = async (database: Db): Promise<void> => {
    await database.collection<RegionDocument>(REGIONS_COLLECTION).createIndex(
        {region: 1, cluster_id: 1},
        {name: "region_cluster_unique", unique: true},
    );
};

export {ensureIndexes};
