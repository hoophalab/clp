import type {ReactNode} from "react";

import type {ApiTokenResponse} from "@cloud.yscope.com/server/contracts";
import {
    CircleAlertIcon,
    KeyRoundIcon,
    SearchXIcon,
} from "lucide-react";

import {
    type ApiTokenSort,
    ApiTokenTable,
} from "~/components/api-token-table";
import {
    Alert,
    AlertDescription,
    AlertTitle,
} from "~/components/ui/alert";
import {Button} from "~/components/ui/button";
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from "~/components/ui/empty";
import type {
    ApiTokenList,
    ApiTokenLoadFailure,
} from "~/hooks/use-api-tokens";


/**
 * Explains why the tokens could not be listed and offers a way out.
 *
 * @param props
 * @param props.failure
 * @param props.onClearFilter Clears the deployment filter.
 * @param props.onRetry Loads the tokens again.
 * @return A destructive alert with the matching action.
 */
const LoadFailureAlert = ({failure, onClearFilter, onRetry}: {
    failure: ApiTokenLoadFailure;
    onClearFilter: () => void;
    onRetry: () => void;
}) => (
    <Alert variant={"destructive"}>
        <CircleAlertIcon/>
        <AlertTitle>
            {"deployment" === failure ?
                "Deployment not found or you don't have access" :
                "API tokens could not be loaded"}
        </AlertTitle>
        <AlertDescription>
            <Button
                size={"sm"}
                type={"button"}
                variant={"outline"}
                onClick={"deployment" === failure ?
                    onClearFilter :
                    onRetry}
            >
                {"deployment" === failure ?
                    "Clear filter" :
                    "Retry"}
            </Button>
        </AlertDescription>
    </Alert>
);

/**
 * Renders a bordered empty state.
 *
 * @param props
 * @param props.description
 * @param props.icon
 * @param props.title
 * @return An icon, title, and description in a bordered box.
 */
const EmptyState = ({description, icon, title}: {
    description: string;
    icon: ReactNode;
    title: string;
}) => (
    <Empty className={"min-h-64 border"}>
        <EmptyHeader>
            <EmptyMedia variant={"icon"}>
                {icon}
            </EmptyMedia>
            <EmptyTitle size={"lg"}>
                {title}
            </EmptyTitle>
            <EmptyDescription>
                {description}
            </EmptyDescription>
        </EmptyHeader>
    </Empty>
);

/**
 * Renders the table, or the reason there is no table to show.
 *
 * @param props
 * @param props.list The token list as loaded.
 * @param props.now Decides each token's status.
 * @param props.onClearFilter Clears the deployment filter.
 * @param props.onSortChange
 * @param props.renderActions Renders a token's row actions.
 * @param props.sort
 * @param props.visibleTokens The tokens that match the filters, in order.
 * @return The table, an empty state, a loading message, or a failure alert.
 */
const TokenListContent = ({
    list,
    now,
    onClearFilter,
    onSortChange,
    renderActions,
    sort,
    visibleTokens,
}: {
    list: ApiTokenList;
    now: Date;
    onClearFilter: () => void;
    onSortChange: (sort: ApiTokenSort) => void;
    renderActions: (token: ApiTokenResponse) => ReactNode;
    sort: ApiTokenSort;
    visibleTokens: readonly ApiTokenResponse[];
}) => {
    if (null !== list.loadFailure) {
        return (
            <LoadFailureAlert
                failure={list.loadFailure}
                onClearFilter={onClearFilter}
                onRetry={list.reload}/>
        );
    }
    if (null === list.tokens) {
        return (
            <p
                className={"text-muted-foreground"}
                role={"status"}
            >
                Loading API tokens...
            </p>
        );
    }
    if (0 === list.tokens.length) {
        return (
            <EmptyState
                description={"Create a token to let tools send data to and query a deployment."}
                icon={<KeyRoundIcon/>}
                title={"No API tokens yet"}/>
        );
    }
    if (0 === visibleTokens.length) {
        return (
            <EmptyState
                description={"Adjust the search or filters to see more tokens."}
                icon={<SearchXIcon/>}
                title={"No API tokens found"}/>
        );
    }

    return (
        <ApiTokenTable
            now={now}
            renderActions={renderActions}
            sort={sort}
            tokens={visibleTokens}
            onSortChange={onSortChange}/>
    );
};


export {TokenListContent};
