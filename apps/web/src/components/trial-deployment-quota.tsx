import {GaugeIcon} from "lucide-react";

import {Progress} from "~/components/ui/progress";
import type {DeploymentQuota} from "~/lib/deployment-quota";
import {cn} from "~/lib/utils";


const PERCENT_SCALE = 100;

/**
 * Renders deployment usage against the trial deployment limit.
 *
 * @param props The quota to display.
 * @param props.quota
 * @return A compact plan and deployment-usage indicator.
 */
const TrialDeploymentQuota = ({quota}: {quota: Extract<DeploymentQuota, {mode: "trial"}>}) => {
    const percentage = 0 < quota.limit ?
        Math.min(PERCENT_SCALE, quota.used / quota.limit * PERCENT_SCALE) :
        null;
    const usageLabel = 0 === quota.limit ?
        "0 deployments allowed" :
        `${quota.used} / ${quota.limit}`;

    return (
        <div
            className={cn(
                "hidden min-w-64 items-center gap-3 rounded-lg border",
                "bg-background px-3 py-2 xl:flex",
            )}
        >
            <GaugeIcon className={"size-4 shrink-0"}/>
            <span className={"whitespace-nowrap text-sm font-medium"}>
                Trial plan
            </span>
            {null !== percentage ?
                <Progress
                    aria-label={"Trial plan deployment quota"}
                    aria-valuetext={`${quota.used} of ${quota.limit} deployments used`}
                    className={"w-20 shrink-0 gap-0"}
                    indicatorVariant={"brand"}
                    value={percentage}/> :
                null}
            <span className={"ml-auto whitespace-nowrap text-sm font-medium tabular-nums"}>
                {usageLabel}
                {0 === quota.limit ?
                    <span className={"sr-only"}>
                        {`; ${quota.used} used`}
                    </span> :
                    null}
            </span>
        </div>
    );
};


export {TrialDeploymentQuota};
