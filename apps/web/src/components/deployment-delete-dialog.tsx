import {useState} from "react";

import {Dialog} from "@base-ui/react/dialog";
import type {DeploymentResponse} from "@cloud.yscope.com/server/contracts";
import {
    LoaderCircleIcon,
    Trash2Icon,
} from "lucide-react";

import {Button} from "~/components/ui/button";
import {toast} from "~/components/ui/toast";
import {useApiClient} from "~/hooks/use-api-client";
import {
    deleteDeployment,
    refreshDeployments,
} from "~/hooks/use-deployments";
import {cn} from "~/lib/utils";


type DeploymentDeleteDialogProps = {
    deployment: DeploymentResponse;
    onOpenChange: (isOpen: boolean) => void;
};

/**
 * Confirms and submits a destructive deployment request.
 *
 * @param props Dialog properties.
 * @param props.deployment
 * @param props.onOpenChange
 * @return A destructive-action confirmation dialog.
 */
const DeploymentDeleteDialog = ({
    deployment,
    onOpenChange,
}: DeploymentDeleteDialogProps) => {
    const apiClient = useApiClient();
    const [isDeleting, setIsDeleting] = useState(false);
    const name = deployment.spec.deployment_name;
    const submitDelete = async () => {
        if (isDeleting) {
            return;
        }

        setIsDeleting(true);
        try {
            await deleteDeployment(apiClient, deployment._id);
            refreshDeployments();
            setIsDeleting(false);
            onOpenChange(false);
            toast.add({
                description: `${name} is being deleted.`,
                title: "Deletion requested",
                type: "success",
            });
        } catch {
            setIsDeleting(false);
            toast.add({
                description: "Try again in a moment.",
                title: "The deployment could not be deleted",
                type: "error",
            });
        }
    };

    return (
        <Dialog.Root
            open={true}
            onOpenChange={(open) => {
                if (!isDeleting) {
                    onOpenChange(open);
                }
            }}
        >
            <Dialog.Portal>
                <Dialog.Backdrop
                    className={cn(
                        "fixed inset-0 z-50 bg-black/20 transition-opacity duration-150",
                        "data-ending-style:opacity-0 data-starting-style:opacity-0",
                        "supports-backdrop-filter:backdrop-blur-xs",
                    )}/>
                <Dialog.Popup
                    role={"alertdialog"}
                    className={cn(
                        "fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-md",
                        "-translate-x-1/2 -translate-y-1/2 gap-5 rounded-lg border bg-popover",
                        "p-6 text-popover-foreground shadow-lg outline-none",
                        "transition duration-150",
                        "data-ending-style:scale-95 data-ending-style:opacity-0",
                        "data-starting-style:scale-95 data-starting-style:opacity-0",
                    )}
                >
                    <div className={"flex flex-col gap-2"}>
                        <Dialog.Title className={"text-base font-semibold"}>
                            {`Delete ${name}?`}
                        </Dialog.Title>
                        <Dialog.Description className={"text-sm text-muted-foreground"}>
                            This permanently deletes the deployment and its data.
                            This action cannot be undone.
                        </Dialog.Description>
                    </div>
                    <div className={"flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"}>
                        <Button
                            disabled={isDeleting}
                            type={"button"}
                            variant={"outline"}
                            onClick={() => {
                                onOpenChange(false);
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            aria-busy={isDeleting}
                            disabled={isDeleting}
                            type={"button"}
                            variant={"destructive"}
                            onClick={() => {
                                submitDelete().catch(() => {
                                    // submitDelete handles request failures.
                                });
                            }}
                        >
                            {isDeleting ?
                                <LoaderCircleIcon
                                    className={"animate-spin"}
                                    data-icon={"inline-start"}/> :
                                <Trash2Icon data-icon={"inline-start"}/>}
                            Delete
                        </Button>
                    </div>
                </Dialog.Popup>
            </Dialog.Portal>
        </Dialog.Root>
    );
};


export {DeploymentDeleteDialog};
