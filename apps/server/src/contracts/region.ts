import * as z from "zod";


/**
 * The regions one cloud provider offers, as the console lists them.
 *
 * A region may be served by more than one cluster, but a customer never picks
 * between them: the cluster is an operational detail the create route resolves,
 * so a region appears once no matter how many clusters back it.
 */
const ProviderRegionsSchema = z.strictObject({
    cloud_provider: z.literal("aws"),
    regions: z.array(z.string()),
});

const ListRegionsResponseSchema = z.array(ProviderRegionsSchema);

type ListRegionsResponse = z.infer<typeof ListRegionsResponseSchema>;

type ProviderRegions = z.infer<typeof ProviderRegionsSchema>;

export {
    type ListRegionsResponse,
    ListRegionsResponseSchema,
    type ProviderRegions,
    ProviderRegionsSchema,
};
