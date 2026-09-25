import type {Db} from "mongodb";

import {
    type DeploymentDocument,
    DEPLOYMENTS_COLLECTION,
} from "./metadata-db-schemas/deployment.js";
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
    await database.collection<DeploymentDocument>(DEPLOYMENTS_COLLECTION).createIndex(
        {"metadata.owner_id": 1, "spec.deployment_name": 1},
        {name: "owner_deployment_name_unique", unique: true},
    );
    await database.collection<DeploymentDocument>("deployments").createIndex(
        {"metadata.owner_id": 1, "metadata.created_at": 1, "_id": 1},
        {name: "owner_created_at"},
    );
    await database.collection<RegionDocument>(REGIONS_COLLECTION).createIndex(
        {region: 1, cluster_id: 1},
        {name: "region_cluster_unique", unique: true},
    );
};

export {ensureIndexes};
