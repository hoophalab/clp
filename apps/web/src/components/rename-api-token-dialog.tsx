import {
    type SyntheticEvent,
    useState,
} from "react";

import {
    ALIAS_LENGTH_MAX,
    type ApiTokenResponse,
} from "@cloud.yscope.com/server/contracts";

import {Button} from "~/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
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
import {renameApiToken} from "~/hooks/use-api-tokens";


type RenameApiTokenDialogProps = {

    /** Whether another of the caller's tokens on the deployment has the alias. */
    isAliasTaken: (alias: string) => boolean;
    onClose: () => void;
    onRenamed: (token: ApiTokenResponse) => void;
    token: ApiTokenResponse;
};

const ALIAS_TAKEN_MESSAGE = "This alias is already used on this deployment. Revoked and expired " +
    "tokens keep their alias until they are deleted.";

/**
 * Renames a token.
 *
 * @param props
 * @param props.isAliasTaken
 * @param props.onClose
 * @param props.onRenamed
 * @param props.token
 * @return A dialog with the alias field.
 */
const RenameApiTokenDialog = ({
    isAliasTaken,
    onClose,
    onRenamed,
    token,
}: RenameApiTokenDialogProps) => {
    const api = useApiClient();
    const [alias, setAlias] = useState(token.alias);
    const [rejectedAlias, setRejectedAlias] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const trimmedAlias = alias.trim();
    const isTaken = trimmedAlias === rejectedAlias || isAliasTaken(trimmedAlias);
    const canSubmit = "" !== trimmedAlias &&
        trimmedAlias !== token.alias &&
        !isTaken &&
        !isSubmitting;

    const submit = (event: SyntheticEvent) => {
        event.preventDefault();
        if (!canSubmit) {
            return;
        }

        setIsSubmitting(true);
        renameApiToken(api, token.id, trimmedAlias)
            .then((result) => {
                if ("renamed" === result.outcome) {
                    onRenamed(result.token);
                    onClose();
                } else if ("alias_taken" === result.outcome) {
                    setRejectedAlias(trimmedAlias);
                } else {
                    throw new Error("The rename failed.");
                }
            })
            .catch(() => {
                toast.add({
                    description: "Try again in a moment.",
                    title: "The token could not be renamed",
                    type: "error",
                });
            })
            .finally(() => {
                setIsSubmitting(false);
            });
    };

    return (
        <Dialog
            open={true}
            onOpenChange={(isOpen) => {
                if (!isOpen) {
                    onClose();
                }
            }}
        >
            <DialogContent>
                <form
                    className={"flex flex-col gap-4"}
                    onSubmit={submit}
                >
                    <DialogHeader>
                        <DialogTitle>Rename token</DialogTitle>
                        <DialogDescription>
                            {`${token.alias} on ${token.deployment_name}`}
                        </DialogDescription>
                    </DialogHeader>
                    <Field data-invalid={isTaken}>
                        <FieldLabel htmlFor={"rename-alias"}>Alias</FieldLabel>
                        <Input
                            autoComplete={"off"}
                            id={"rename-alias"}
                            maxLength={ALIAS_LENGTH_MAX}
                            required={true}
                            value={alias}
                            onChange={(event) => {
                                setAlias(event.target.value);
                            }}/>
                        {isTaken ?
                            <FieldError>
                                {ALIAS_TAKEN_MESSAGE}
                            </FieldError> :
                            null}
                    </Field>
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
                            Rename
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};


export {RenameApiTokenDialog};
