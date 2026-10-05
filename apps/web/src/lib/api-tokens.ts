import type {
    ApiTokenResponse,
    ApiTokenStatus,
} from "@cloud.yscope.com/server/contracts";


type ApiTokenSortKey = "alias" | "created_at" | "deployment" | "expires_at" | "status";

type ApiTokenFilters = {
    query: string;
    sortDirection: "asc" | "desc";
    sortKey: ApiTokenSortKey;
    status: ApiTokenStatus | "all";
};

const TOKEN_PREFIX = "ysclp_";
const VISIBLE_SELECTOR_LENGTH = 11;
const MASKED_LENGTH = 12;
const MILLISECS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const MILLISECS_PER_MINUTE = 60_000;
const MILLISECS_PER_HOUR = 3_600_000;
const MILLISECS_PER_DAY = 86_400_000;
const DAYS_PER_MONTH = 30;
const DAYS_PER_YEAR = 365;
const MONTHS_PER_YEAR = 12;
const MILLISECS_PER_MONTH = DAYS_PER_MONTH * MILLISECS_PER_DAY;
const MILLISECS_PER_YEAR = DAYS_PER_YEAR * MILLISECS_PER_DAY;

// The auth server stores an actual date, so "no expiration" is a date far
// enough away that no one will be around to see it pass.
const NEVER_EXPIRES_AT = "9999-01-01T00:00:00.000Z";

const RELATIVE_TIME_FORMATTER = new Intl.RelativeTimeFormat("en-US", {numeric: "always"});
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
});

const TOKEN_STATUS_BADGES = {
    active: {label: "Active", variant: "success"},
    expired: {label: "Expired", variant: "outline"},
    revoking: {label: "Revoking", variant: "warning"},
} as const satisfies Record<ApiTokenStatus, {label: string; variant: string}>;

/**
 * Derives a token's status from its timestamps so that it stays correct as
 * time passes after the response arrived.
 *
 * @param token
 * @param now
 * @return The status at `now`.
 */
const getApiTokenStatus = (token: ApiTokenResponse, now: Date): ApiTokenStatus => {
    const endsAt = token.revocation_effective_at ?? token.expires_at;

    if (now.getTime() >= Date.parse(endsAt)) {
        return "expired";
    }

    return null === token.revoked_at ?
        "active" :
        "revoking";
};

/**
 * Renders the visible part of a token the way the plaintext shows it.
 *
 * @param token
 * @return The token prefix and the start of its ID, followed by asterisks.
 */
const maskApiToken = (token: ApiTokenResponse): string => (
    `${TOKEN_PREFIX}${token.id.slice(0, VISIBLE_SELECTOR_LENGTH)}${"*".repeat(MASKED_LENGTH)}`
);

/**
 * Whether the token uses the "no expiration" sentinel.
 *
 * @param token
 * @return Whether the token never expires.
 */
const neverExpires = (token: ApiTokenResponse): boolean => (
    Date.parse(token.expires_at) === Date.parse(NEVER_EXPIRES_AT)
);

/**
 * Describes how far a time is from now, such as "in 29 days" or "3 hours ago".
 *
 * Uses the smallest unit whose rounded count is below one of the next unit, so
 * 59.6 minutes reads "in 1 hour" rather than "in 60 minutes". Future and past
 * times round alike. The smallest unit is a minute, so the text holds still
 * between refreshes.
 *
 * @param target
 * @param now
 * @return The relative description.
 */
const formatRelativeTime = (target: Date, now: Date): string => {
    const deltaMillisecs = target.getTime() - now.getTime();
    const absMillisecs = Math.abs(deltaMillisecs);
    const sign = 0 > deltaMillisecs ?
        -1 :
        1;

    // Under half a minute rounds to zero, which would read "in 0 minutes".
    const minutes = Math.max(1, Math.round(absMillisecs / MILLISECS_PER_MINUTE));
    const hours = Math.round(absMillisecs / MILLISECS_PER_HOUR);
    const days = Math.round(absMillisecs / MILLISECS_PER_DAY);
    const months = Math.round(absMillisecs / MILLISECS_PER_MONTH);
    const years = Math.round(absMillisecs / MILLISECS_PER_YEAR);

    if (MINUTES_PER_HOUR > minutes) {
        return RELATIVE_TIME_FORMATTER.format(sign * minutes, "minute");
    }
    if (HOURS_PER_DAY > hours) {
        return RELATIVE_TIME_FORMATTER.format(sign * hours, "hour");
    }
    if (DAYS_PER_MONTH > days) {
        return RELATIVE_TIME_FORMATTER.format(sign * days, "day");
    }
    if (MONTHS_PER_YEAR > months) {
        return RELATIVE_TIME_FORMATTER.format(sign * months, "month");
    }

    return RELATIVE_TIME_FORMATTER.format(sign * years, "year");
};

/**
 * Formats a timestamp in the user's timezone.
 *
 * @param value An ISO 8601 timestamp.
 * @return The date and time, such as "Sep 29, 2026, 3:04 PM".
 */
const formatDateTime = (value: string): string => DATE_TIME_FORMATTER.format(new Date(value));

/**
 * Formats the time left until a revoked token is rejected everywhere, such as "0:42".
 *
 * @param token
 * @param now
 * @return Minutes and zero-padded seconds, never below "0:00".
 */
const formatCountdown = (token: ApiTokenResponse, now: Date): string => {
    const endsAt = Date.parse(token.revocation_effective_at ?? token.expires_at);
    const remainingSeconds = Math.max(
        0,
        Math.ceil((endsAt - now.getTime()) / MILLISECS_PER_SECOND),
    );
    const minutes = Math.floor(remainingSeconds / SECONDS_PER_MINUTE);
    const seconds = remainingSeconds % SECONDS_PER_MINUTE;

    return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

/**
 * Filters and orders tokens for the table.
 *
 * @param tokens
 * @param filters
 * @param now Decides each token's status.
 * @return A new array containing the matching tokens in display order.
 */
const filterApiTokens = (
    tokens: readonly ApiTokenResponse[],
    filters: ApiTokenFilters,
    now: Date,
): ApiTokenResponse[] => {
    const normalizedQuery = filters.query.trim().toLocaleLowerCase();
    const matchingTokens = tokens.filter((token) => {
        const matchesQuery = "" === normalizedQuery || [
            token.alias,
            token.deployment_id,
            token.deployment_name,
            maskApiToken(token),
        ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
        const matchesStatus = "all" === filters.status ||
            getApiTokenStatus(token, now) === filters.status;

        return matchesQuery && matchesStatus;
    });
    const direction = "asc" === filters.sortDirection ?
        1 :
        -1;

    return matchingTokens.sort((left, right) => {
        let comparison: number;

        switch (filters.sortKey) {
            case "alias":
                comparison = left.alias.localeCompare(right.alias);
                break;
            case "deployment":
                comparison = left.deployment_name.localeCompare(right.deployment_name);
                break;
            case "status":
                comparison = getApiTokenStatus(left, now)
                    .localeCompare(getApiTokenStatus(right, now));
                break;
            default:
                comparison = Date.parse(left[filters.sortKey]) - Date.parse(right[filters.sortKey]);
        }

        return direction * (0 === comparison ?
            left.id.localeCompare(right.id) :
            comparison);
    });
};


export {
    type ApiTokenSortKey,
    filterApiTokens,
    formatCountdown,
    formatDateTime,
    formatRelativeTime,
    getApiTokenStatus,
    maskApiToken,
    neverExpires,
    TOKEN_STATUS_BADGES,
};
