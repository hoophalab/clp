import {useMemo} from "react";
import {useSearchParams} from "react-router";

import {useAuth0} from "@auth0/auth0-react";
import {CircleAlertIcon} from "lucide-react";

import {S3InputVerification} from "~/components/s3-input-verification";
import {
    Alert,
    AlertDescription,
    AlertTitle,
} from "~/components/ui/alert";
import {Button} from "~/components/ui/button";
import {useApiClient} from "~/hooks/use-api-client";
import {useOwnedDeployments} from "~/hooks/use-owned-deployments";
import {
    type ConsoleRouteHandle,
    DEPLOYMENT_BREADCRUMBS,
} from "~/lib/console-route";
import {createS3Verifier} from "~/lib/s3-input";
import {cn} from "~/lib/utils";


const DEPLOYMENT_PARAM = "deployment";

const handle = {
    breadcrumbs: [...DEPLOYMENT_BREADCRUMBS,
        {label: "Connect your logs"}],
} satisfies ConsoleRouteHandle;

/**
 * Presents S3 setup for one of the user's deployments.
 *
 * The deployment comes from the `deployment` query parameter, or is the only deployment the user
 * owns. Verification stays unavailable until that deployment is running with an S3 access role.
 *
 * @return The protected S3 input setup page.
 */
const S3InputPage = () => {
    const apiClient = useApiClient();
    const {user} = useAuth0();
    const [searchParams] = useSearchParams();
    const {deployments, hasLoadFailed, reload} = useOwnedDeployments(apiClient, user?.sub ?? "");
    const onlyDeployment = 1 === deployments?.length ?
        deployments[0] :
        null;
    const deploymentId = searchParams.get(DEPLOYMENT_PARAM) ?? onlyDeployment?._id ?? null;
    const deployment = deployments?.find(({_id}) => _id === deploymentId) ?? null;
    const verifier = useMemo(
        () => (null === deployment ?
            null :
            createS3Verifier(apiClient, deployment)),
        [apiClient,
            deployment],
    );

    return (
        <main
            className={cn(
                "flex flex-1 flex-col gap-8 px-4 pb-8 pt-2",
                "lg:pl-11 lg:pr-9",
            )}
        >
            <div className={"flex flex-col gap-2"}>
                <h1 className={"text-3xl font-semibold tracking-tight"}>
                    Connect your logs
                </h1>
                <p className={"text-muted-foreground"}>
                    Connect your S3 bucket by granting your deployment read access, then
                    verify access with a representative log object.
                </p>
            </div>
            {hasLoadFailed ?
                <Alert variant={"destructive"}>
                    <CircleAlertIcon/>
                    <AlertTitle>Deployments could not be loaded</AlertTitle>
                    <AlertDescription>
                        <Button
                            size={"sm"}
                            type={"button"}
                            variant={"outline"}
                            onClick={reload}
                        >
                            Retry
                        </Button>
                    </AlertDescription>
                </Alert> :
                null}
            <S3InputVerification verifier={verifier}/>
        </main>
    );
};

export {handle};
export default S3InputPage;
