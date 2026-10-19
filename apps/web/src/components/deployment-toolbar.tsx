import {Link} from "react-router";

import {
    PlusIcon,
    RefreshCwIcon,
} from "lucide-react";

import {
    Button,
    buttonVariants,
} from "~/components/ui/button";
import {refreshDeployments} from "~/hooks/use-deployments";
import {cn} from "~/lib/utils";


/**
 * Supplies the inventory page's actions to the console header.
 *
 * @return Inventory-only header controls.
 */
const DeploymentToolbar = () => (
    <>
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
