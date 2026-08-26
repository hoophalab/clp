import {
    PrestoQueryError,
    type PrestoQueryHandlers,
} from "../../../../../api/presto-search";
import useSearchStore from "../../../SearchState";
import usePrestoSearchState from "../../../SearchState/Presto";
import {SEARCH_UI_STATE} from "../../../SearchState/typings";


/**
 * Creates callbacks for the main guided-search result stream.
 *
 * @return
 */
const getGuidedSearchHandlers = (): PrestoQueryHandlers => {
    let queryId: string | null = null;

    return {
        onData: (rows, totalResultsCount) => {
            const {updateNumSearchResultsMetadata} = useSearchStore.getState();
            const {prestoSearchResults, updatePrestoSearchResults} =
                usePrestoSearchState.getState();
            const existingResults = prestoSearchResults ?? [];

            updatePrestoSearchResults([
                ...existingResults,
                ...rows.map((row, index) => ({
                    _id: `${queryId}-${existingResults.length + index}`,
                    row: row,
                })),
            ]);
            updateNumSearchResultsMetadata(totalResultsCount);
        },
        onDone: () => {
            const {searchJobId, searchUiState, updateSearchUiState} = useSearchStore.getState();

            if (searchJobId === queryId && searchUiState === SEARCH_UI_STATE.QUERYING) {
                updateSearchUiState(SEARCH_UI_STATE.DONE);
            }
        },
        onError: (error: PrestoQueryError) => {
            const {searchJobId, updateSearchUiState} = useSearchStore.getState();

            if (null !== queryId && searchJobId !== queryId) {
                return;
            }

            const {updateErrorMsg, updateErrorName} = usePrestoSearchState.getState();

            updateErrorMsg(error.message);
            updateErrorName(error.errorName ?? "Search Failed");
            updateSearchUiState(SEARCH_UI_STATE.FAILED);
        },
        onQueryStarted: (newQueryId) => {
            queryId = newQueryId;
            const {updateSearchJobId, updateSearchUiState} = useSearchStore.getState();

            updateSearchJobId(newQueryId);
            updateSearchUiState(SEARCH_UI_STATE.QUERYING);
        },
    };
};

/**
 * Creates callbacks for the guided-search timeline stream.
 *
 * @return
 */
const getGuidedAggregationHandlers = (): PrestoQueryHandlers => {
    let queryId: string | null = null;

    return {
        onData: (rows) => {
            if (useSearchStore.getState().aggregationJobId !== queryId) {
                return;
            }

            const {prestoAggregationResults, updatePrestoAggregationResults} =
                usePrestoSearchState.getState();

            updatePrestoAggregationResults([
                ...(prestoAggregationResults ?? []),
                ...rows.map((row) => ({
                    count: Number(row["count"]),
                    timestamp: Number(row["timestamp"]),
                })),
            ]);
        },
        onError: (error) => {
            if (useSearchStore.getState().aggregationJobId === queryId) {
                console.error("Failed to stream Presto aggregation results:", error);
            }
        },
        onQueryStarted: (newQueryId) => {
            queryId = newQueryId;
            useSearchStore.getState().updateAggregationJobId(newQueryId);
            usePrestoSearchState.getState().updatePrestoAggregationResults(null);
        },
    };
};


export {
    getGuidedAggregationHandlers,
    getGuidedSearchHandlers,
};
