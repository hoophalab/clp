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

const auth = vi.hoisted(() => ({useAuth0: vi.fn()}));

vi.mock("@auth0/auth0-react", () => auth);

/**
 * Answers the region catalog and deployment creation requests.
 *
 * @param regions The catalog the API reports.
 * @param createResponse The response to a creation request.
 * @return The stubbed fetch.
 */
const stubApi = (
    regions: unknown = REGIONS,
    createResponse = new Response(null, {status: 202}),
) => {
    const fetch = vi.fn((url: string, init?: RequestInit) => Promise.resolve(
        "POST" === init?.method ?
            createResponse :
            Response.json(regions),
    ));

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

        expect(screen.getByRole("alert")).toHaveTextContent("Use 5-32 lowercase letters");
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
            "This name is already in use.",
        );
    });
});
