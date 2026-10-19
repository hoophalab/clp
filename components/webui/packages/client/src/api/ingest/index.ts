import {CLP_DEFAULT_DATASET_NAME} from "@webui/common/config";
import type {S3ScannerCreation} from "@webui/common/schemas/ingestion";
import axios, {isAxiosError} from "axios";


const HTTP_CLIENT_ERROR_MIN = 400;
const HTTP_SERVER_ERROR_MIN = 500;

/**
 * Response of the log ingestor's job creation endpoints.
 */
interface S3ScannerJob {
    id: number;
}

/**
 * Maps form values to the log ingestor's `S3ScannerConfig`, leaving omitted tuning fields to the
 * ingestor's defaults.
 *
 * @param input
 * @return The native scanner config.
 */
const toS3ScannerConfig = (input: S3ScannerCreation) => ({
    bucket_name: input.bucket,
    dataset: input.dataset || CLP_DEFAULT_DATASET_NAME,
    key_prefix: input.keyPrefix,
    region: input.region,
    ...(!input.unstructured && input.timestampKey ?
        {timestamp_key: input.timestampKey} :
        {}),
    unstructured: input.unstructured ?? false,
});

/**
 * Gets the log ingestor's message for a rejected request. Rejections are either native JSON
 * `{error}` bodies or Axum's plain-text deserialization errors.
 *
 * @param data
 * @return The message, or null if none is present.
 */
const getRejectionMessage = (data: unknown): string | null => {
    if ("string" === typeof data) {
        return data.trim() || null;
    }
    if (null !== data && "object" === typeof data && "error" in data &&
        "string" === typeof data.error) {
        return data.error;
    }

    return null;
};

/**
 * Submits one scanner request without retrying an uncertain creation outcome.
 *
 * @param payload
 * @return The created scanner's ID.
 * @throws {Error} With the ingestor's message if it rejected the request, or a generic message
 * if the outcome is uncertain.
 */
const submitS3Scanner = async (payload: S3ScannerCreation): Promise<S3ScannerJob> => {
    try {
        const {data} = await axios.post<S3ScannerJob>(
            "/api/log-ingestor/s3_scanner",
            toS3ScannerConfig(payload)
        );

        return data;
    } catch (error: unknown) {
        // Only 4xx responses are definite rejections; 5xx (including proxy failures) may not be.
        if (isAxiosError<unknown>(error) && error.response &&
            HTTP_CLIENT_ERROR_MIN <= error.response.status &&
            HTTP_SERVER_ERROR_MIN > error.response.status) {
            const {data, status} = error.response;

            throw new Error(
                getRejectionMessage(data) ?? `Scanner creation rejected (HTTP ${String(status)}).`
            );
        }

        throw new Error("Could not confirm scanner creation. Check the ingestor before retrying.");
    }
};


export {submitS3Scanner};
