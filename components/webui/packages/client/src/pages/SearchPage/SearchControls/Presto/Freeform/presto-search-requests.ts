import {
    type PrestoQueryJob,
    type PrestoQueryJobCreation,
} from "@webui/common/schemas/presto-search";
import {notification} from "antd";

import {
    cancelQuery,
    PrestoQueryError,
    type PrestoQueryHandlers,
    submitQuery,
} from "../../../../../api/presto-search";
import useSearchStore, {SEARCH_STATE_DEFAULT} from "../../../SearchState";
import usePrestoSearchState from "../../../SearchState/Presto";
import {PRESTO_SQL_INTERFACE} from "../../../SearchState/Presto/typings";
import {SEARCH_UI_STATE} from "../../../SearchState/typings";


/**
 * Clears current Presto query results from client state.
 */
const handlePrestoClearResults = () => {
    usePrestoSearchState.getState().updatePrestoSearchResults(null);
};

/**
 * Creates callbacks that transfer a Presto result stream into the search stores.
 *
 * @return
 */
const getPrestoQueryHandlers = (): PrestoQueryHandlers => {
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
            const errorName = error.errorName ?? "Search Failed";
            const {searchJobId, updateSearchUiState} = useSearchStore.getState();
            const {updateErrorMsg, updateErrorName} = usePrestoSearchState.getState();

            if (null !== queryId && searchJobId !== queryId) {
                return;
            }
            updateErrorMsg(error.message);
            updateErrorName(errorName);
            updateSearchUiState(SEARCH_UI_STATE.FAILED);
            notification.error({
                description: error.message,
                duration: 15,
                key: `search-failed-${queryId ?? "pending"}`,
                pauseOnHover: true,
                placement: "bottomRight",
                showProgress: true,
                title: errorName,
            });
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
 * Submits a new Presto query to server.
 *
 * @param payload
 */
const handlePrestoQuerySubmit = (payload: PrestoQueryJobCreation) => {
    const {
        updateNumSearchResultsTable,
        updateNumSearchResultsMetadata,
        updateSearchJobId,
        updateSearchUiState,
        searchUiState,
    } = useSearchStore.getState();

    // User should NOT be able to submit a new query while an existing query is in progress.
    if (
        searchUiState !== SEARCH_UI_STATE.DEFAULT &&
        searchUiState !== SEARCH_UI_STATE.DONE &&
        searchUiState !== SEARCH_UI_STATE.FAILED
    ) {
        console.error("Cannot submit query while existing query is in progress.");

        return;
    }

    handlePrestoClearResults();

    updateNumSearchResultsTable(SEARCH_STATE_DEFAULT.numSearchResultsTable);
    updateNumSearchResultsMetadata(SEARCH_STATE_DEFAULT.numSearchResultsMetadata);
    updateSearchJobId(SEARCH_STATE_DEFAULT.searchJobId);
    updateSearchUiState(SEARCH_UI_STATE.QUERY_ID_PENDING);

    submitQuery(payload, getPrestoQueryHandlers())
        .catch((err: unknown) => {
            console.error("Failed to submit query:", err);
        });
};


/**
 * Cancels an ongoing Presto search query on server.
 *
 * @param payload
 */
const handlePrestoQueryCancel = (payload: PrestoQueryJob) => {
    const {searchUiState, updateSearchUiState} = useSearchStore.getState();
    if (searchUiState !== SEARCH_UI_STATE.QUERYING) {
        console.error("Cannot cancel query if there is no ongoing query.");

        return;
    }

    updateSearchUiState(SEARCH_UI_STATE.DONE);
    cancelQuery(payload)
        .then(() => {
            console.debug("Query cancelled successfully");
        })
        .catch((err: unknown) => {
            console.error("Failed to cancel query:", err);
        });
};

/**
 * Handles switching to guided SQL interface by clearing results and resetting states.
 */
const handleSwitchToGuided = () => {
    const {
        searchUiState,
        updateSearchUiState,
        updateSearchJobId,
        updateNumSearchResultsTable,
        updateNumSearchResultsMetadata,
    } = useSearchStore.getState();
    const {setSqlInterface} = usePrestoSearchState.getState();

    setSqlInterface(PRESTO_SQL_INTERFACE.GUIDED);

    if (searchUiState === SEARCH_UI_STATE.DEFAULT) {
        return;
    }

    handlePrestoClearResults();

    updateSearchJobId(SEARCH_STATE_DEFAULT.searchJobId);
    updateNumSearchResultsTable(SEARCH_STATE_DEFAULT.numSearchResultsTable);
    updateNumSearchResultsMetadata(SEARCH_STATE_DEFAULT.numSearchResultsMetadata);

    updateSearchUiState(SEARCH_UI_STATE.DEFAULT);
};

export {
    handlePrestoQueryCancel,
    handlePrestoQuerySubmit,
    handleSwitchToGuided,
};
