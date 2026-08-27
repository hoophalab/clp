import dayjs, {Dayjs} from "dayjs";

import {apiClient} from "../../../../api/search";


/**
 * Fetches the earliest and latest log entry timestamps ("all time" range)
 * from the configured storage engine (CLP or CLPS).
 *
 * @param selectedDatasets
 * @return
 * @throws {Error} If the request fails or the API server returns an unexpected response.
 */
const fetchAllTimeRange = async (selectedDatasets: string[]): Promise<[Dayjs, Dayjs]> => {
    // eslint-disable-next-line new-cap
    const {data, response} = await apiClient.GET("/metadata/time_range", {
        params: {query: {dataset: selectedDatasets.join(",")}},
    });

    if ("undefined" === typeof data) {
        throw new Error(`Failed to fetch time range: HTTP ${response.status}`);
    }

    return [
        dayjs.utc(data.begin_timestamp),
        dayjs.utc(data.end_timestamp),
    ];
};

export {fetchAllTimeRange};
