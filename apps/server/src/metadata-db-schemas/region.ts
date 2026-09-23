import * as z from "zod";


const REGIONS_COLLECTION = "regions";
const MAX_CLUSTER_ID_LENGTH = 16;

/**
 * One cluster that deployments can be placed on, and the release new deployments
 * on it start with. Operators maintain these documents directly in MongoDB;
 * each `(region, cluster_id)` pair is unique.
 *
 * Customers choose a region, never a cluster: the cluster is an operational
 * detail, so the create route resolves one for the region it is given.
 *
 * A deployment copies these defaults into its own spec when it is created, so
 * editing or removing a region document never changes existing deployments.
 */
const RegionDocumentSchema = z.strictObject({
    _id: z.string().min(1),
    cloud_provider: z.literal("aws"),

    // Names the cluster's stacks and resources; S3 bucket names built from it
    // must fit in 63 characters.
    cluster_id: z.string().max(MAX_CLUSTER_ID_LENGTH)
        .regex(/^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/u),

    defaults: z.strictObject({
        clp_image_tag: z.string().min(1),
        helm_chart_version: z.string().min(1),
    }),

    // An AWS region name. Constrained because deployment field paths and stack
    // names are derived from it.
    region: z.string().regex(/^[a-z]{2}(?:-[a-z]+)+-\d+$/u),
});

type RegionDocument = z.infer<typeof RegionDocumentSchema>;

export {
    type RegionDocument,
    RegionDocumentSchema,
    REGIONS_COLLECTION,
};
