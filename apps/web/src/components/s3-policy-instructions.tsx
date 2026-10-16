import {
    useRef,
    useState,
} from "react";

import {CopyIcon} from "lucide-react";

import {Button} from "~/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "~/components/ui/card";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "~/components/ui/tabs";
import {Textarea} from "~/components/ui/textarea";
import {
    buildS3PolicyCommand,
    buildS3PolicyStatement,
    type S3Verifier,
    validateS3Input,
} from "~/lib/s3-input";


type Props = {bucket: string; verifier: S3Verifier | null};

/**
 * Displays a selectable policy snippet with explicit clipboard feedback.
 *
 * @param props
 * @param props.text
 * @param props.label Accessible snippet name.
 * @return The snippet and its copy action.
 */
const PolicySnippet = ({text, label}: {text: string; label: string}) => {
    const [feedback, setFeedback] = useState("");
    const copying = useRef(false);
    return (
        <div className={"flex min-w-0 flex-col gap-3"}>
            <Textarea
                aria-label={label}
                className={"h-64 resize-y font-mono text-xs"}
                readOnly={true}
                value={text}/>
            <div className={"flex flex-wrap items-center gap-3"}>
                <Button
                    type={"button"}
                    variant={"outline"}
                    onClick={() => {
                        if (copying.current) {
                            return;
                        }
                        copying.current = true;
                        setFeedback("");
                        Promise.resolve()
                            .then(() => navigator.clipboard.writeText(text))
                            .then(() => {
                                setFeedback("Copied to clipboard.");
                            })
                            .catch(() => {
                                setFeedback("Could not copy. Select and copy the text above.");
                            })
                            .finally(() => {
                                copying.current = false;
                            });
                    }}
                >
                    <CopyIcon data-icon={"inline-start"}/>
                    {`Copy ${label}`}
                </Button>
                <span
                    className={"text-sm text-muted-foreground"}
                    role={"status"}
                >
                    {feedback}
                </span>
            </div>
        </div>
    );
};

/**
 * Explains policy setup without generating a policy for an unknown deployment role.
 *
 * @param props
 * @param props.bucket
 * @param props.verifier
 * @return The AWS Console and CLI setup instructions.
 */
const S3PolicyInstructions = ({bucket, verifier}: Props) => {
    const validBucket =
        "" === validateS3Input({bucket: bucket, key: "example"}).bucket;
    const policy =
        verifier && validBucket ?
            buildS3PolicyStatement(bucket, verifier.roleArn, verifier.deploymentId) :
            null;

    return (
        <Card className={"min-w-0"}>
            <CardHeader>
                <CardTitle>
                    <h2>Grant read access</h2>
                </CardTitle>
                <CardDescription>
                    Allow your deployment to list objects and read logs in this bucket.
                </CardDescription>
            </CardHeader>
            <CardContent className={"flex min-w-0 flex-col gap-6"}>
                <div className={"flex min-w-0 flex-col gap-2"}>
                    <h3 className={"text-sm font-medium"}>S3 access role ARN</h3>
                    <code className={"break-all rounded-lg bg-muted p-3 text-xs"}>
                        {verifier?.roleArn ?? "Available after a deployment is created."}
                    </code>
                </div>
                <Tabs defaultValue={"console"}>
                    <TabsList
                        aria-label={"Bucket policy setup method"}
                        className={"w-full"}
                    >
                        <TabsTrigger value={"console"}>AWS Console</TabsTrigger>
                        <TabsTrigger value={"cli"}>AWS CLI</TabsTrigger>
                    </TabsList>
                    <TabsContent
                        className={"flex min-w-0 flex-col gap-4 pt-3"}
                        value={"console"}
                    >
                        <p className={"text-sm text-muted-foreground"}>
                            In your bucket&apos;s Permissions tab, add this statement to the
                            bucket policy. Replace a statement with the same Sid and preserve
                            all other statements.
                        </p>
                        {validBucket ?
                            (
                                <a
                                    className={"text-sm text-brand underline underline-offset-4"}
                                    href={`https://s3.console.aws.amazon.com/s3/buckets/${encodeURIComponent(bucket)}?tab=permissions`}
                                    rel={"noreferrer"}
                                    target={"_blank"}
                                >
                                    Open bucket permissions in AWS Console
                                </a>
                            ) :
                            null}
                        {policy ?
                            (
                                <PolicySnippet
                                    key={policy}
                                    label={"policy statement"}
                                    text={policy}/>
                            ) :
                            (
                                <p className={"text-sm text-muted-foreground"}>
                                    A valid bucket name and deployment role are needed to generate
                                    the policy.
                                </p>
                            )}
                    </TabsContent>
                    <TabsContent
                        className={"flex min-w-0 flex-col gap-4 pt-3"}
                        value={"cli"}
                    >
                        <p className={"text-sm text-muted-foreground"}>
                            Requires AWS CLI, jq, and permission to edit the bucket policy.
                            Review the command before running it. It preserves unrelated
                            statements.
                        </p>
                        {policy ?
                            (
                                <PolicySnippet
                                    key={policy}
                                    label={"CLI command"}
                                    text={buildS3PolicyCommand(bucket, policy)}/>
                            ) :
                            (
                                <p className={"text-sm text-muted-foreground"}>
                                    A valid bucket name and deployment role are needed to generate
                                    the command.
                                </p>
                            )}
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
};

export {S3PolicyInstructions};
