# Continuously ingest logs from S3

Use an S3 scanner to ingest existing log files and pick up new files as they arrive.

## Prerequisites

* A running CLP deployment with the S3 scanner API enabled and permission to create API tokens.
* An AWS general purpose S3 bucket containing JSON logs, its region, and a key prefix to ingest.
* Permission to edit the source bucket's policy.
* A Bash terminal with curl 7.76 or newer. Run the commands in the same terminal.

Objects must be immutable, with new keys that sort after the existing keys when compared as text.
For example, `application/logs/000002.jsonl` can follow `application/logs/000001.jsonl`. Overwritten
files and late uploads with earlier keys can be missed. Random keys and out-of-order uploads do not
suit a scanner.

## Set up the scanner

### 1. Choose your deployment

In the Cloud Console, open **Operations > Deployments** and find your running deployment. Copy the
address of its **Open** link using your browser's **Copy link address** action. Use this full HTTPS
URL for the API requests below.

```{figure} images/s3-scanner/01-deployment.png
:width: 100%
:alt: Running production-logs deployment with its ID, Open link, and actions menu.
```

### 2. Grant and verify S3 access

Open the deployment's **…** menu and select **Connect your logs**.

```{figure} images/s3-scanner/02-deployment-actions.png
:width: 100%
:alt: Deployment actions menu with Connect your logs and Manage tokens.
```

Enter your **Bucket name** and a **Representative object key**. Use the full key of an existing,
non-empty log object under the prefix you plan to scan, such as `application/logs/000001.jsonl`.
This field takes one object's key; you will choose the scanner's prefix in step 5.

```{figure} images/s3-scanner/s3-source-details.png
:width: 600px
:alt: Connect your logs page with a source bucket and exact representative object key entered.
```

The **Grant read access** panel shows the deployment's S3 access-role ARN and generates a policy
statement for your bucket. In the **AWS Console** tab, choose **Copy policy statement**, then open
the **Open bucket permissions in AWS Console** link.

```{figure} images/s3-scanner/s3-policy.png
:width: 600px
:alt: Grant read access panel with the role ARN, bucket policy, copy button, and AWS Console link.
```

Add the copied statement to the bucket policy's `Statement` array, replacing any statement with
the same `Sid`. Preserve the other statements. If the bucket has no policy, start with
`{"Version":"2012-10-17","Statement":[]}` and insert the copied statement inside the brackets.
CLP uses the deployment role to read the bucket; you do not need to create AWS access keys.

Return to the Cloud Console and choose **Verify access**. Continue when the page shows
**S3 access verified**.

```{figure} images/s3-scanner/s3-access-verified.png
:width: 600px
:alt: S3 access verified after listing the bucket and reading the representative object.
```

Verification checks bucket listing and reads one byte from the representative object. It does not
start a scanner. Other objects can have different permissions or encryption.

### 3. Create an API token

Choose **Back** to return to your deployments. Open the same deployment's **…** menu and select
**Manage tokens**.

On the API tokens page, choose **Create token**.

```{figure} images/s3-scanner/03-token-list.png
:width: 100%
:alt: API tokens page filtered to production-logs, with the Create token button.
```

Confirm the deployment, enter an alias such as `s3-scanner-setup`, and choose an expiration. Then
select **Create token**. The token grants API access to this deployment, including ingestion and
queries.

```{figure} images/s3-scanner/04-create-token.png
:width: 450px
:alt: Token form with production-logs selected, an alias, and an expiration.
```

Keep the token dialog open for the next step. The full token is shown only once.

```{figure} images/s3-scanner/05-copy-token.png
:width: 450px
:alt: Token created dialog with a demonstration token and Copy button.
```

### 4. Set your deployment URL and token

Copy the token from the Console and set these two variables in your terminal. Paste the **Open**
link you copied in step 1 and remove its trailing `/`. Replace the example token with your full API
token, then choose **Done** in the Console.

```bash
export DEPLOYMENT_URL='https://7c9a9fc1.prod.cloud.yscope.com'
export CLP_API_TOKEN='ysclp_REPLACE_WITH_YOUR_TOKEN'
```

Keep the token private. Programs launched from this terminal inherit exported variables, and the
token may appear in shell history or process information. When you finish the API calls below,
run `unset CLP_API_TOKEN` to clear it from this terminal.

### 5. Start the scanner

Replace the bucket, prefix, and region in the request below with your source details. Use the source
bucket's region, which may differ from the deployment's region. Set `timestamp_key` to the timestamp
field in your JSON records, such as `timestamp` or `event.timestamp`.

Use a nonempty, literal prefix such as `application/logs/`. Omit the bucket name, `s3://`, and
wildcards. A prefix of `/` matches only keys beginning with `/`; it does not select the whole
bucket.

The first scan includes existing objects under this prefix. To skip earlier keys, add a
`start_after` field with a full object key, such as `application/logs/000100.jsonl`. The scanner
skips that key and all keys that sort before it, regardless of upload time.

The scanner checks for new objects every 30 seconds by default.

:::{note}
By default, CLP batches S3 objects until the buffer exceeds 4 GiB or the oldest buffered object has
waited 300 seconds. You can lower the size threshold with `buffer_config.flush_threshold_bytes` or
shorten the delay with `buffer_config.timeout_sec` in the scanner request. Put these fields in a
`buffer_config` object, for example `"buffer_config": {"timeout_sec": 60}`. Compression and indexing
take additional time. See the [S3 scanner API reference][s3-scanner-api] for all available settings.
:::

```bash
curl --fail-with-body --request POST "$DEPLOYMENT_URL/log_ingestor/s3_scanner" \
  --header "Authorization: Bearer $CLP_API_TOKEN" \
  --header 'Content-Type: application/json' \
  --data '{
    "bucket_name": "my-app-logs",
    "key_prefix": "application/logs/",
    "region": "us-east-1",
    "dataset": "default",
    "timestamp_key": "timestamp"
  }'
```

A successful request returns HTTP 200 with the job ID:

```json
{"id": 42}
```

Save the job ID and the configuration you submitted. You will need the ID to stop the scanner.
The scanner keeps running when you close your terminal or the token expires or is revoked.
If the request times out or returns no ID, check with your deployment administrator before retrying;
the scanner may already have been created.

### 6. Verify ingestion

Allow time for batching and compression before querying.

Choose a record from an object under your prefix, above `start_after` if you set it. Replace the
search value and time range below to match that record. The example searches from 11:55 to 12:05 UTC
on October 16, 2026; the time values are Unix timestamps in milliseconds. On Linux,
`date -u -d '2026-10-16T11:55:00Z' +%s000` converts a UTC time to milliseconds. Use the same dataset
as the scanner.

```bash
curl --fail-with-body --request POST "$DEPLOYMENT_URL/v1/query" \
  --header "Authorization: Bearer $CLP_API_TOKEN" \
  --header 'Content-Type: application/json' \
  --data '{
    "query_string": "\"s3-ingestion-check-20261016\"",
    "datasets": ["default"],
    "time_range_begin_millisecs": 1792151700000,
    "time_range_end_millisecs": 1792152300000,
    "max_num_results": 10
  }'
```

The response contains a results path:

```json
{"query_results_uri": "query_results/100"}
```

Replace `100` below with the number from your `query_results_uri`:

```bash
curl --fail-with-body --no-buffer --max-time 60 \
  --header "Authorization: Bearer $CLP_API_TOKEN" \
  "$DEPLOYMENT_URL/v1/query_results/100"
```

Results arrive as server-sent events, for example:

```text
data: {"timestamp":"2026-10-16T12:00:00Z","message":"s3-ingestion-check-20261016"}
```

Confirm that your record appears. After your source writes a new object whose key sorts after the
existing keys, wait for it to be compressed and repeat the query with a value and time range from
that object. Records without the configured timestamp field will not match a query with a time
range.

## Stop the scanner

Use the job ID you saved when creating the scanner. Replace `42` in this request with that ID.
If you are using a new terminal, set both variables from step 4 again. If you no longer have a valid
token, create a new one for the same deployment in step 3.

```bash
curl --fail-with-body --request POST \
  --header "Authorization: Bearer $CLP_API_TOKEN" \
  "$DEPLOYMENT_URL/log_ingestor/job/42/terminate"
```

Expect HTTP 200 with a terminal status:

```json
{"id": 42, "terminal_status": "finished"}
```

Termination stops discovery and may flush buffered objects into compression. It preserves ingested
logs, and submitted compression work can still finish. A terminated scanner cannot be resumed.
If the response is lost, repeat termination for the same ID. A `failed` status needs investigation
with your deployment administrator.

## Troubleshooting

Curl prints the response body, including error details.

| Problem                                | Check                                                                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `401`, `403`, or a sign-in page        | Check `DEPLOYMENT_URL` and use a valid token created for that deployment.                                                                        |
| `400` or `422` when creating a scanner | Check the JSON request, source region, and nonempty prefix.                                                                                      |
| `404`                                  | Check the deployment URL and endpoint path. Ask your deployment administrator if the scanner API is unavailable.                                 |
| `409` prefix conflict                  | A running job may already cover this prefix, a parent, or a child prefix for the same bucket and dataset. Check before creating another scanner. |
| Creation times out or returns `5xx`    | Keep the request details and time. The job may exist; confirm with your deployment administrator before retrying.                                |
| No records found                       | Allow time for batching. Check S3 access, prefix, dataset, `timestamp_key`, query window, and any `start_after` boundary.                        |
| Results stream times out               | Reconnect to the same results path. The 60-second curl timeout does not cancel the query.                                                        |

[s3-scanner-api]: https://petstore.swagger.io/?url=https://docs.yscope.com/clp/main/_static/generated/log-ingestor-openapi.json#/IngestionJob/create_s3_scanner_job
