import type {ApiTokenResponse} from "@cloud.yscope.com/server/contracts";
import {
    ArrowDownIcon,
    ArrowUpDownIcon,
    ArrowUpIcon,
} from "lucide-react";

import {Badge} from "~/components/ui/badge";
import {Button} from "~/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "~/components/ui/table";
import {
    type ApiTokenSortKey,
    formatCountdown,
    formatDateTime,
    formatRelativeTime,
    getApiTokenStatus,
    maskApiToken,
    neverExpires,
    TOKEN_STATUS_BADGES,
} from "~/lib/api-tokens";


type ApiTokenSort = {
    direction: "asc" | "desc";
    key: ApiTokenSortKey;
};

type ApiTokenTableProps = {
    now: Date;
    onSortChange: (sort: ApiTokenSort) => void;

    sort: ApiTokenSort;
    tokens: readonly ApiTokenResponse[];
};

type Column = {
    label: string;
    sortKey?: ApiTokenSortKey;
};

const COLUMNS: readonly Column[] = [
    {label: "Alias", sortKey: "alias"},
    {label: "Token"},
    {label: "Deployment", sortKey: "deployment"},
    {label: "Status", sortKey: "status"},
    {label: "Created", sortKey: "created_at"},
    {label: "Expires", sortKey: "expires_at"},
    {label: "Creator"},
];

/**
 * Renders a header cell that sorts the table when clicked.
 *
 * @param props
 * @param props.label
 * @param props.onSortChange
 * @param props.sort The active sort.
 * @param props.sortKey The key this column sorts by.
 * @return The header cell.
 */
const SortableHead = ({label, onSortChange, sort, sortKey}: {
    label: string;
    onSortChange: (sort: ApiTokenSort) => void;
    sort: ApiTokenSort;
    sortKey: ApiTokenSortKey;
}) => {
    const isActive = sort.key === sortKey;
    let Icon = ArrowUpDownIcon;
    let ariaSort: "ascending" | "descending" | undefined;

    if (isActive) {
        Icon = "asc" === sort.direction ?
            ArrowUpIcon :
            ArrowDownIcon;
        ariaSort = "asc" === sort.direction ?
            "ascending" :
            "descending";
    }

    return (
        <TableHead aria-sort={ariaSort}>
            <Button
                className={"-ml-2"}
                size={"sm"}
                type={"button"}
                variant={"ghost"}
                onClick={() => {
                    onSortChange({
                        direction: isActive && "asc" === sort.direction ?
                            "desc" :
                            "asc",
                        key: sortKey,
                    });
                }}
            >
                {label}
                <Icon data-icon={"inline-end"}/>
            </Button>
        </TableHead>
    );
};

/**
 * Renders an expiry with how far it is from now underneath.
 *
 * @param props
 * @param props.now
 * @param props.value An ISO 8601 timestamp.
 * @return The two-line cell content.
 */
const ExpiryCell = ({now, value}: {now: Date; value: string}) => (
    <div className={"flex flex-col"}>
        <span>
            {formatDateTime(value)}
        </span>
        <span className={"text-xs text-muted-foreground"}>
            {formatRelativeTime(new Date(value), now)}
        </span>
    </div>
);

/**
 * Renders the tokens as a sortable table.
 *
 * @param props
 * @param props.now Decides each token's status and countdown.
 * @param props.onSortChange
 * @param props.sort
 * @param props.tokens The tokens in display order.
 * @return A bordered table with one row per token.
 */
const ApiTokenTable = ({now, onSortChange, sort, tokens}: ApiTokenTableProps) => (

    // `contain-inline-size` stops the table's width from widening the page, so
    // a table wider than the screen scrolls inside this box instead.
    <div className={"overflow-hidden rounded-lg border contain-inline-size"}>
        <Table>
            <TableHeader>
                <TableRow>
                    {COLUMNS.map(({label, sortKey}) => (
                        "undefined" === typeof sortKey ?
                            <TableHead key={label}>
                                {label}
                            </TableHead> :
                            <SortableHead
                                key={label}
                                label={label}
                                sort={sort}
                                sortKey={sortKey}
                                onSortChange={onSortChange}/>
                    ))}
                </TableRow>
            </TableHeader>
            <TableBody>
                {tokens.map((token) => {
                    const status = getApiTokenStatus(token, now);
                    const badge = TOKEN_STATUS_BADGES[status];

                    return (
                        <TableRow key={token.id}>
                            <TableCell
                                className={"min-w-32 font-medium whitespace-normal wrap-anywhere"}
                            >
                                {token.alias}
                            </TableCell>
                            <TableCell className={"font-mono text-xs"}>
                                {maskApiToken(token)}
                            </TableCell>
                            <TableCell>
                                <div className={"flex flex-col"}>
                                    <span>
                                        {token.deployment_name}
                                    </span>
                                    <span className={"font-mono text-xs text-muted-foreground"}>
                                        {token.deployment_id}
                                    </span>
                                </div>
                            </TableCell>
                            <TableCell>
                                <div className={"flex flex-col gap-1"}>
                                    <Badge variant={badge.variant}>
                                        {badge.label}
                                    </Badge>
                                    {"revoking" === status ?
                                        <span
                                            className={"text-xs text-muted-foreground tabular-nums"}
                                        >
                                            May still work for up to
                                            {" "}
                                            {formatCountdown(token, now)}
                                        </span> :
                                        null}
                                </div>
                            </TableCell>
                            <TableCell>
                                {formatDateTime(token.created_at)}
                            </TableCell>
                            <TableCell>
                                {neverExpires(token) ?
                                    "Never" :
                                    <ExpiryCell
                                        now={now}
                                        value={token.expires_at}/>}
                            </TableCell>
                            {/* TODO: Resolve the creator's name once the Auth0
                                Management client (#78) is available. */}
                            <TableCell className={"text-muted-foreground"}>
                                {token.user_id}
                            </TableCell>
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    </div>
);


export {
    type ApiTokenSort,
    ApiTokenTable,
};
