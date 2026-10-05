import {useState} from "react";

import type {ApiTokenResponse} from "@cloud.yscope.com/server/contracts";
import {
    BanIcon,
    MoreHorizontalIcon,
    PencilIcon,
    Trash2Icon,
} from "lucide-react";

import {RenameApiTokenDialog} from "~/components/rename-api-token-dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import {Button} from "~/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {toast} from "~/components/ui/toast";
import {useApiClient} from "~/hooks/use-api-client";
import {
    deleteApiToken,
    revokeApiToken,
} from "~/hooks/use-api-tokens";
import {
    formatCountdown,
    getApiTokenStatus,
} from "~/lib/api-tokens";


type ApiTokenRowActionsProps = {

    /** Whether another of the caller's tokens on the deployment has the alias. */
    isAliasTaken: (alias: string) => boolean;

    /** Whether the caller created the token, which rename and delete require. */
    isCreator: boolean;

    /** Whether the caller owns the deployment, which also allows revoking. */
    isOwner: boolean;
    now: Date;
    onDeleted: (id: string) => void;
    onUpdated: (token: ApiTokenResponse) => void;
    token: ApiTokenResponse;
};

type OpenDialog = "delete" | "rename" | "revoke" | null;

// WARNING: The 60 seconds is the auth server's cache TTL. It must be kept in
// sync with:
// - `AUTH_SERVER_CACHE_TTL_SECONDS` in `apps/server/src/api-tokens/token.ts`
// - `accessCache.ttlSeconds` in `infra/auth-server/chart/values.yaml`
// - `DEFAULT_ACCESS_CACHE_TTL_SECONDS` in `infra/auth-server/src/main.rs`
const REVOKE_WARNING = "Tools using this token may keep working for up to 60 seconds. " +
    "The token cannot be reactivated.";

/**
 * Asks the user to confirm an action on a token.
 *
 * @param props
 * @param props.actionLabel
 * @param props.description
 * @param props.onCancel
 * @param props.onConfirm
 * @param props.title
 * @return The confirmation dialog.
 */
const ConfirmDialog = ({actionLabel, description, onCancel, onConfirm, title}: {
    actionLabel: string;
    description: string;
    onCancel: () => void;
    onConfirm: () => void;
    title: string;
}) => (
    <AlertDialog
        open={true}
        onOpenChange={(isOpen) => {
            if (!isOpen) {
                onCancel();
            }
        }}
    >
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>
                    {title}
                </AlertDialogTitle>
                <AlertDialogDescription>
                    {description}
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                    variant={"destructive"}
                    onClick={onConfirm}
                >
                    {actionLabel}
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
);

/**
 * Reports an action that did not succeed.
 *
 * @param title
 * @param description
 */
const reportFailure = (title: string, description = "Try again in a moment.") => {
    toast.add({description: description, title: title, type: "error"});
};

/**
 * Renders the actions the caller may take on a token: rename and delete for
 * its creator, revoke for its creator or the deployment's owner. Revoke is
 * offered while the token is active and delete once it is not, though delete
 * stays disabled while a revocation may still be honoured.
 *
 * @param props
 * @param props.isAliasTaken
 * @param props.isCreator
 * @param props.isOwner
 * @param props.now
 * @param props.onDeleted
 * @param props.onUpdated
 * @param props.token
 * @return A menu of the available actions, or null when there are none.
 */
// eslint-disable-next-line max-lines-per-function -- One menu, three actions, and their dialogs.
const ApiTokenRowActions = ({
    isAliasTaken,
    isCreator,
    isOwner,
    now,
    onDeleted,
    onUpdated,
    token,
}: ApiTokenRowActionsProps) => {
    const api = useApiClient();
    const [openDialog, setOpenDialog] = useState<OpenDialog>(null);
    const status = getApiTokenStatus(token, now);
    const showRevoke = (isCreator || isOwner) && "active" === status;
    const showDelete = isCreator && "active" !== status;

    if (!isCreator && !showRevoke) {
        return null;
    }

    const close = () => {
        setOpenDialog(null);
    };
    const revoke = () => {
        close();
        revokeApiToken(api, token.id)
            .then((revoked) => {
                if (null === revoked) {
                    throw new Error("The revocation failed.");
                }
                onUpdated(revoked);
            })
            .catch(() => {
                reportFailure("The token could not be revoked");
            });
    };
    const remove = () => {
        close();
        deleteApiToken(api, token.id)
            .then((outcome) => {
                if ("deleted" === outcome) {
                    onDeleted(token.id);
                } else if ("grace_period" === outcome) {
                    reportFailure(
                        "The token could not be deleted yet",
                        "This token is still in its revocation grace period. Try again shortly.",
                    );
                } else {
                    reportFailure("The token could not be deleted");
                }
            })
            .catch(() => {
                reportFailure("The token could not be deleted");
            });
    };

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger
                    render={
                        <Button
                            aria-label={`Actions for ${token.alias}`}
                            size={"icon-sm"}
                            type={"button"}
                            variant={"ghost"}/>
                    }
                >
                    <MoreHorizontalIcon/>
                </DropdownMenuTrigger>
                <DropdownMenuContent align={"end"}>
                    <DropdownMenuGroup>
                        {isCreator ?
                            <DropdownMenuItem
                                onClick={() => {
                                    setOpenDialog("rename");
                                }}
                            >
                                <PencilIcon/>
                                Rename
                            </DropdownMenuItem> :
                            null}
                        {showRevoke ?
                            <DropdownMenuItem
                                variant={"destructive"}
                                onClick={() => {
                                    setOpenDialog("revoke");
                                }}
                            >
                                <BanIcon/>
                                Revoke
                            </DropdownMenuItem> :
                            null}
                        {showDelete ?
                            <DropdownMenuItem
                                className={"tabular-nums"}
                                disabled={"revoking" === status}
                                variant={"destructive"}
                                onClick={() => {
                                    setOpenDialog("delete");
                                }}
                            >
                                <Trash2Icon/>
                                {"revoking" === status ?
                                    `Delete available in ${formatCountdown(token, now)}` :
                                    "Delete"}
                            </DropdownMenuItem> :
                            null}
                    </DropdownMenuGroup>
                </DropdownMenuContent>
            </DropdownMenu>
            {"rename" === openDialog ?
                <RenameApiTokenDialog
                    isAliasTaken={isAliasTaken}
                    token={token}
                    onClose={close}
                    onRenamed={onUpdated}/> :
                null}
            {"revoke" === openDialog ?
                <ConfirmDialog
                    actionLabel={"Revoke"}
                    description={REVOKE_WARNING}
                    title={`Revoke ${token.alias}?`}
                    onCancel={close}
                    onConfirm={revoke}/> :
                null}
            {"delete" === openDialog ?
                <ConfirmDialog
                    actionLabel={"Delete"}
                    description={"This cannot be undone."}
                    title={`Delete ${token.alias}?`}
                    onCancel={close}
                    onConfirm={remove}/> :
                null}
        </>
    );
};


export {ApiTokenRowActions};
