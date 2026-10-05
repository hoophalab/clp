import {useState} from "react";
import {
    Link,
    useNavigate,
} from "react-router";

import {
    DeploymentNameSchema,
    HTTP_STATUS_CONFLICT,
} from "@cloud.yscope.com/server/contracts";

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
 * Validates a trimmed deployment name.
 *
 * @param name The trimmed deployment name.
 * @param takenName A name the server has already rejected as taken.
 * @return The validation message, or null when the name is acceptable.
 */
const getNameError = (name: string, takenName: string | null) => {
    if ("" === name) {
        return "Enter a deployment name.";
    }
    if (!DeploymentNameSchema.safeParse(name).success) {
        return "Use 5-32 lowercase letters, digits, or hyphens, starting and ending" +
            " with a letter or digit.";
    }
    if (name === takenName) {
        return "This name is already in use. Choose another name.";
    }

    return null;
};

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
    onBlur: () => void;
    onChange: (name: string) => void;
    value: string;
};

/**
 * Renders the deployment name input and its validation message.
 *
 * @param props Field properties.
 * @param props.error The message to show, or null while the name is valid or untouched.
 * @param props.onBlur Marks the field as touched.
 * @param props.onChange Receives the edited name.
 * @param props.value The current name.
 * @return A labeled input with help text and any validation error.
 */
const DeploymentNameField = ({error, onBlur, onChange, value}: DeploymentNameFieldProps) => (
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
                "name-help" :
                "name-help name-error"}
            onBlur={onBlur}
            onChange={(event) => {
                onChange(event.target.value);
            }}/>
        <FieldDescription id={"name-help"}>
            A descriptive name for the deployment.
        </FieldDescription>
        {null === error ?
            null :
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
    const [name, setName] = useState("");
    const [nameTouched, setNameTouched] = useState(false);
    const [takenName, setTakenName] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const trimmedName = name.trim();
    const nameError = getNameError(trimmedName, takenName);
    const nameInvalid = nameTouched && null !== nameError;

    const submit = () => {
        setNameTouched(true);
        if (null !== nameError || null === selectedRegion || isSubmitting) {
            return;
        }

        setIsSubmitting(true);
        createDeployment(api, trimmedName, selectedRegion)
            .then(async (outcome) => {
                if (CreateDeploymentOutcome.Created === outcome) {
                    toast.add({
                        description: `${trimmedName} is being created. This takes a few minutes.`,
                        title: "Deployment requested",
                        type: "success",
                    });
                    await navigate("/");
                } else if (CreateDeploymentOutcome.NameTaken === outcome) {
                    setTakenName(trimmedName);
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
                                value={name}
                                error={nameInvalid ?
                                    nameError :
                                    null}
                                onChange={setName}
                                onBlur={() => {
                                    setNameTouched(true);
                                }}/>
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
                    name={name}
                    selectedRegion={selectedRegion}/>
            </div>
        </main>
    );
};

export {handle};
export default CreateDeploymentPage;
