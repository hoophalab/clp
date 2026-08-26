import {
    type PrestoQueryJob,
    type PrestoQueryJobCreation,
} from "@webui/common/schemas/presto-search";

import {SETTINGS_PRESTO_MAX_NUM_SEARCH_RESULTS} from "../../config";


const PRESTO_PROXY_PREFIX = "/api/presto";

interface PrestoColumn {
    name: string;
}

interface PrestoError {
    errorName?: string;
    message: string;
}

interface PrestoResponse {
    columns?: PrestoColumn[];
    data?: unknown[][];
    error?: PrestoError;
    id: string;
    nextUri?: string;
}

interface PrestoQueryHandlers {
    onData: (rows: Record<string, unknown>[], totalResultsCount: number) => void;
    onDone?: () => void;
    onError: (error: PrestoQueryError) => void;
    onQueryStarted: (queryId: string) => void;
}

interface ActiveQuery {
    abortController: AbortController;
    nextUri: string | null;
}

interface PrestoStreamState {
    columns: PrestoColumn[] | null;
    storedResultsCount: number;
    totalResultsCount: number;
}

class PrestoQueryError extends Error {
    readonly errorName: string | null;

    constructor (message: string, errorName: string | null = null) {
        super(message);
        this.name = "PrestoQueryError";
        this.errorName = errorName;
    }
}

const activeQueries = new Map<string, ActiveQuery>();

/**
 * Converts a URI returned by Presto into a same-origin URI through the reverse proxy.
 *
 * @param uri
 * @return
 */
const getProxyUri = (uri: string): string => {
    const parsedUri = new URL(uri);
    return `${PRESTO_PROXY_PREFIX}${parsedUri.pathname}${parsedUri.search}`;
};

/**
 * Fetches and validates a page from Presto.
 *
 * @param input
 * @param init
 * @return
 */
const fetchPage = async (input: string, init: RequestInit): Promise<PrestoResponse> => {
    const response = await fetch(input, init);
    if (false === response.ok) {
        throw new PrestoQueryError(`Presto request failed: HTTP ${response.status}`);
    }

    const page = await response.json() as PrestoResponse;
    if ("undefined" !== typeof page.error) {
        throw new PrestoQueryError(page.error.message, page.error.errorName ?? null);
    }

    return page;
};

/**
 * Converts a row array to an object keyed by its Presto column names.
 *
 * @param values
 * @param columns
 * @return
 */
const prestoRowToObject = (
    values: unknown[],
    columns: PrestoColumn[]
): Record<string, unknown> => Object.fromEntries(columns.map((column, index) => [
    column.name,
    values[index],
]));

/**
 * Transfers one Presto response page to the stream consumer.
 *
 * @param page
 * @param handlers
 * @param state
 * @throws {PrestoQueryError} If rows are returned without column metadata.
 */
const processPage = (
    page: PrestoResponse,
    handlers: PrestoQueryHandlers,
    state: PrestoStreamState
): void => {
    state.columns = page.columns ?? state.columns;
    const data = page.data ?? [];
    state.totalResultsCount += data.length;

    if (0 === data.length) {
        handlers.onData([], state.totalResultsCount);

        return;
    }
    if (null === state.columns) {
        throw new PrestoQueryError("Presto returned rows without column metadata");
    }

    const remainingSlots = SETTINGS_PRESTO_MAX_NUM_SEARCH_RESULTS - state.storedResultsCount;
    const {columns} = state;
    const rows = data
        .slice(0, Math.max(remainingSlots, 0))
        .map((values) => prestoRowToObject(values, columns));

    state.storedResultsCount += rows.length;
    handlers.onData(rows, state.totalResultsCount);
};

/**
 * Streams all remaining pages for a Presto query.
 *
 * @param firstPage
 * @param handlers
 * @param activeQuery
 */
const streamQuery = async (
    firstPage: PrestoResponse,
    handlers: PrestoQueryHandlers,
    activeQuery: ActiveQuery
): Promise<void> => {
    let page = firstPage;
    const state: PrestoStreamState = {
        columns: null,
        storedResultsCount: 0,
        totalResultsCount: 0,
    };

    try {
        for (;;) {
            processPage(page, handlers, state);

            if ("undefined" === typeof page.nextUri) {
                handlers.onDone?.();

                return;
            }

            activeQuery.nextUri = page.nextUri;
            page = await fetchPage(getProxyUri(page.nextUri), {
                signal: activeQuery.abortController.signal,
            });
        }
    } catch (error: unknown) {
        if (activeQuery.abortController.signal.aborted) {
            return;
        }
        handlers.onError(error instanceof PrestoQueryError ?
            error :
            new PrestoQueryError("Failed to stream Presto results"));
    } finally {
        activeQueries.delete(firstPage.id);
    }
};


/**
 * Submits a query to Presto and streams all result pages in the browser.
 *
 * @param payload
 * @param handlers
 * @return
 */
const submitQuery = async (
    payload: PrestoQueryJobCreation,
    handlers: PrestoQueryHandlers
): Promise<PrestoQueryJob> => {
    console.log("Submitting query:", JSON.stringify(payload));

    try {
        const abortController = new AbortController();
        const firstPage = await fetchPage(`${PRESTO_PROXY_PREFIX}/v1/statement`, {
            body: payload.queryString,
            headers: {"Content-Type": "text/plain"},
            method: "POST",
            signal: abortController.signal,
        });
        const activeQuery = {
            abortController: abortController,
            nextUri: firstPage.nextUri ?? null,
        };

        activeQueries.set(firstPage.id, activeQuery);
        handlers.onQueryStarted(firstPage.id);
        streamQuery(firstPage, handlers, activeQuery).catch((error: unknown) => {
            console.error("Unhandled Presto stream error:", error);
        });

        return {searchJobId: firstPage.id};
    } catch (error: unknown) {
        const queryError = error instanceof PrestoQueryError ?
            error :
            new PrestoQueryError("Failed to submit Presto query");

        handlers.onError(queryError);
        throw queryError;
    }
};


/**
 * Cancels a running query through Presto's native HTTP API.
 *
 * @param payload
 * @return
 */
const cancelQuery = async (
    payload: PrestoQueryJob
): Promise<void> => {
    console.log("Cancelling query:", JSON.stringify(payload));

    const activeQuery = activeQueries.get(payload.searchJobId);
    if ("undefined" === typeof activeQuery) {
        return;
    }

    activeQuery.abortController.abort();
    activeQueries.delete(payload.searchJobId);

    if (null !== activeQuery.nextUri) {
        const response = await fetch(getProxyUri(activeQuery.nextUri), {method: "DELETE"});
        if (false === response.ok) {
            throw new PrestoQueryError(`Failed to cancel Presto query: HTTP ${response.status}`);
        }
    }
};


export {
    cancelQuery,
    PrestoQueryError,
    submitQuery,
};
export type {PrestoQueryHandlers};
