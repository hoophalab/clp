import {Button} from "~/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "~/components/ui/card";


/**
 * Renders the Cloud Console landing page.
 *
 * @return The landing page.
 */
const Home = () => {
    return (
        <main className={"grid min-h-svh place-items-center bg-muted/30 p-6"}>
            <Card className={"w-full max-w-md"}>
                <CardHeader>
                    <CardTitle>
                        <h1>Cloud Console</h1>
                    </CardTitle>
                    <CardDescription>
                        A foundation for YScope cloud experiences.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p className={"text-muted-foreground"}>
                        The frontend workspace is ready for product development.
                    </p>
                </CardContent>
                <CardFooter>
                    <Button
                        disabled={true}
                        type={"button"}
                        variant={"outline"}
                    >
                        Console coming soon
                    </Button>
                </CardFooter>
            </Card>
        </main>
    );
};


export default Home;
