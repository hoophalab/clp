import usePrestoSearchState from "../../../SearchState/Presto";


/**
 * Custom hook to get Presto aggregation results streamed into client state.
 *
 * @return
 */
const usePrestoAggregationResults = () => {
    return usePrestoSearchState((state) => state.prestoAggregationResults);
};

export {usePrestoAggregationResults};
