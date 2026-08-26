import type {
    DeploymentRequest,
    TenantId,
} from "./deployment-request.js";


type DequeueResolver = (request: DeploymentRequest) => void;

type TenantQueue = [DeploymentRequest, ...DeploymentRequest[]];

/**
 * Schedules deployment requests in: (1) round-robin order between tenants; and (2) FIFO order
 * between a tenant's requests.
 */
class DeploymentRequestQueues {
    private readonly pendingDequeueResolvers: DequeueResolver[] = [];

    // NOTE: A Map ensures that the order of tenants is preserved for round-robin scheduling.
    private readonly tenantIdToQueue = new Map<TenantId, TenantQueue>();

    /**
     * Adds a deployment request to its tenant's queue.
     *
     * @param request The deployment request to enqueue.
     */
    enqueue (request: DeploymentRequest): void {
        const resolveDequeue = this.pendingDequeueResolvers.shift();
        if (resolveDequeue) {
            resolveDequeue(request);

            return;
        }

        const tenantQueue = this.tenantIdToQueue.get(request.tenantId);
        if (tenantQueue) {
            tenantQueue.push(request);

            return;
        }

        this.tenantIdToQueue.set(request.tenantId, [request]);
    }

    /**
     * Removes the next request according to the scheduling policy. If no requests are available,
     * the promise will only resolve when a request is enqueued.
     *
     * @return A promise that resolves with the next request.
     */
    dequeue (): Promise<DeploymentRequest> {
        const nextTenantEntry = this.tenantIdToQueue.entries().next();
        if (nextTenantEntry.done) {
            return new Promise((resolve) => {
                this.pendingDequeueResolvers.push(resolve);
            });
        }

        const [tenantId, tenantQueue] = nextTenantEntry.value;
        const [request] = tenantQueue;
        tenantQueue.shift();

        // Move the tenant to the back of the queue if it still has requests.
        this.tenantIdToQueue.delete(tenantId);
        if (0 < tenantQueue.length) {
            this.tenantIdToQueue.set(tenantId, tenantQueue);
        }

        return Promise.resolve(request);
    }
}

export {DeploymentRequestQueues};
