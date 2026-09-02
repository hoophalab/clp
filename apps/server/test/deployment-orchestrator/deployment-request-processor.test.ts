import {
    expect,
    it,
    vi,
} from "vitest";

import {
    type DeploymentId,
    type DeploymentRequest,
    DeploymentRequestProcessor,
    DeploymentRequestQueues,
    REQUEST_PROCESSING_CONCURRENCY_MAX,
    REQUEST_PROCESSING_CONCURRENCY_MIN,
    type RequestId,
} from "../../src/deployment-orchestrator/index.js";


const SINGLE_WORKER_CONCURRENCY = 1;
const TWO_WORKER_CONCURRENCY = 2;
const NON_INTEGER_CONCURRENCY_VALUE = 1.5;
const INVALID_CONCURRENCY_VALUES = [
    NON_INTEGER_CONCURRENCY_VALUE,
    REQUEST_PROCESSING_CONCURRENCY_MIN - 1,
    REQUEST_PROCESSING_CONCURRENCY_MAX + 1,
];

/**
 * Creates a deployment request.
 *
 * @param requestId
 * @param deploymentId
 * @return The created request.
 */
const createDeploymentRequest = (
    requestId: RequestId,
    deploymentId: DeploymentId,
): DeploymentRequest => ({
    action: "create",
    deploymentId: deploymentId,
    requestId: requestId,
    requestedAt: new Date("2026-08-27T00:00:00.000Z"),
    tenantId: "tenant-a",
});

it("dispatches enqueued requests to the request executor in order", async () => {
    const firstRequest = createDeploymentRequest(
        "request-a",
        "deployment-a",
    );
    const secondRequest = createDeploymentRequest(
        "request-b",
        "deployment-b",
    );
    const requestQueues = new DeploymentRequestQueues();
    const requestExecutor = vi.fn(() => Promise.resolve());
    const requestProcessor = new DeploymentRequestProcessor(
        requestQueues,
        requestExecutor,
    );

    requestQueues.enqueue(firstRequest);
    requestQueues.enqueue(secondRequest);

    expect(requestProcessor.run(SINGLE_WORKER_CONCURRENCY)).toBeInstanceOf(Promise);

    await vi.waitFor(() => {
        expect(requestExecutor).toHaveBeenNthCalledWith(1, firstRequest);
        expect(requestExecutor).toHaveBeenNthCalledWith(2, secondRequest);
    });
});

it("waits for a request when the queues are empty", async () => {
    const request = createDeploymentRequest(
        "request-a",
        "deployment-a",
    );
    const requestQueues = new DeploymentRequestQueues();
    const requestExecutor = vi.fn(() => Promise.resolve());
    const requestProcessor = new DeploymentRequestProcessor(
        requestQueues,
        requestExecutor,
    );

    expect(requestProcessor.run(SINGLE_WORKER_CONCURRENCY)).toBeInstanceOf(Promise);

    await Promise.resolve();
    expect(requestExecutor).not.toHaveBeenCalled();

    requestQueues.enqueue(request);
    await vi.waitFor(() => {
        expect(requestExecutor).toHaveBeenCalledExactlyOnceWith(request);
    });
});

it("never exceeds the configured concurrency", async () => {
    const firstRequest = createDeploymentRequest(
        "request-a",
        "deployment-a",
    );
    const secondRequest = createDeploymentRequest(
        "request-b",
        "deployment-b",
    );
    const thirdRequest = createDeploymentRequest(
        "request-c",
        "deployment-c",
    );
    const requestQueues = new DeploymentRequestQueues();
    const requestExecution = Promise.withResolvers<boolean>();
    const requestExecutor = vi.fn(async () => {
        await requestExecution.promise;
    });
    const requestProcessor = new DeploymentRequestProcessor(
        requestQueues,
        requestExecutor,
    );

    requestQueues.enqueue(firstRequest);
    requestQueues.enqueue(secondRequest);
    requestQueues.enqueue(thirdRequest);

    expect(requestProcessor.run(TWO_WORKER_CONCURRENCY)).toBeInstanceOf(Promise);

    await vi.waitFor(() => {
        expect(requestExecutor).toHaveBeenCalledTimes(TWO_WORKER_CONCURRENCY);
    });

    // Give the loop a chance to incorrectly dispatch the third request while two requests are
    // executing.
    await Promise.resolve();
    expect(requestExecutor).toHaveBeenCalledTimes(TWO_WORKER_CONCURRENCY);

    requestExecution.resolve(true);

    await vi.waitFor(() => {
        expect(requestExecutor).toHaveBeenCalledWith(thirdRequest);
    });
});

it.each(INVALID_CONCURRENCY_VALUES)(
    "rejects invalid concurrency %s",
    (concurrency) => {
        const requestProcessor = new DeploymentRequestProcessor(
            new DeploymentRequestQueues(),
            vi.fn(() => Promise.resolve()),
        );

        expect(() => requestProcessor.run(concurrency)).toThrow(RangeError);
    },
);

it("does not let a blocked worker prevent other workers from completing", async () => {
    const blockedRequest = createDeploymentRequest(
        "request-a",
        "deployment-a",
    );
    const secondRequest = createDeploymentRequest(
        "request-b",
        "deployment-b",
    );
    const thirdRequest = createDeploymentRequest(
        "request-c",
        "deployment-c",
    );
    const blockedRequestExecution = Promise.withResolvers<boolean>();
    const completedRequestIds: RequestId[] = [];
    const requestExecutor = vi.fn(async (request: DeploymentRequest) => {
        if (request === blockedRequest) {
            await blockedRequestExecution.promise;
        }

        completedRequestIds.push(request.requestId);
    });
    const requestQueues = new DeploymentRequestQueues();
    const requestProcessor = new DeploymentRequestProcessor(
        requestQueues,
        requestExecutor,
    );

    requestQueues.enqueue(blockedRequest);
    requestQueues.enqueue(secondRequest);
    requestQueues.enqueue(thirdRequest);

    expect(requestProcessor.run(TWO_WORKER_CONCURRENCY)).toBeInstanceOf(Promise);

    await vi.waitFor(() => {
        expect(completedRequestIds).toEqual([
            secondRequest.requestId,
            thirdRequest.requestId,
        ]);
    });

    blockedRequestExecution.resolve(true);
    await vi.waitFor(() => {
        expect(completedRequestIds).toContain(blockedRequest.requestId);
    });
});
