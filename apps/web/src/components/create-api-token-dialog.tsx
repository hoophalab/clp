import {
    type SyntheticEvent,
    useState,
} from "react";

import {
    ALIAS_LENGTH_MAX,
    type ApiTokenResponse,
    type DeploymentResponse,
    TOKEN_CREATION_BLOCKED_PHASES,
} from "@cloud.yscope.com/server/contracts";

import {TokenDeploymentField} from "~/components/token-deployment-field";
import {TokenExpiryField} from "~/components/token-expiry-field";
import {TokenRevealDialog} from "~/components/token-reveal-dialog";
import {Button} from "~/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "~/components/ui/dialog";
import {
    Field,
    FieldError,
    FieldLabel,
} from "~/components/ui/field";
import {Input} from "~/components/ui/input";
import {toast} from "~/components/ui/toast";
import {useApiClient} from "~/hooks/use-api-client";
import {createApiToken} from "~/hooks/use-api-tokens";
import {
    DEFAULT_EXPIRY_DAYS,
    resolveExpiry,
} from "~/lib/api-tokens";


type CreateApiTokenDialogProps = {

    /** The deployments the user owns, or null while they load. */
    deployments: readonly DeploymentResponse[] | null;

    /** Whether an alias is known to be taken on a deployment. */
    isAliasTaken: (deploymentId: string, alias: string) => boolean;
    onClose: () => void;
    onCreated: (token: ApiTokenResponse) => void;

    /** The page's deployment filter, selected up front. */
    preselectedDeploymentId: string | null;
};

type SubmitError = "alias_taken" | "deployment_unavailable";

const ALIAS_TAKEN_MESSAGE = "This alias is already used on this deployment. Revoked and expired " +
    "tokens keep their alias until they are deleted.";
const DEPLOYMENT_UNAVAILABLE_MESSAGE = "This deployment can no longer take tokens. Its status " +
    "changed after the list was loaded.";

/** Reports a creation request that did not succeed. */
const reportCreateFailure = () => {
    toast.add({
        description: "Try again in a moment.",
        title: "The token could not be created",
        type: "error",
    });
};

/**
 * Collects the deployment, alias, and expiry for a new token, then shows the
 * token once.
 *
 * @param props
 * @param props.deployments
 * @param props.isAliasTaken
 * @param props.onClose
 * @param props.onCreated
 * @param props.preselectedDeploymentId
 * @return The form dialog, or the reveal dialog once the token exists.
 */
// eslint-disable-next-line max-lines-per-function -- The fields share one validation state.
const CreateApiTokenDialog = ({
    deployments,
    isAliasTaken,
    onClose,
    onCreated,
    preselectedDeploymentId,
}: CreateApiTokenDialogProps) => {
    const api = useApiClient();
    const [deploymentId, setDeploymentId] = useState(preselectedDeploymentId);
    const [alias, setAlias] = useState("");
    const [expiryOption, setExpiryOption] = useState(String(DEFAULT_EXPIRY_DAYS));
    const [customDate, setCustomDate] = useState("");
    const [submitError, setSubmitError] = useState<SubmitError | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [plaintext, setPlaintext] = useState<string | null>(null);

    // Deleted deployments are hidden, except the one the page is filtered to,
    // which is shown so the user sees why it cannot be picked.
    const pickable = deployments?.filter(
        ({_id, status}) => "DELETED" !== status.phase || _id === preselectedDeploymentId,
    ) ?? null;
    const selected = pickable?.find(({_id}) => _id === deploymentId) ?? null;
    const trimmedAlias = alias.trim();
    const expiresAt = resolveExpiry(expiryOption, customDate);
    const isAliasKnownTaken = "alias_taken" === submitError ||
        (null !== selected && isAliasTaken(selected._id, trimmedAlias));
    const canSubmit = null !== selected &&
        !TOKEN_CREATION_BLOCKED_PHASES.has(selected.status.phase) &&
        "" !== trimmedAlias &&
        !isAliasKnownTaken &&
        null !== expiresAt &&
        !isSubmitting;

    const submit = (event: SyntheticEvent) => {
        event.preventDefault();
        if (!canSubmit) {
            return;
        }

        setIsSubmitting(true);
        createApiToken(api, {
            alias: trimmedAlias,
            deployment_id: selected._id,
            expires_at: expiresAt,
        })
            .then((result) => {
                if ("created" === result.outcome) {
                    // Only the reveal step may hold the plaintext.
                    const {plaintext_token: plaintextToken, ...token} = result.token;

                    onCreated(token);
                    setPlaintext(plaintextToken);
                } else if ("alias_taken" === result.outcome) {
                    setSubmitError("alias_taken");
                } else if ("deployment_unavailable" === result.outcome) {
                    setSubmitError("deployment_unavailable");
                } else {
                    reportCreateFailure();
                }
            })
            .catch(reportCreateFailure)
            .finally(() => {
                setIsSubmitting(false);
            });
    };

    if (null !== plaintext) {
        return (
            <TokenRevealDialog
                plaintext={plaintext}
                onDone={onClose}/>
        );
    }

    return (
        <Dialog
            open={true}
            onOpenChange={(isOpen) => {
                if (!isOpen) {
                    onClose();
                }
            }}
        >
            <DialogContent className={"sm:max-w-md"}>
                <form
                    className={"flex flex-col gap-4"}
                    onSubmit={submit}
                >
                    <DialogHeader>
                        <DialogTitle>Create an API token for a deployment</DialogTitle>
                    </DialogHeader>
                    <TokenDeploymentField
                        deployments={pickable}
                        selected={selected}
                        value={deploymentId}
                        error={"deployment_unavailable" === submitError ?
                            DEPLOYMENT_UNAVAILABLE_MESSAGE :
                            null}
                        onChange={(value) => {
                            setDeploymentId(value);
                            setSubmitError(null);
                        }}/>
                    <Field data-invalid={isAliasKnownTaken}>
                        <FieldLabel htmlFor={"token-alias"}>Alias</FieldLabel>
                        <Input
                            autoComplete={"off"}
                            id={"token-alias"}
                            maxLength={ALIAS_LENGTH_MAX}
                            placeholder={"A name to tell this token apart"}
                            required={true}
                            value={alias}
                            onChange={(event) => {
                                setAlias(event.target.value);
                                setSubmitError(null);
                            }}/>
                        {isAliasKnownTaken ?
                            <FieldError>
                                {ALIAS_TAKEN_MESSAGE}
                            </FieldError> :
                            null}
                    </Field>
                    <TokenExpiryField
                        customDate={customDate}
                        option={expiryOption}
                        onCustomDateChange={setCustomDate}
                        onOptionChange={setExpiryOption}/>
                    <DialogFooter>
                        <Button
                            type={"button"}
                            variant={"outline"}
                            onClick={onClose}
                        >
                            Cancel
                        </Button>
                        <Button
                            disabled={!canSubmit}
                            type={"submit"}
                        >
                            Create token
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};


export {CreateApiTokenDialog};
