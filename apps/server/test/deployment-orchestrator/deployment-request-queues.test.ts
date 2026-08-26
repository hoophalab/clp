import {
    expect,
    it,
} from "vitest";

import {
    type DeploymentId,
    type DeploymentRequest,
    DeploymentRequestQueues,
    type RequestId,
    type TenantId,
} from "../../src/deployment-orchestrator/index.js";


/**
 * Creates a deployment request.
 *
 * @param requestId
 * @param deploymentId
 * @param tenantId
 * @return The created request.
 */
const createDeploymentRequest = (
    requestId: RequestId,
    deploymentId: DeploymentId,
    tenantId: TenantId,
): DeploymentRequest => ({
    action: "create",
    deploymentId: deploymentId,
    requestId: requestId,
    requestedAt: new Date("2026-08-20T00:00:00.000Z"),
    tenantId: tenantId,
});

it("preserves FIFO order within a tenant queue", async () => {
    const requestQueues = new DeploymentRequestQueues();
    const tenantARequest1 = createDeploymentRequest(
        "request-a-1",
        "deployment-a-1",
        "tenant-a",
    );
    const tenantARequest2 = createDeploymentRequest(
        "request-a-2",
        "deployment-a-2",
        "tenant-a",
    );
    const tenantARequest3 = createDeploymentRequest(
        "request-a-3",
        "deployment-a-3",
        "tenant-a",
    );
    const tenantBRequest1 = createDeploymentRequest(
        "request-b-1",
        "deployment-b-1",
        "tenant-b",
    );

    requestQueues.enqueue(tenantARequest1);
    requestQueues.enqueue(tenantBRequest1);
    requestQueues.enqueue(tenantARequest2);
    requestQueues.enqueue(tenantARequest3);

    await expect(Promise.all([
        requestQueues.dequeue(),
        requestQueues.dequeue(),
        requestQueues.dequeue(),
        requestQueues.dequeue(),
    ])).resolves.toEqual([
        tenantARequest1,
        tenantBRequest1,
        tenantARequest2,
        tenantARequest3,
    ]);
});

it("dequeues requests from each tenant queue in round-robin order", async () => {
    const requestQueues = new DeploymentRequestQueues();
    const tenantARequest1 = createDeploymentRequest(
        "request-a-1",
        "deployment-a-1",
        "tenant-a",
    );
    const tenantARequest2 = createDeploymentRequest(
        "request-a-2",
        "deployment-a-2",
        "tenant-a",
    );
    const tenantBRequest1 = createDeploymentRequest(
        "request-b-1",
        "deployment-b-1",
        "tenant-b",
    );
    const tenantBRequest2 = createDeploymentRequest(
        "request-b-2",
        "deployment-b-2",
        "tenant-b",
    );
    const tenantCRequest1 = createDeploymentRequest(
        "request-c-1",
        "deployment-c-1",
        "tenant-c",
    );

    requestQueues.enqueue(tenantARequest1);
    requestQueues.enqueue(tenantARequest2);
    requestQueues.enqueue(tenantBRequest1);
    requestQueues.enqueue(tenantBRequest2);
    requestQueues.enqueue(tenantCRequest1);

    await expect(Promise.all([
        requestQueues.dequeue(),
        requestQueues.dequeue(),
        requestQueues.dequeue(),
        requestQueues.dequeue(),
        requestQueues.dequeue(),
    ])).resolves.toEqual([
        tenantARequest1,
        tenantBRequest1,
        tenantCRequest1,
        tenantARequest2,
        tenantBRequest2,
    ]);
});

it("adds a returning tenant to the end of the queue", async () => {
    const requestQueues = new DeploymentRequestQueues();
    const tenantARequest1 = createDeploymentRequest(
        "request-a-1",
        "deployment-a-1",
        "tenant-a",
    );
    const tenantARequest2 = createDeploymentRequest(
        "request-a-2",
        "deployment-a-2",
        "tenant-a",
    );
    const tenantBRequest1 = createDeploymentRequest(
        "request-b-1",
        "deployment-b-1",
        "tenant-b",
    );

    requestQueues.enqueue(tenantARequest1);
    requestQueues.enqueue(tenantBRequest1);

    await expect(requestQueues.dequeue()).resolves.toBe(tenantARequest1);

    requestQueues.enqueue(tenantARequest2);

    await expect(requestQueues.dequeue()).resolves.toBe(tenantBRequest1);
    await expect(requestQueues.dequeue()).resolves.toBe(tenantARequest2);
});

it("waits for a request when dequeue is called on an empty queue", async () => {
    const requestQueues = new DeploymentRequestQueues();
    const request = createDeploymentRequest(
        "request-a-1",
        "deployment-a-1",
        "tenant-a",
    );
    let hasResolved = false;
    const pendingRequest = requestQueues.dequeue().then((dequeuedRequest) => {
        hasResolved = true;

        return dequeuedRequest;
    });

    await Promise.resolve();
    expect(hasResolved).toBe(false);

    requestQueues.enqueue(request);

    await expect(pendingRequest).resolves.toBe(request);
});

it("serves waiting dequeues in call order", async () => {
    const requestQueues = new DeploymentRequestQueues();
    const firstRequest = createDeploymentRequest(
        "request-a-1",
        "deployment-a-1",
        "tenant-a",
    );
    const secondRequest = createDeploymentRequest(
        "request-b-1",
        "deployment-b-1",
        "tenant-b",
    );
    const firstPendingRequest = requestQueues.dequeue();
    const secondPendingRequest = requestQueues.dequeue();

    requestQueues.enqueue(firstRequest);
    requestQueues.enqueue(secondRequest);

    await expect(Promise.all([
        firstPendingRequest,
        secondPendingRequest,
    ])).resolves.toEqual([
        firstRequest,
        secondRequest,
    ]);
});
