import {useState} from "react";
import {Link} from "react-router";

import {InfoIcon} from "lucide-react";

import {
    DeploymentConfiguration,
    DeploymentReview,
    GettingStartedSteps,
} from "~/components/deployment-setup";
import {
    Alert,
    AlertDescription,
    AlertTitle,
} from "~/components/ui/alert";
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
import {cn} from "~/lib/utils";


/**
 * Shows deployment setup without offering unsupported provisioning operations.
 *
 * @return The deployment creation page.
 */
const CreateDeploymentPage = () => {
    const [name, setName] = useState("");
    const [nameTouched, setNameTouched] = useState(false);
    const nameInvalid = nameTouched && "" === name.trim();

    // The server has no creation or capabilities endpoint yet. Do not infer available
    // regions or starter defaults from sample deployments or operator CDK context.
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
                            setNameTouched(true);
                        }}
                    >
                        <FieldGroup className={"gap-8"}>
                            <Field data-invalid={nameInvalid}>
                                <FieldLabel htmlFor={"deployment-name"}>Deployment name</FieldLabel>
                                <Input
                                    aria-invalid={nameInvalid}
                                    autoComplete={"off"}
                                    className={"h-11"}
                                    id={"deployment-name"}
                                    name={"deploymentName"}
                                    placeholder={"my-first-deployment"}
                                    required={true}
                                    value={name}
                                    aria-describedby={nameInvalid ?
                                        "name-help name-error" :
                                        "name-help"}
                                    onBlur={() => {
                                        setNameTouched(true);
                                    }}
                                    onChange={(event) => {
                                        setName(event.target.value);
                                    }}/>
                                <FieldDescription id={"name-help"}>
                                    Use a descriptive name to identify this deployment later.
                                </FieldDescription>
                                {nameInvalid ?
                                    <FieldError id={"name-error"}>
                                        Enter a deployment name.
                                    </FieldError> :
                                    null}
                            </Field>
                            <DeploymentConfiguration/>
                        </FieldGroup>
                        <Separator className={"xl:mt-auto"}/>
                        <Alert role={"status"}>
                            <InfoIcon/>
                            <AlertTitle>Deployment creation is not available yet.</AlertTitle>
                            <AlertDescription>
                                You can review a name here, but cannot create a deployment yet.
                                Your changes are not saved.
                            </AlertDescription>
                        </Alert>
                        <div className={"flex flex-wrap items-center gap-4"}>
                            <Button
                                disabled={true}
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
                <DeploymentReview name={name}/>
            </div>
        </main>
    );
};

export default CreateDeploymentPage;
