import {
    LoaderCircleIcon,
    LockKeyholeIcon,
    ShieldXIcon,
} from "lucide-react";

import {Button} from "~/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "~/components/ui/card";
import {YScopeLogo} from "~/components/yscope-logo";
import {cn} from "~/lib/utils";


const authenticationScreenClassName = cn(
    "grid min-h-svh place-items-center",
    "bg-background",
    "bg-radial-[at_50%_0%] from-brand/12",
    "via-background via-55% to-background",
    "px-4 py-6 sm:px-6 sm:py-10",
);

/**
 * Shows sign-in progress while Auth0 checks the session or redirects.
 *
 * @return The full-page loading screen.
 */
const AuthenticationLoadingScreen = () => {
    return (
        <main className={authenticationScreenClassName}>
            <section
                className={cn(
                    "flex w-full max-w-lg flex-col items-center gap-6 sm:gap-8",
                    "text-center",
                )}
            >
                <header className={"flex flex-col items-center gap-3 sm:gap-4"}>
                    <YScopeLogo className={"text-[2.475rem]"}/>
                    <p className={"text-3xl font-semibold tracking-tight sm:text-4xl"}>
                        Cloud Console
                    </p>
                </header>
                <Card
                    aria-labelledby={"authentication-loading-title"}
                    aria-live={"polite"}
                    role={"status"}
                    className={cn(
                        "w-full gap-6 py-8 shadow-xl shadow-brand/5",
                        "sm:gap-8 sm:py-12",
                    )}
                >
                    <CardHeader className={"justify-items-center gap-4 px-6 sm:gap-6 sm:px-10"}>
                        <LoaderCircleIcon
                            aria-hidden={"true"}
                            className={cn(
                                "size-16 animate-spin text-brand",
                                "motion-reduce:animate-none",
                            )}/>
                        <div className={"grid gap-2"}>
                            <CardTitle>
                                <h1
                                    id={"authentication-loading-title"}
                                    className={cn(
                                        "text-2xl font-semibold tracking-tight",
                                        "sm:text-3xl",
                                    )}
                                >
                                    Signing you in
                                </h1>
                            </CardTitle>
                            <CardDescription className={"text-base"}>
                                This may take a few seconds.
                            </CardDescription>
                        </div>
                    </CardHeader>
                    <CardContent
                        className={cn(
                            "flex items-center justify-center gap-3 text-sm",
                            "text-muted-foreground sm:text-base",
                        )}
                    >
                        <span
                            className={cn(
                                "grid size-9 shrink-0 place-items-center",
                                "rounded-full bg-brand/10 text-brand",
                            )}
                        >
                            <LockKeyholeIcon
                                aria-hidden={"true"}
                                className={"size-4"}/>
                        </span>
                        <span>Securely verifying your session.</span>
                    </CardContent>
                </Card>
            </section>
        </main>
    );
};

type AuthenticationSignInErrorScreenProps = {
    message: string;
    onRetry: () => void;
    onSignIn: () => void;
};

/**
 * Shows a sign-in error with actions to retry or start over.
 *
 * @param props The component properties.
 * @param props.message Text shown beneath the error heading.
 * @param props.onRetry Runs when the user retries the login.
 * @param props.onSignIn Runs when the user starts a new login.
 * @return The full-page sign-in error screen.
 */
const AuthenticationSignInErrorScreen = ({
    message,
    onRetry,
    onSignIn,
}: AuthenticationSignInErrorScreenProps) => {
    return (
        <main className={authenticationScreenClassName}>
            <section
                className={cn(
                    "flex w-full max-w-lg flex-col items-center gap-6 sm:gap-8",
                    "text-center",
                )}
            >
                <header className={"flex flex-col items-center gap-3 sm:gap-4"}>
                    <YScopeLogo className={"text-[2.475rem]"}/>
                    <p className={"text-3xl font-semibold tracking-tight sm:text-4xl"}>
                        Cloud Console
                    </p>
                </header>
                <Card
                    aria-labelledby={"authentication-error-title"}
                    role={"alert"}
                    className={cn(
                        "w-full gap-4 py-8 shadow-xl shadow-brand/5",
                        "sm:py-12",
                    )}
                >
                    <CardHeader className={"justify-items-center gap-4 px-6 sm:gap-6 sm:px-10"}>
                        <span
                            className={cn(
                                "grid size-16 place-items-center rounded-full",
                                "bg-destructive/10 text-destructive",
                            )}
                        >
                            <ShieldXIcon
                                aria-hidden={"true"}
                                className={"size-8"}/>
                        </span>
                        <div className={"grid gap-2"}>
                            <CardTitle>
                                <h1
                                    id={"authentication-error-title"}
                                    className={cn(
                                        "text-2xl font-semibold tracking-tight",
                                        "sm:text-3xl",
                                    )}
                                >
                                    Sign-in failed
                                </h1>
                            </CardTitle>
                            <CardDescription className={"break-words text-base"}>
                                {message}
                            </CardDescription>
                        </div>
                    </CardHeader>
                    <CardContent className={"px-6 pt-2 sm:px-10 sm:pt-6"}>
                        <Button
                            className={"w-full"}
                            size={"xl"}
                            type={"button"}
                            variant={"brand"}
                            onClick={onRetry}
                        >
                            Try again
                        </Button>
                    </CardContent>
                    <CardFooter className={"justify-center border-0 bg-transparent pt-0"}>
                        <Button
                            type={"button"}
                            variant={"brand-link"}
                            onClick={onSignIn}
                        >
                            Go back to sign-in
                        </Button>
                    </CardFooter>
                </Card>
                <p className={"text-sm text-muted-foreground"}>
                    Contact
                    {" "}
                    <a
                        className={"text-brand hover:underline"}
                        href={"mailto:support@yscope.com"}
                    >
                        support@yscope.com
                    </a>
                </p>
            </section>
        </main>
    );
};


export {
    AuthenticationLoadingScreen,
    AuthenticationSignInErrorScreen,
};
