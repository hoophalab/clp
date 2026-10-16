import {Link} from "react-router";

import {IAM_ROLE_ARN_PATTERN} from "@cloud.yscope.com/server/contracts";
import {
    CircleCheckIcon,
    InfoIcon,
    LoaderCircleIcon,
} from "lucide-react";

import {S3PolicyInstructions} from "~/components/s3-policy-instructions";
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
import {
    useS3Verification,
    VerificationStatus,
} from "~/hooks/use-s3-verification";
import type {S3Verifier} from "~/lib/s3-input";


type Props = {verifier: S3Verifier | null};

/**
 * Displays feedback tied to the current bucket and exact representative key.
 *
 * @param props
 * @param props.state
 * @return Verification feedback, without claiming ingestion or whole-bucket coverage.
 */
const VerificationFeedback = ({
    state,
}: Pick<ReturnType<typeof useS3Verification>, "state">) => {
    if (VerificationStatus.Pending === state.status) {
        return (
            <p
                className={"text-sm text-muted-foreground"}
                role={"status"}
            >
                Checking bucket listing and object access…
            </p>
        );
    }
    if (VerificationStatus.Error === state.status) {
        return (
            <Alert variant={"destructive"}>
                <AlertTitle>Could not verify S3 access</AlertTitle>
                <AlertDescription>
                    {state.message}
                </AlertDescription>
            </Alert>
        );
    }
    if (VerificationStatus.Verified === state.status) {
        return (
            <Alert role={"status"}>
                <CircleCheckIcon/>
                <AlertTitle>S3 access verified</AlertTitle>
                <AlertDescription>
                    Bucket listing and reading this object succeeded. Other objects may
                    have different permissions or encryption. No log ingestion has been
                    started.
                </AlertDescription>
            </Alert>
        );
    }

    return null;
};

/**
 * Renders the bucket and exact object-key fields with inline validation.
 *
 * @param props
 * @param props.form
 * @return The labeled input fields.
 */
const S3InputFields = ({form}: {form: ReturnType<typeof useS3Verification>}) => (
    <FieldGroup className={"gap-8"}>
        <Field
            data-invalid={form.touched.bucket && Boolean(form.errors.bucket)}
        >
            <FieldLabel htmlFor={"s3-bucket"}>Bucket name</FieldLabel>
            <Input
                aria-invalid={form.touched.bucket && Boolean(form.errors.bucket)}
                autoComplete={"off"}
                className={"h-11"}
                id={"s3-bucket"}
                placeholder={"my-log-bucket"}
                value={form.input.bucket}
                aria-describedby={
                    form.touched.bucket && form.errors.bucket ?
                        "bucket-help bucket-error" :
                        "bucket-help"
                }
                onBlur={() => {
                    form.blur("bucket");
                }}
                onChange={(event) => {
                    form.update("bucket", event.target.value);
                }}/>
            <FieldDescription id={"bucket-help"}>
                Enter the bucket name without s3:// or a path.
            </FieldDescription>
            {form.touched.bucket && form.errors.bucket ?
                (
                    <FieldError id={"bucket-error"}>
                        {form.errors.bucket}
                    </FieldError>
                ) :
                null}
        </Field>
        <Field data-invalid={form.touched.key && Boolean(form.errors.key)}>
            <FieldLabel htmlFor={"s3-key"}>
                Representative object key
            </FieldLabel>
            <Input
                aria-invalid={form.touched.key && Boolean(form.errors.key)}
                autoComplete={"off"}
                className={"h-11"}
                id={"s3-key"}
                placeholder={"logs/example.log"}
                value={form.input.key}
                aria-describedby={
                    form.touched.key && form.errors.key ?
                        "key-help key-error" :
                        "key-help"
                }
                onBlur={() => {
                    form.blur("key");
                }}
                onChange={(event) => {
                    form.update("key", event.target.value);
                }}/>
            <FieldDescription id={"key-help"}>
                The exact key of an existing, non-empty log object.
            </FieldDescription>
            {form.touched.key && form.errors.key ?
                (
                    <FieldError id={"key-error"}>
                        {form.errors.key}
                    </FieldError>
                ) :
                null}
        </Field>
    </FieldGroup>
);

/**
 * Renders the S3 input and permissions step for one deployment capability.
 *
 * @param props
 * @param props.verifier
 * @return The S3 input form and policy instructions.
 */
const S3VerificationForm = ({verifier}: Props) => {
    const form = useS3Verification(verifier);
    const pending = VerificationStatus.Pending === form.state.status;
    const idleLabel =
        VerificationStatus.Error === form.state.status ?
            "Retry verification" :
            "Verify access";

    return (
        <div
            className={"grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"}
        >
            <form
                aria-label={"S3 input verification"}
                className={"flex min-w-0 flex-col gap-8"}
                onSubmit={(event) => {
                    event.preventDefault();
                    form.verify();
                }}
            >
                <S3InputFields form={form}/>
                <VerificationFeedback state={form.state}/>
                <Separator/>
                {!verifier ?
                    (
                        <Alert role={"status"}>
                            <InfoIcon/>
                            <AlertTitle>S3 verification is not available yet.</AlertTitle>
                            <AlertDescription>
                                Verification requires a running deployment and its S3 access role.
                                You can enter bucket details here, but they will not be saved or
                                verified.
                            </AlertDescription>
                        </Alert>
                    ) :
                    null}
                <div className={"flex flex-wrap items-center gap-4"}>
                    <Button
                        size={"lg"}
                        type={"submit"}
                        variant={"brand-link"}
                        disabled={
                            !verifier ||
              pending ||
              Boolean(form.errors.bucket) ||
              Boolean(form.errors.key)
                        }
                    >
                        {pending ?
                            (
                                <LoaderCircleIcon
                                    className={"animate-spin motion-reduce:animate-none"}
                                    data-icon={"inline-start"}/>
                            ) :
                            null}
                        {pending ?
                            "Verifying access…" :
                            idleLabel}
                    </Button>
                    <Link
                        className={buttonVariants({variant: "brand-link", size: "lg"})}
                        to={"/"}
                    >
                        Back
                    </Link>
                </div>
                <p className={"text-sm text-muted-foreground"}>
                    Verification checks bucket listing and reads one byte from the
                    representative object.
                </p>
            </form>
            <S3PolicyInstructions
                bucket={form.input.bucket}
                verifier={verifier}/>
        </div>
    );
};

/**
 * Resets state when the deployment changes and rejects unusable role context.
 *
 * @param props
 * @param props.verifier The deployment-bound verifier, absent until the deployment is running with
 * a role.
 * @return A verification form scoped to the current deployment.
 */
const S3InputVerification = ({verifier}: Props) => {
    const available =
        verifier && verifier.deploymentId && IAM_ROLE_ARN_PATTERN.test(verifier.roleArn) ?
            verifier :
            null;

    return (
        <S3VerificationForm
            verifier={available}
            key={
                available ?
                    `${available.deploymentId}:${available.roleArn}` :
                    "unavailable"
            }/>
    );
};

export {S3InputVerification};
