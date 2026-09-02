import type {DeploymentRequest} from "./deployment-request.js";
import type {DeploymentRequestQueues} from "./deployment-request-queues.js";


type DeploymentRequestExecutor =
    (request: DeploymentRequest) => Promise<void>;

const REQUEST_PROCESSING_CONCURRENCY_MIN = 1;
const REQUEST_PROCESSING_CONCURRENCY_MAX = 20;
const REQUEST_PROCESSING_CONCURRENCY_DEFAULT = REQUEST_PROCESSING_CONCURRENCY_MAX;

class DeploymentRequestProcessor {
    private readonly requestExecutor: DeploymentRequestExecutor;

    private readonly requestQueues: DeploymentRequestQueues;

    /**
     * @param requestQueues The queues from which to pull requests.
     * @param requestExecutor The function used to execute each request.
     */
    constructor (
        requestQueues: DeploymentRequestQueues,
        requestExecutor: DeploymentRequestExecutor,
    ) {
        this.requestQueues = requestQueues;
        this.requestExecutor = requestExecutor;
    }

    /**
     * Starts workers that continually process deployment requests.
     *
     * @param concurrency The number of requests to process concurrently.
     * @return A promise that only rejects if a worker fails unexpectedly.
     * @throws {RangeError} If concurrency is not a safe integer or is outside the supported range.
     */
    run (
        concurrency: number = REQUEST_PROCESSING_CONCURRENCY_DEFAULT,
    ): Promise<never> {
        if (
            !Number.isSafeInteger(concurrency) ||
            REQUEST_PROCESSING_CONCURRENCY_MIN > concurrency ||
            REQUEST_PROCESSING_CONCURRENCY_MAX < concurrency
        ) {
            throw new RangeError(
                "`concurrency` must be a safe integer between" +
                ` ${REQUEST_PROCESSING_CONCURRENCY_MIN} and ${REQUEST_PROCESSING_CONCURRENCY_MAX}.`,
            );
        }

        const workers = Array.from(
            {length: concurrency},
            () => this.runWorker(),
        );

        return Promise.race(workers);
    }

    private async runWorker (): Promise<never> {
        for (;;) {
            const request = await this.requestQueues.dequeue();
            await this.requestExecutor(request);
        }
    }
}

export {
    type DeploymentRequestExecutor,
    DeploymentRequestProcessor,
    REQUEST_PROCESSING_CONCURRENCY_MAX,
    REQUEST_PROCESSING_CONCURRENCY_MIN,
};
