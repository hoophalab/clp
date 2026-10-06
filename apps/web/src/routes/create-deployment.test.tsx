import {
    MemoryRouter,
    Route,
    Routes,
} from "react-router";

import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import {
    afterEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";

import CreateDeploymentPage from "~/routes/create-deployment";


const REGIONS = [
    {
        cloud_provider: "aws",
        regions: ["ca-central-1",
            "us-east-2"],
    },
];

// Longer than the name check's debounce.
const NAME_CHECK_WAIT_MS = 400;

const auth = vi.hoisted(() => ({useAuth0: vi.fn()}));

vi.mock("@auth0/auth0-react", () => auth);

/**
 * Answers the region catalog, name check, and deployment creation requests.
 *
 * @param regions The catalog the API reports.
 * @param createResponse The response to a creation request.
 * @param isNameAvailable Whether the name check reports names as free.
 * @return The stubbed fetch.
 */
const stubApi = (
    regions: unknown = REGIONS,
    createResponse = new Response(null, {status: 202}),
    isNameAvailable = true,
) => {
    const fetch = vi.fn((url: string, init?: RequestInit) => {
        if ("POST" === init?.method) {
            return Promise.resolve(createResponse);
        }

        return Promise.resolve(Response.json(url.includes("/check-name") ?
            {available: isNameAvailable, reason: null} :
            regions));
    });

    auth.useAuth0.mockReturnValue({
        getAccessTokenSilently: () => Promise.resolve("test-token"),
    });
    vi.stubGlobal("fetch", fetch);

    return fetch;
};

/**
 * Enters a name and submits the form once the regions have loaded.
 *
 * @param name The deployment name to submit.
 */
const submitName = async (name: string) => {
    fireEvent.change(screen.getByRole("textbox", {name: "Deployment name"}), {
        target: {value: name},
    });
    await waitFor(() => {
        expect(screen.getByRole("button", {name: "Create deployment"})).toBeEnabled();
    });
    fireEvent.submit(screen.getByRole("form", {name: "Deployment details"}));
};

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

describe("CreateDeploymentPage", () => {
    it("keeps the review synchronized and validates an empty name on blur", () => {
        stubApi();
        render(
            <MemoryRouter>
                <CreateDeploymentPage/>
            </MemoryRouter>
        );
        const name = screen.getByRole("textbox", {name: "Deployment name"});
        const review = screen.getByRole("complementary", {name: "Review deployment"});
        fireEvent.change(name, {target: {value: "application-logs"}});
        expect(within(review).getByText("application-logs")).toBeVisible();
        fireEvent.change(name, {target: {value: "   "}});
        fireEvent.blur(name);
        expect(name).toHaveAttribute("aria-invalid", "true");
        expect(screen.getByRole("alert")).toHaveTextContent("Enter a deployment name.");
        expect(within(review).getByText("Not entered")).toBeVisible();
        fireEvent.change(name, {target: {value: "service-logs"}});
        expect(name).toHaveAttribute("aria-invalid", "false");
        expect(within(review).getByText("service-logs")).toBeVisible();
    });

    it("offers the regions the API reports", async () => {
        stubApi();
        render(
            <MemoryRouter>
                <CreateDeploymentPage/>
            </MemoryRouter>
        );
        const review = screen.getByRole("complementary", {name: "Review deployment"});

        expect(await within(review).findByText("ca-central-1")).toBeVisible();
        expect(screen.getByRole("combobox", {name: "Region"})).toBeEnabled();
    });

    it("reports an empty catalog and keeps the region select disabled", async () => {
        stubApi([]);
        render(
            <MemoryRouter>
                <CreateDeploymentPage/>
            </MemoryRouter>
        );

        expect(await screen.findByText("No regions are available yet.")).toBeVisible();
        expect(screen.getByRole("combobox", {name: "Region"})).toBeDisabled();
    });

    it("requests a starter deployment and returns to the inventory", async () => {
        const fetch = stubApi();
        render(
            <MemoryRouter initialEntries={["/deployments/new"]}>
                <Routes>
                    <Route
                        element={<CreateDeploymentPage/>}
                        path={"/deployments/new"}/>
                    <Route
                        element={<p>Inventory</p>}
                        path={"/"}/>
                </Routes>
            </MemoryRouter>
        );

        await submitName("application-logs");

        expect(await screen.findByText("Inventory")).toBeVisible();
        expect(fetch).toHaveBeenCalledWith(
            expect.stringContaining("/api/v1/deployments"),
            expect.objectContaining({
                body: JSON.stringify({
                    cloud_provider: "aws",
                    deployment_name: "application-logs",
                    num_compression_workers: 4,
                    num_search_workers: 4,
                    region: "ca-central-1",
                }),
                method: "POST",
            }),
        );
    });

    it("rejects a malformed name without calling the API", async () => {
        const fetch = stubApi();
        render(
            <MemoryRouter>
                <CreateDeploymentPage/>
            </MemoryRouter>
        );

        await submitName("Bad_Name");

        expect(screen.getByRole("alert")).toHaveTextContent(
            "Use only lowercase letters, numbers, and hyphens.",
        );
        expect(fetch).not.toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({method: "POST"}),
        );
    });

    it("reports a name the server has already taken", async () => {
        stubApi(REGIONS, new Response(null, {status: 409}));
        render(
            <MemoryRouter>
                <CreateDeploymentPage/>
            </MemoryRouter>
        );

        await submitName("application-logs");

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "\"application-logs\" is already in use.",
        );
    });
});

describe("CreateDeploymentPage name availability", () => {
    it("reports availability while the name is typed", async () => {
        stubApi();
        render(
            <MemoryRouter>
                <CreateDeploymentPage/>
            </MemoryRouter>
        );

        fireEvent.change(screen.getByRole("textbox", {name: "Deployment name"}), {
            target: {value: "application-logs"},
        });

        expect(screen.getByText("Checking availability…")).toBeVisible();
        expect(await screen.findByText("\"application-logs\" is available.")).toBeVisible();
    });

    it("reports a taken name before submitting", async () => {
        const fetch = stubApi(REGIONS, new Response(null, {status: 202}), false);
        render(
            <MemoryRouter>
                <CreateDeploymentPage/>
            </MemoryRouter>
        );
        fireEvent.change(screen.getByRole("textbox", {name: "Deployment name"}), {
            target: {value: "application-logs"},
        });

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "\"application-logs\" is already in use.",
        );
        expect(screen.queryByText(/lowercase letters, numbers, and hyphens/u))
            .not.toBeInTheDocument();
        expect(fetch).toHaveBeenCalledWith(
            expect.stringContaining("/check-name?name=application-logs"),
            expect.anything(),
        );
    });

    it("does not check a malformed name", async () => {
        const fetch = stubApi();
        render(
            <MemoryRouter>
                <CreateDeploymentPage/>
            </MemoryRouter>
        );

        fireEvent.change(screen.getByRole("textbox", {name: "Deployment name"}), {
            target: {value: "Bad_Name"},
        });
        await new Promise((resolve) => {
            setTimeout(resolve, NAME_CHECK_WAIT_MS);
        });

        expect(fetch).not.toHaveBeenCalledWith(
            expect.stringContaining("/check-name"),
            expect.anything(),
        );
    });
});
