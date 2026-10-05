import {useState} from "react";
import {useSearchParams} from "react-router";

import {useAuth0} from "@auth0/auth0-react";
import type {ApiTokenStatus} from "@cloud.yscope.com/server/contracts";
import {
    CircleAlertIcon,
    RefreshCwIcon,
} from "lucide-react";

import {ApiTokenFilters} from "~/components/api-token-filters";
import {TokenListContent} from "~/components/api-token-list-content";
import type {ApiTokenSort} from "~/components/api-token-table";
import {
    Alert,
    AlertDescription,
    AlertTitle,
} from "~/components/ui/alert";
import {Button} from "~/components/ui/button";
import {useApiClient} from "~/hooks/use-api-client";
import {useApiTokens} from "~/hooks/use-api-tokens";
import {useNow} from "~/hooks/use-now";
import {useOwnedDeployments} from "~/hooks/use-owned-deployments";
import {
    filterApiTokens,
    getApiTokenStatus,
} from "~/lib/api-tokens";
import {
    API_TOKEN_BREADCRUMBS,
    type ConsoleRouteHandle,
} from "~/lib/console-route";
import {cn} from "~/lib/utils";


const handle = {
    breadcrumbs: API_TOKEN_BREADCRUMBS,
} satisfies ConsoleRouteHandle;

const DEPLOYMENT_PARAM = "deployment";
const DEFAULT_SORT: ApiTokenSort = {direction: "desc", key: "created_at"};

/**
 * Renders the page title and its actions.
 *
 * @param props
 * @param props.onRefresh Loads the tokens again.
 * @return The heading row.
 */
const ApiTokensHeader = ({onRefresh}: {onRefresh: () => void}) => (
    <div className={"flex items-start justify-between gap-4"}>
        <div className={"flex flex-col gap-1"}>
            <h1 className={"text-3xl font-semibold tracking-tight"}>API tokens</h1>
            <p className={"text-muted-foreground"}>
                Tokens let tools send data to and query your deployments.
            </p>
        </div>
        <div className={"flex shrink-0 items-center gap-2"}>
            <Button
                aria-label={"Refresh API tokens"}
                size={"icon-lg"}
                type={"button"}
                variant={"ghost"}
                onClick={onRefresh}
            >
                <RefreshCwIcon/>
            </Button>
        </div>
    </div>
);

/**
 * Lists the caller's API tokens with search, filters, and sortable columns.
 *
 * @return The page's heading, filters, and token table.
 */
const ApiTokensPage = () => {
    const api = useApiClient();
    const {user} = useAuth0();
    const [searchParams, setSearchParams] = useSearchParams();
    const deploymentId = searchParams.get(DEPLOYMENT_PARAM);
    const tokenList = useApiTokens(api, deploymentId);
    const ownedDeployments = useOwnedDeployments(api, user?.sub ?? "");
    const [query, setQuery] = useState("");
    const [status, setStatus] = useState<ApiTokenStatus | "all">("all");
    const [sort, setSort] = useState(DEFAULT_SORT);
    const tokens = tokenList.tokens ?? [];
    const now = useNow(
        tokens.some((token) => "revoking" === getApiTokenStatus(token, new Date())),
    );
    const visibleTokens = filterApiTokens(
        tokens,
        {query: query, sortDirection: sort.direction, sortKey: sort.key, status: status},
        now,
    );
    const setDeploymentId = (id: string | null) => {
        setSearchParams(null === id ?
            {} :
            {[DEPLOYMENT_PARAM]: id});
    };

    return (
        <main
            className={cn(
                "flex flex-1 flex-col gap-8 px-4 pb-4 pt-2",
                "lg:pb-8 lg:pl-11 lg:pr-9",
            )}
        >
            <ApiTokensHeader onRefresh={tokenList.reload}/>
            {ownedDeployments.hasLoadFailed ?
                <Alert variant={"destructive"}>
                    <CircleAlertIcon/>
                    <AlertTitle>Deployments could not be loaded</AlertTitle>
                    <AlertDescription>
                        <Button
                            size={"sm"}
                            type={"button"}
                            variant={"outline"}
                            onClick={ownedDeployments.reload}
                        >
                            Retry
                        </Button>
                    </AlertDescription>
                </Alert> :
                null}
            <div className={"flex flex-col gap-6"}>
                <ApiTokenFilters
                    deploymentId={deploymentId}
                    deployments={ownedDeployments.deployments ?? []}
                    query={query}
                    status={status}
                    onDeploymentChange={setDeploymentId}
                    onQueryChange={setQuery}
                    onStatusChange={setStatus}/>
                <TokenListContent
                    list={tokenList}
                    now={now}
                    sort={sort}
                    visibleTokens={visibleTokens}
                    onSortChange={setSort}
                    onClearFilter={() => {
                        setDeploymentId(null);
                    }}/>
            </div>
        </main>
    );
};


export {handle};
export default ApiTokensPage;
