import {Link} from "react-router";

import {
    PlusIcon,
    RefreshCwIcon,
} from "lucide-react";

import {TrialDeploymentQuota} from "~/components/trial-deployment-quota";
import {
    Button,
    buttonVariants,
} from "~/components/ui/button";
import {refreshDeployments} from "~/hooks/use-deployments";
import type {DeploymentQuota} from "~/lib/deployment-quota";
import {SAMPLE_DEPLOYMENT_QUOTA} from "~/lib/sample-deployment-quota";
import {cn} from "~/lib/utils";


/**
 * Supplies the inventory page's quota and actions to the console header.
 *
 * @param props Inventory toolbar properties.
 * @param props.quota The account deployment quota.
 * @return Inventory-only header controls.
 */
const DeploymentToolbar = ({quota = SAMPLE_DEPLOYMENT_QUOTA}: {quota?: DeploymentQuota}) => (
    <>
        {"trial" === quota.mode ?
            <TrialDeploymentQuota quota={quota}/> :
            null}
        <Link
            aria-label={"Create Deployment"}
            className={cn(buttonVariants({size: "lg", variant: "brand"}), "shrink-0")}
            to={"/deployments/new"}
        >
            <PlusIcon data-icon={"inline-start"}/>
            <span className={"hidden sm:inline"}>Create Deployment</span>
        </Link>
        <Button
            aria-label={"Refresh deployments"}
            size={"icon-lg"}
            type={"button"}
            variant={"ghost"}
            onClick={refreshDeployments}
        >
            <RefreshCwIcon/>
        </Button>
    </>
);


export {DeploymentToolbar};
