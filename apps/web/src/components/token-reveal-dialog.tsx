import {useState} from "react";

import {
    CheckIcon,
    CopyIcon,
    TriangleAlertIcon,
} from "lucide-react";

import {
    Alert,
    AlertTitle,
} from "~/components/ui/alert";
import {Button} from "~/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "~/components/ui/dialog";
import {cn} from "~/lib/utils";


/**
 * Shows a freshly created token's plaintext, the only time it is ever shown.
 * Outside clicks and Escape do not close the dialog, so the token cannot be
 * lost to a stray click before it is copied.
 *
 * @param props
 * @param props.onDone Called when the user confirms they have the token.
 * @param props.plaintext The only copy of the token that will ever exist.
 * @return A dialog that only its Done button closes.
 */
const TokenRevealDialog = ({onDone, plaintext}: {
    onDone: () => void;
    plaintext: string;
}) => {
    const [hasCopied, setHasCopied] = useState(false);

    return (
        <Dialog
            disablePointerDismissal={true}
            open={true}
            onOpenChange={() => null}
        >
            <DialogContent
                className={"sm:max-w-md"}
                showCloseButton={false}
            >
                <DialogHeader>
                    <DialogTitle>Token created</DialogTitle>
                </DialogHeader>
                <Alert>
                    <TriangleAlertIcon/>
                    <AlertTitle>
                        Make sure to copy your API token now as you will not be able to see
                        this again.
                    </AlertTitle>
                </Alert>
                <div className={"flex items-start gap-2"}>
                    {/* Wrapped rather than scrolled so the whole token is
                        visible, and one click selects all of it. */}
                    <code
                        aria-label={"API token"}
                        className={cn(
                            "min-w-0 flex-1 select-all break-all rounded-lg border bg-muted",
                            "px-2.5 py-2 font-mono text-xs",
                        )}
                    >
                        {plaintext}
                    </code>
                    <Button
                        type={"button"}
                        variant={"outline"}
                        onClick={() => {
                            navigator.clipboard.writeText(plaintext)
                                .then(() => {
                                    setHasCopied(true);
                                })
                                .catch(() => {
                                    // The token stays selectable for copying by hand.
                                });
                        }}
                    >
                        {hasCopied ?
                            <CheckIcon data-icon={"inline-start"}/> :
                            <CopyIcon data-icon={"inline-start"}/>}
                        {hasCopied ?
                            "Copied" :
                            "Copy"}
                    </Button>
                </div>
                <DialogFooter>
                    <Button
                        type={"button"}
                        onClick={onDone}
                    >
                        Done
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};


export {TokenRevealDialog};
