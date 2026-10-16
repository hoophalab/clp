import {MemoryRouter} from "react-router";

import {
    cleanup,
    fireEvent,
    render,
    screen,
    within,
} from "@testing-library/react";
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";

import {SAMPLE_DEPLOYMENTS as DEPLOYMENTS} from "~/lib/sample-deployments";
import DeploymentsPage from "~/routes/deployments";


const auth = vi.hoisted(() => ({useAuth0: vi.fn()}));

vi.mock("@auth0/auth0-react", () => auth);

/**
 * Answers the deployment list request with a fixed response.
 *
 * @param response The response the API returns.
 * @return The stubbed fetch.
 */
const stubApi = (response: Response) => {
    const fetch = vi.fn(() => Promise.resolve(response));

    vi.stubGlobal("fetch", fetch);

    return fetch;
};

beforeEach(() => {
    auth.useAuth0.mockReturnValue({
        getAccessTokenSilently: () => Promise.resolve("member-token"),
    });
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

describe("DeploymentsPage", () => {
    it("renders the deployments the API returns", async () => {
        const fetch = stubApi(Response.json({
            data: DEPLOYMENTS,
            limit: 100,
            page: 1,
            total: DEPLOYMENTS.length,
        }));

        render(<DeploymentsPage/>);

        expect(await screen.findAllByRole("article")).toHaveLength(DEPLOYMENTS.length);
        expect(fetch).toHaveBeenCalledWith(
            expect.stringContaining("/api/v1/deployments?limit=100"),
            expect.anything(),
        );
        expect(screen.getByText("Open").closest("a")).toHaveAttribute(
            "href",
            "https://logs-running.example.com",
        );
        expect(screen.getByRole("button", {name: "Wake Up"})).toBeVisible();
        expect(within(screen.getByRole("article", {name: "logs-failed"}))
            .getByText("Failed to create")).toBeVisible();

        const creatingCard = screen.getByRole("article", {name: "logs-creating"});

        expect(within(creatingCard).getByText("Creating")).toBeVisible();
        expect(within(creatingCard).getByText("4 compression · 4 search workers")).toBeVisible();

        const identity = within(screen.getByRole("article", {name: "logs-suspended"}))
            .getByRole("group", {name: "logs-suspended identity"});

        expect(within(identity).getByText("d4c2b8e7")).toBeVisible();
        expect(within(identity).getByRole("button", {name: "Copy logs-suspended ID"}))
            .toBeVisible();
    });

    it("filters the deployments by search text", async () => {
        stubApi(Response.json({
            data: DEPLOYMENTS,
            limit: 100,
            page: 1,
            total: DEPLOYMENTS.length,
        }));

        render(<DeploymentsPage/>);
        fireEvent.change(
            await screen.findByRole("searchbox", {name: "Search deployments"}),
            {target: {value: "eu-west"}},
        );

        expect(screen.getAllByRole("article")).toHaveLength(1);
        expect(screen.getByText("logs-creating")).toBeVisible();
        expect(screen.queryByText("logs-running")).not.toBeInTheDocument();
    });

    it("loads every page of deployments", async () => {
        const finalDeployment = {
            ...DEPLOYMENTS[0],
            _id: "final-page",
            spec: {
                ...DEPLOYMENTS[0].spec,
                deployment_name: "logs-final-page",
            },
        };
        const fetch = vi.fn((input: RequestInfo | URL) => {
            let url: string;

            if ("string" === typeof input) {
                url = input;
            } else if (input instanceof URL) {
                url = input.href;
            } else {
                ({url} = input);
            }
            const isSecondPage = url.includes("page=2");

            return Promise.resolve(Response.json({
                data: isSecondPage ?
                    [finalDeployment] :
                    DEPLOYMENTS,
                limit: 100,
                page: isSecondPage ?
                    2 :
                    1,
                total: DEPLOYMENTS.length + 1,
            }));
        });

        vi.stubGlobal("fetch", fetch);
        render(<DeploymentsPage/>);

        expect(await screen.findAllByRole("article")).toHaveLength(DEPLOYMENTS.length + 1);
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(fetch).toHaveBeenNthCalledWith(
            2,
            expect.stringContaining("page=2"),
            expect.anything(),
        );
    });
});

describe("DeploymentsPage deletion and failures", () => {
    it("requests deletion after the user confirms", async () => {
        const [deployment] = DEPLOYMENTS;
        const fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
            if ("DELETE" === init?.method) {
                return Promise.resolve(Response.json(deployment, {status: 202}));
            }

            return Promise.resolve(Response.json({
                data: DEPLOYMENTS,
                limit: 100,
                page: 1,
                total: DEPLOYMENTS.length,
            }));
        });

        vi.stubGlobal("fetch", fetch);
        render(
            <MemoryRouter>
                <DeploymentsPage/>
            </MemoryRouter>,
        );

        const card = await screen.findByRole("article", {name: "logs-running"});

        fireEvent.click(within(card).getByRole("button", {
            name: "More actions for logs-running",
        }));
        expect(screen.queryByRole("menuitem", {name: "View details"})).not.toBeInTheDocument();
        expect(await screen.findByRole("menuitem", {name: "Connect your logs"}))
            .toHaveAttribute("href", `/s3-input?deployment=${deployment._id}`);
        expect(await screen.findByRole("menuitem", {name: "Manage tokens"}))
            .toHaveAttribute("href", `/tokens?deployment=${deployment._id}`);
        fireEvent.click(await screen.findByRole("menuitem", {
            name: "Delete",
        }));

        expect(screen.getByRole("alertdialog")).toHaveTextContent(
            "This action cannot be undone.",
        );
        fireEvent.click(screen.getByRole("button", {name: "Delete"}));

        await vi.waitFor(() => {
            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining(`/api/v1/deployments/${deployment._id}`),
                expect.objectContaining({method: "DELETE"}),
            );
        });
    });

    it("reports a failed load", async () => {
        stubApi(new Response(null, {status: 500}));

        render(<DeploymentsPage/>);

        expect(await screen.findByText("Deployments could not be loaded")).toBeVisible();
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
});
