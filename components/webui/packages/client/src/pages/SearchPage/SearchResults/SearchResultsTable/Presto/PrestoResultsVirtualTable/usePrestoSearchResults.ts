import usePrestoSearchState from "../../../../SearchState/Presto";


/**
 * Custom hook to get Presto search results streamed into client state.
 *
 * @return
 */
const usePrestoSearchResults = () => {
    return usePrestoSearchState((state) => state.prestoSearchResults);
};

export {usePrestoSearchResults};
