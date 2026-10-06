import {useState} from "react";
import {
    Link,
    useNavigate,
} from "react-router";

import {HTTP_STATUS_CONFLICT} from "@cloud.yscope.com/server/contracts";

import {
    DeploymentConfiguration,
    DeploymentReview,
    GettingStartedSteps,
} from "~/components/deployment-setup";
import {
    Button,
    buttonVariants,
} from "~/components/ui/button";
import {
    Field,
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
} from "~/components/ui/field";
import {Input} from "~/components/ui/input";
import {Separator} from "~/components/ui/separator";
import {toast} from "~/components/ui/toast";
import {useApiClient} from "~/hooks/use-api-client";
import {useDeploymentName} from "~/hooks/use-deployment-name";
import {
    type Region,
    useRegionSelection,
} from "~/hooks/use-regions";
import type {ApiClient} from "~/lib/api-client";
import {
    type ConsoleRouteHandle,
    DEPLOYMENT_BREADCRUMBS,
} from "~/lib/console-route";
import {STARTER_WORKER_COUNT} from "~/lib/deployments";
import {cn} from "~/lib/utils";


const handle = {
    breadcrumbs: [...DEPLOYMENT_BREADCRUMBS,
        {label: "Create"}],
} satisfies ConsoleRouteHandle;

enum CreateDeploymentOutcome {
    Created = "created",
    Failed = "failed",
    NameTaken = "name_taken",
}

/**
 * Requests a starter deployment.
 *
 * @param api The API client.
 * @param name Name to provision.
 * @param region The region to deploy in.
 * @return The outcome of the request.
 */
const createDeployment = async (
    api: ApiClient,
    name: string,
    region: Region,
): Promise<CreateDeploymentOutcome> => {
    const response = await api.api.v1.deployments.$post({
        json: {
            cloud_provider: region.cloudProvider,
            deployment_name: name,
            num_compression_workers: STARTER_WORKER_COUNT,
            num_search_workers: STARTER_WORKER_COUNT,
            region: region.region,
        },
    });

    if (response.ok) {
        return CreateDeploymentOutcome.Created;
    }

    return HTTP_STATUS_CONFLICT === response.status ?
        CreateDeploymentOutcome.NameTaken :
        CreateDeploymentOutcome.Failed;
};

/** Reports a creation request that did not succeed. */
const reportCreateFailure = () => {
    toast.add({
        description: "Try again in a moment.",
        title: "The deployment could not be created",
        type: "error",
    });
};

type DeploymentNameFieldProps = {
    error: string | null;
    help: string;
    onBlur: () => void;
    onChange: (name: string) => void;
    value: string;
};

/**
 * Renders the deployment name input and its validation message.
 *
 * @param props Field properties.
 * @param props.error The message to show, or null while the name is valid or untouched.
 * @param props.help Guidance or availability, shown when there is no error.
 * @param props.onBlur Marks the field as touched.
 * @param props.onChange Receives the edited name.
 * @param props.value The current name.
 * @return A labeled input with either its validation error or its help text.
 */
const DeploymentNameField = ({
    error,
    help,
    onBlur,
    onChange,
    value,
}: DeploymentNameFieldProps) => (
    <Field data-invalid={null !== error}>
        <FieldLabel htmlFor={"deployment-name"}>Deployment name</FieldLabel>
        <Input
            aria-invalid={null !== error}
            autoComplete={"off"}
            className={"h-11"}
            id={"deployment-name"}
            name={"deploymentName"}
            placeholder={"my-first-deployment"}
            required={true}
            value={value}
            aria-describedby={null === error ?
                "name-description name-help" :
                "name-description name-error"}
            onBlur={onBlur}
            onChange={(event) => {
                onChange(event.target.value);
            }}/>
        <FieldDescription id={"name-description"}>
            A descriptive name for the deployment.
        </FieldDescription>
        {null === error ?
            <FieldDescription id={"name-help"}>
                {help}
            </FieldDescription> :
            <FieldError id={"name-error"}>
                {error}
            </FieldError>}
    </Field>
);

/**
 * Collects deployment details and requests provisioning.
 *
 * @return The deployment creation page.
 */
const CreateDeploymentPage = () => {
    const api = useApiClient();
    const navigate = useNavigate();
    const {
        hasLoadFailed: hasRegionLoadFailed,
        regions,
        selectedRegion,
        setRegionId,
    } = useRegionSelection(api);
    const name = useDeploymentName(api);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const submit = () => {
        name.touch();
        if (!name.isValid || null === selectedRegion || isSubmitting) {
            return;
        }

        setIsSubmitting(true);
        createDeployment(api, name.trimmed, selectedRegion)
            .then(async (outcome) => {
                if (CreateDeploymentOutcome.Created === outcome) {
                    toast.add({
                        description: `${name.trimmed} is being created. This takes a few minutes.`,
                        title: "Deployment requested",
                        type: "success",
                    });
                    await navigate("/");
                } else if (CreateDeploymentOutcome.NameTaken === outcome) {
                    name.markTaken();
                } else {
                    reportCreateFailure();
                }
            })
            .catch(reportCreateFailure)
            .finally(() => {
                setIsSubmitting(false);
            });
    };

    return (
        <main
            className={cn(
                "flex flex-1 flex-col gap-8 px-4 pb-8 pt-2",
                "lg:pl-11 lg:pr-9",
            )}
        >
            <div className={"flex flex-col gap-2"}>
                <h1 className={"text-3xl font-semibold tracking-tight"}>
                    Create your first deployment
                </h1>
                <p className={"text-muted-foreground"}>
                    A deployment is where your logs are stored and searched.
                </p>
            </div>
            <div
                className={cn(
                    "grid items-start gap-8 xl:flex-1",
                    "xl:grid-cols-[minmax(0,1.7fr)_minmax(18rem,1fr)]"
                )}
            >
                <div className={"flex min-w-0 flex-col gap-8 xl:self-stretch"}>
                    <GettingStartedSteps/>
                    <form
                        aria-label={"Deployment details"}
                        className={"flex flex-col gap-8 xl:flex-1"}
                        onSubmit={(event) => {
                            event.preventDefault();
                            submit();
                        }}
                    >
                        <FieldGroup className={"gap-8"}>
                            <DeploymentNameField
                                error={name.error}
                                help={name.help}
                                value={name.value}
                                onBlur={name.touch}
                                onChange={name.setValue}/>
                            <DeploymentConfiguration
                                hasLoadFailed={hasRegionLoadFailed}
                                regions={regions}
                                selectedRegion={selectedRegion}
                                onRegionChange={setRegionId}/>
                        </FieldGroup>
                        <Separator className={"xl:mt-auto"}/>
                        <div className={"flex flex-wrap items-center gap-4"}>
                            <Button
                                disabled={null === selectedRegion || isSubmitting}
                                size={"xl"}
                                type={"submit"}
                                variant={"brand"}
                            >
                                Create deployment
                            </Button>
                            <Link
                                className={buttonVariants({size: "lg", variant: "brand-link"})}
                                to={"/"}
                            >
                                Back
                            </Link>
                        </div>
                    </form>
                </div>
                <DeploymentReview
                    name={name.value}
                    selectedRegion={selectedRegion}/>
            </div>
        </main>
    );
};

export {handle};
export default CreateDeploymentPage;
