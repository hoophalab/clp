import {
    useEffect,
    useState,
} from "react";

import type {ProviderRegions} from "@cloud.yscope.com/server/contracts";

import type {ApiClient} from "~/lib/api-client";


/** A region a deployment can be created in, with the provider serving it. */
type Region = {
    cloudProvider: ProviderRegions["cloud_provider"];
    region: string;
};

type RegionCatalog = {

    /** Whether loading the regions failed. */
    hasLoadFailed: boolean;

    /** The regions deployments can be created in, or null while loading. */
    regions: readonly Region[] | null;
};

/**
 * Loads the regions deployments can be created in.
 *
 * @param api The API client.
 * @return The region catalog.
 */
const useRegions = (api: ApiClient): RegionCatalog => {
    const [catalog, setCatalog] = useState<RegionCatalog>({
        hasLoadFailed: false,
        regions: null,
    });

    useEffect(() => {
        let isActive = true;

        api.api.v1.regions.$get()
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error("Failed to load regions.");
                }

                // The catalog arrives grouped by provider; the select offers
                // one flat list.
                const availableRegions = (await response.json()).flatMap(
                    ({cloud_provider: cloudProvider, regions}) => regions.map(
                        (region) => ({cloudProvider: cloudProvider, region: region}),
                    ),
                );

                if (isActive) {
                    setCatalog({hasLoadFailed: false, regions: availableRegions});
                }
            })
            .catch(() => {
                if (isActive) {
                    setCatalog({hasLoadFailed: true, regions: null});
                }
            });

        return () => {
            isActive = false;
        };
    }, [api]);

    return catalog;
};


/**
 * Loads the regions and tracks which one is selected. The first region is
 * selected until the user picks another.
 *
 * @param api The API client.
 * @return The region catalog, the selected region, and a way to select one.
 */
const useRegionSelection = (api: ApiClient) => {
    const catalog = useRegions(api);
    const [chosenRegion, setChosenRegion] = useState<string | null>(null);
    const selectedRegion = catalog.regions?.find(
        ({region}) => region === chosenRegion,
    ) ??
        catalog.regions?.[0] ??
        null;

    return {
        ...catalog,
        selectedRegion: selectedRegion,
        setRegionId: setChosenRegion,
    };
};


export {
    type Region,
    useRegionSelection,
};
