//! A client dedicated to metadata, compression-job, and stream-file operations.
//!
//! This is intentionally separate from [`crate::client::Client`] (which handles search
//! query orchestration) so that the metadata access surface stays independent and easy to
//! reason about.

use std::path::PathBuf;

use chrono::DateTime;
use chrono::Utc;
use clp_rust_utils::clp_config::package::config::Config;
use clp_rust_utils::clp_config::package::config::StorageEngine;
use clp_rust_utils::clp_config::package::credentials::Credentials;
use clp_rust_utils::database::mysql::create_clp_db_mysql_pool;
use clp_rust_utils::dataset::VALID_DATASET_NAME_REGEX;
use mongodb::bson::doc;
use num_enum::IntoPrimitive;
use num_enum::TryFromPrimitive;
use serde::Deserialize;
use serde::Serialize;
use sqlx::Row;
use utoipa::ToSchema;

use crate::error::ClientError;

/// Mirror of `job_orchestration.scheduler.constants.QueryJobType`.
///
/// Kept in sync with [`clp_rust_utils::job_config::QueryJobType`] but defined here so the
/// API schema can reference it without pulling the whole job-config module into the public
/// surface.
#[derive(
    Clone,
    Copy,
    Debug,
    Deserialize,
    Eq,
    PartialEq,
    Serialize,
    ToSchema,
    TryFromPrimitive,
    IntoPrimitive,
)]
#[repr(i32)]
pub enum ExtractJobType {
    ExtractIr = 1,
    ExtractJson = 2,
}

/// Schema mirror of `NodeType::DeprecatedDateString` and `NodeType::Timestamp` in
/// `components/core/src/clp_s/SchemaTree.hpp`.
const DEPRECATED_TIMESTAMP_TYPE: i8 = 8;
const TIMESTAMP_TYPE: i8 = 14;

/// Maximum number of compression-metadata rows to return.
const COMPRESSION_METADATA_QUERY_LIMIT: i64 = 1000;

/// Request body for submitting a compression job.
#[derive(Clone, Debug, Deserialize, Serialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CompressionJobCreation {
    /// Absolute filesystem paths of the files to compress.
    pub paths: Vec<String>,
    /// Dataset to compress into (CLP-S only). Optional for the CLP storage engine.
    #[serde(default)]
    pub dataset: Option<String>,
    /// Timestamp key to use when parsing logs.
    #[serde(default)]
    pub timestamp_key: Option<String>,
    /// Whether the input is unstructured. Defaults to `true` for CLP and `false` for CLP-S.
    #[serde(default)]
    pub unstructured: Option<bool>,
}

/// Response body containing the ID of a newly created compression job.
#[derive(Clone, Serialize, Deserialize, ToSchema)]
pub struct CompressionJob {
    pub job_id: i64,
}

/// A row of compression metadata, with the decoded CLP IO config.
#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
pub struct CompressionMetadata {
    /// The compression job's ID. Named `_id` to match the webui's existing JSON contract.
    #[allow(clippy::pub_underscore_fields)]
    pub _id: i64,
    pub status: i32,
    pub status_msg: String,
    pub start_time: Option<String>,
    pub update_time: String,
    pub duration: Option<f64>,
    pub uncompressed_size: i64,
    pub compressed_size: i64,
    /// Decoded CLP IO config (as a JSON value) since the stored config is a zstd-compressed
    /// msgpack blob.
    pub clp_config: serde_json::Value,
}

/// Aggregated space-savings statistics.
#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
pub struct SpaceSavings {
    pub total_uncompressed_size: i64,
    pub total_compressed_size: i64,
}

/// Ingestion details statistics.
#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
pub struct IngestionDetails {
    pub begin_timestamp: Option<i64>,
    pub end_timestamp: Option<i64>,
    pub num_files: Option<i64>,
    pub num_messages: Option<i64>,
}

/// Query-speed statistics for a search job.
#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
pub struct QuerySpeed {
    pub bytes: Option<f64>,
    pub duration: Option<f64>,
}

/// Earliest and latest log entry timestamps across the selected datasets.
#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
pub struct TimeRange {
    pub begin_timestamp: i64,
    pub end_timestamp: i64,
}

impl TryFrom<sqlx::mysql::MySqlRow> for TimeRange {
    type Error = sqlx::Error;

    fn try_from(row: sqlx::mysql::MySqlRow) -> Result<Self, Self::Error> {
        Ok(Self {
            begin_timestamp: row.try_get("begin_timestamp")?,
            end_timestamp: row.try_get("end_timestamp")?,
        })
    }
}

/// A directory entry returned by the file-listing endpoint.
#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
pub struct DirEntry {
    pub is_expandable: bool,
    pub name: String,
    pub parent_path: String,
}

/// Extracted stream-file metadata returned by the stream-files extract endpoint.
#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
pub struct StreamFileMetadata {
    pub begin_msg_ix: i64,
    pub end_msg_ix: i64,
    pub is_last_chunk: bool,
    pub path: String,
    pub stream_id: String,
}

/// Request body for the stream-files extract endpoint.
#[derive(Clone, Debug, Deserialize, Serialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct StreamFileExtraction {
    #[serde(default)]
    pub dataset: Option<String>,
    pub extract_job_type: ExtractJobType,
    pub log_event_idx: i64,
    pub stream_id: String,
}

/// A dedicated client for metadata, compression-job, and stream-file operations.
///
/// Unlike [`crate::client::Client`], this client does not handle search query orchestration;
/// it only reads metadata and submits compression/extract jobs.
#[derive(Clone)]
pub struct MetadataClient {
    mongodb_client: mongodb::Client,
    sql_pool: sqlx::Pool<sqlx::MySql>,
    config: Config,
}

impl MetadataClient {
    /// Creates a metadata client using the supplied shared database clients.
    #[must_use]
    pub fn new(
        config: &Config,
        mongodb_client: mongodb::Client,
        sql_pool: sqlx::Pool<sqlx::MySql>,
    ) -> Self {
        Self {
            config: config.clone(),
            mongodb_client,
            sql_pool,
        }
    }

    /// Factory method to create a new [`MetadataClient`] with active connections to both
    /// `MySQL` and `MongoDB`.
    ///
    /// # Errors
    ///
    /// Returns an error if:
    ///
    /// * [`ClientError::ConfigIsNone`] if `config.api_server` is `None`.
    /// * Forwards [`create_clp_db_mysql_pool`]'s errors on failure.
    /// * Forwards [`mongodb::Client::with_uri_str`]'s errors on failure.
    pub async fn connect(config: &Config, credentials: &Credentials) -> Result<Self, ClientError> {
        if config.api_server.is_none() {
            return Err(ClientError::ConfigIsNone);
        }

        let sql_pool =
            create_clp_db_mysql_pool(&config.database, &credentials.database, 10).await?;

        let mongo_uri = format!(
            "mongodb://{}:{}/{}?directConnection=true",
            config.results_cache.host, config.results_cache.port, config.results_cache.db_name,
        );
        let mongo_client = mongodb::Client::with_uri_str(mongo_uri).await?;

        Ok(Self {
            config: config.clone(),
            mongodb_client: mongo_client,
            sql_pool,
        })
    }

    fn files_table(&self, dataset: Option<&str>) -> String {
        let db = &self.config.database;
        format!(
            "{}{}_files",
            db.table_prefix,
            dataset.unwrap_or(clp_rust_utils::dataset::CLP_DEFAULT_DATASET_NAME)
        )
    }

    /// Fetches all dataset names from the datasets table, ordered by name.
    ///
    /// # Errors
    ///
    /// Forwards [`sqlx::query::Query::fetch_all`]'s return values on failure.
    pub async fn get_dataset_names(&self) -> Result<Vec<String>, ClientError> {
        let table = self.config.database.datasets_table_name();
        let names: Vec<String> =
            sqlx::query_scalar(&format!("SELECT name FROM `{table}` ORDER BY name"))
                .fetch_all(&self.sql_pool)
                .await?;
        Ok(names)
    }

    /// Fetches the earliest and latest log entry timestamps across the given datasets.
    ///
    /// For the CLP storage engine, `datasets` is ignored and the single `clp_archives` table
    /// is queried. For CLP-S, the union of the per-dataset archives tables is queried; an
    /// empty `datasets` list returns an error.
    ///
    /// # Errors
    ///
    /// Returns [`ClientError::InvalidDatasetName`] if any dataset name is invalid.
    /// Returns an error if either timestamp is missing.
    /// Forwards [`sqlx::query::Query::fetch_one`]'s return values on failure.
    pub async fn get_time_range(&self, datasets: &[String]) -> Result<TimeRange, ClientError> {
        for dataset in datasets {
            if !VALID_DATASET_NAME_REGEX.is_match(dataset) {
                return Err(ClientError::InvalidDatasetName);
            }
        }
        match &self.config.package.storage_engine {
            StorageEngine::Clp => {
                let table = self.config.database.archives_table_name(None);
                let row = sqlx::query(&format!(
                    "SELECT MIN(begin_timestamp) AS begin_timestamp, \
                     MAX(end_timestamp) AS end_timestamp FROM `{table}`"
                ))
                .fetch_one(&self.sql_pool)
                .await?;
                Ok(row.try_into()?)
            }
            StorageEngine::ClpS => {
                if datasets.is_empty() {
                    return Err(sqlx::Error::RowNotFound.into());
                }
                let union = datasets
                    .iter()
                    .map(|d| {
                        let table = self.config.database.archives_table_name(Some(d));
                        format!(
                            "SELECT MIN(begin_timestamp) AS begin_timestamp, \
                             MAX(end_timestamp) AS end_timestamp FROM `{table}`"
                        )
                    })
                    .collect::<Vec<_>>()
                    .join("\nUNION ALL\n");
                let sql = format!(
                    "SELECT MIN(begin_timestamp) AS begin_timestamp, \
                     MAX(end_timestamp) AS end_timestamp FROM ({union}) AS combined"
                );
                let row = sqlx::query(&sql).fetch_one(&self.sql_pool).await?;
                Ok(row.try_into()?)
            }
        }
    }

    /// Fetches aggregated space-savings statistics (total uncompressed and compressed sizes)
    /// across all datasets.
    ///
    /// # Errors
    ///
    /// Returns [`ClientError::InvalidDatasetName`] if a stored dataset name is invalid.
    /// Forwards [`sqlx::query::Query::fetch_optional`]'s return values on failure.
    pub async fn get_space_savings(&self) -> Result<SpaceSavings, ClientError> {
        let sql = match &self.config.package.storage_engine {
            StorageEngine::Clp => {
                let table = self.config.database.archives_table_name(None);
                format!(
                    "SELECT \
                       CAST(COALESCE(SUM(uncompressed_size), 0) AS SIGNED) AS total_uncompressed_size, \
                       CAST(COALESCE(SUM(size), 0) AS SIGNED) AS total_compressed_size \
                     FROM `{table}`"
                )
            }
            StorageEngine::ClpS => {
                let datasets = self.get_dataset_names().await?;
                if datasets.is_empty() {
                    return Ok(SpaceSavings {
                        total_uncompressed_size: 0,
                        total_compressed_size: 0,
                    });
                }
                let union = datasets
                    .iter()
                    .map(|dataset| {
                        if !VALID_DATASET_NAME_REGEX.is_match(dataset) {
                            return Err(ClientError::InvalidDatasetName);
                        }
                        let table = self.config.database.archives_table_name(Some(dataset));
                        Ok(format!("SELECT uncompressed_size, size FROM `{table}`"))
                    })
                    .collect::<Result<Vec<_>, ClientError>>()?
                    .join("\nUNION ALL\n");
                format!(
                    "SELECT \
                       CAST(COALESCE(SUM(uncompressed_size), 0) AS SIGNED) AS total_uncompressed_size, \
                       CAST(COALESCE(SUM(size), 0) AS SIGNED) AS total_compressed_size \
                     FROM ({union}) AS archives_combined"
                )
            }
        };
        let row = sqlx::query(&sql).fetch_optional(&self.sql_pool).await?;
        let Some(row) = row else {
            return Ok(SpaceSavings {
                total_uncompressed_size: 0,
                total_compressed_size: 0,
            });
        };
        Ok(SpaceSavings {
            total_uncompressed_size: row.try_get("total_uncompressed_size").unwrap_or(0),
            total_compressed_size: row.try_get("total_compressed_size").unwrap_or(0),
        })
    }

    /// Fetches ingestion details (timestamp range, file count, message count) across all
    /// datasets.
    ///
    /// # Errors
    ///
    /// Returns [`ClientError::InvalidDatasetName`] if a stored dataset name is invalid.
    /// Forwards [`sqlx::query::Query::fetch_optional`]'s return values on failure.
    pub async fn get_ingestion_details(&self) -> Result<IngestionDetails, ClientError> {
        let sql = match &self.config.package.storage_engine {
            StorageEngine::Clp => {
                let archives = self.config.database.archives_table_name(None);
                let files = self.files_table(None);
                format!(
                    "SELECT \
                       (SELECT MIN(begin_timestamp) FROM `{archives}`) AS begin_timestamp, \
                       (SELECT MAX(end_timestamp) FROM `{archives}`) AS end_timestamp, \
                       (SELECT COUNT(DISTINCT orig_file_id) FROM `{files}`) AS num_files, \
                       (SELECT CAST(COALESCE(SUM(num_messages), 0) AS SIGNED) FROM `{files}`) \
                         AS num_messages"
                )
            }
            StorageEngine::ClpS => {
                let datasets = self.get_dataset_names().await?;
                if datasets.is_empty() {
                    return Ok(IngestionDetails {
                        begin_timestamp: None,
                        end_timestamp: None,
                        num_files: Some(0),
                        num_messages: Some(0),
                    });
                }
                for dataset in &datasets {
                    if !VALID_DATASET_NAME_REGEX.is_match(dataset) {
                        return Err(ClientError::InvalidDatasetName);
                    }
                }
                let archives_union = datasets
                    .iter()
                    .map(|dataset| {
                        let table = self.config.database.archives_table_name(Some(dataset));
                        format!(
                            "SELECT MIN(begin_timestamp) AS begin_timestamp, \
                             MAX(end_timestamp) AS end_timestamp FROM `{table}`"
                        )
                    })
                    .collect::<Vec<_>>()
                    .join("\nUNION ALL\n");
                let files_union = datasets
                    .iter()
                    .map(|dataset| {
                        let table = self.files_table(Some(dataset));
                        format!(
                            "SELECT COUNT(DISTINCT orig_file_id) AS num_files, \
                             CAST(COALESCE(SUM(num_messages), 0) AS SIGNED) AS num_messages \
                             FROM `{table}`"
                        )
                    })
                    .collect::<Vec<_>>()
                    .join("\nUNION ALL\n");
                format!(
                    "SELECT \
                       (SELECT MIN(begin_timestamp) FROM ({archives_union}) AS a) AS begin_timestamp, \
                       (SELECT MAX(end_timestamp) FROM ({archives_union}) AS a) AS end_timestamp, \
                       (SELECT SUM(num_files) FROM ({files_union}) AS f) AS num_files, \
                       (SELECT SUM(num_messages) FROM ({files_union}) AS f) AS num_messages"
                )
            }
        };
        let row = sqlx::query(&sql).fetch_optional(&self.sql_pool).await?;
        let Some(row) = row else {
            return Ok(IngestionDetails {
                begin_timestamp: None,
                end_timestamp: None,
                num_files: None,
                num_messages: None,
            });
        };
        Ok(IngestionDetails {
            begin_timestamp: row.try_get("begin_timestamp").unwrap_or(None),
            end_timestamp: row.try_get("end_timestamp").unwrap_or(None),
            num_files: row.try_get("num_files").unwrap_or(None),
            num_messages: row.try_get("num_messages").unwrap_or(None),
        })
    }

    /// Fetches the query speed (total uncompressed bytes scanned and job duration) for a
    /// search job across the given datasets.
    ///
    /// # Errors
    ///
    /// Returns [`ClientError::InvalidDatasetName`] if any dataset name is invalid.
    /// Forwards [`sqlx::query::Query::fetch_optional`]'s return values on failure.
    pub async fn get_query_speed(
        &self,
        datasets: &[String],
        search_job_id: i64,
    ) -> Result<QuerySpeed, ClientError> {
        for dataset in datasets {
            if !VALID_DATASET_NAME_REGEX.is_match(dataset) {
                return Err(ClientError::InvalidDatasetName);
            }
        }
        let archives_subquery = match &self.config.package.storage_engine {
            StorageEngine::Clp => {
                let table = self.config.database.archives_table_name(None);
                format!("SELECT id, uncompressed_size FROM `{table}`")
            }
            StorageEngine::ClpS => {
                if datasets.is_empty() {
                    return Ok(QuerySpeed {
                        bytes: None,
                        duration: None,
                    });
                }
                datasets
                    .iter()
                    .map(|d| {
                        let table = self.config.database.archives_table_name(Some(d));
                        format!("SELECT id, uncompressed_size FROM `{table}`")
                    })
                    .collect::<Vec<_>>()
                    .join(" UNION ALL ")
            }
        };
        let sql = format!(
            "WITH qt AS ( \
               SELECT job_id, archive_id FROM query_tasks \
               WHERE archive_id IS NOT NULL AND job_id = ? \
             ), \
             totals AS ( \
               SELECT qt.job_id, SUM(ca.uncompressed_size) AS total_uncompressed_bytes \
               FROM qt JOIN ({archives_subquery}) ca ON qt.archive_id = ca.id \
             ) \
             SELECT \
               CAST(totals.total_uncompressed_bytes AS DOUBLE) AS bytes, \
               qj.duration AS duration \
             FROM query_jobs qj JOIN totals ON totals.job_id = qj.id"
        );
        let row = sqlx::query(&sql)
            .bind(search_job_id)
            .fetch_optional(&self.sql_pool)
            .await?;
        let Some(row) = row else {
            return Ok(QuerySpeed {
                bytes: None,
                duration: None,
            });
        };
        Ok(QuerySpeed {
            bytes: row.try_get("bytes").unwrap_or(None),
            duration: row.try_get("duration").unwrap_or(None),
        })
    }

    /// Fetches the timestamp column names for a given dataset (CLP-S only).
    ///
    /// # Errors
    ///
    /// Returns [`ClientError::InvalidDatasetName`] if the dataset name is invalid.
    /// Returns [`ClientError::DatasetNotFound`] if the dataset's column-metadata table
    /// doesn't exist.
    /// Forwards [`sqlx::query::Query::fetch_all`]'s return values on failure.
    pub async fn get_timestamp_column_names(
        &self,
        dataset_name: &str,
    ) -> Result<Vec<String>, ClientError> {
        /// `MySQL` error number for `Table doesn't exist`.
        const MYSQL_TABLE_NOT_FOUND: u16 = 1146;

        if !VALID_DATASET_NAME_REGEX.is_match(dataset_name) {
            return Err(ClientError::InvalidDatasetName);
        }
        let table_name = self
            .config
            .database
            .column_metadata_table_name(Some(dataset_name));
        let names: Vec<String> = sqlx::query_scalar(&format!(
            "SELECT name FROM `{table_name}` WHERE type IN (?, ?)"
        ))
        .bind(TIMESTAMP_TYPE)
        .bind(DEPRECATED_TIMESTAMP_TYPE)
        .fetch_all(&self.sql_pool)
        .await
        .map_err(|err| {
            if let sqlx::Error::Database(db_err) = &err
                && let Some(mysql_err) =
                    db_err.try_downcast_ref::<sqlx::mysql::MySqlDatabaseError>()
                && mysql_err.number() == MYSQL_TABLE_NOT_FOUND
            {
                return ClientError::DatasetNotFound(dataset_name.to_owned());
            }
            err.into()
        })?;
        Ok(names)
    }

    /// Fetches recent compression-job metadata (most recent first), with the decoded CLP IO
    /// config for each job.
    ///
    /// # Errors
    ///
    /// Forwards [`sqlx::query::Query::fetch_all`]'s return values on failure.
    pub async fn get_compression_metadata(&self) -> Result<Vec<CompressionMetadata>, ClientError> {
        let rows = sqlx::query(
            "SELECT \
               id, status, status_msg, start_time, update_time, duration, \
               uncompressed_size, compressed_size, clp_config \
             FROM compression_jobs \
             ORDER BY id DESC \
             LIMIT ?",
        )
        .bind(COMPRESSION_METADATA_QUERY_LIMIT)
        .fetch_all(&self.sql_pool)
        .await?;
        let mut out = Vec::with_capacity(rows.len());
        for row in rows {
            let clp_config: serde_json::Value = rmp_serde::from_slice(&zstd::decode_all(
                row.try_get::<Vec<u8>, _>("clp_config")?.as_slice(),
            )?)?;
            out.push(CompressionMetadata {
                _id: row.try_get("id")?,
                status: row.try_get("status")?,
                status_msg: row.try_get("status_msg")?,
                start_time: row
                    .try_get::<Option<DateTime<Utc>>, _>("start_time")
                    .ok()
                    .flatten()
                    .map(|dt| dt.to_rfc3339()),
                update_time: row
                    .try_get::<Option<DateTime<Utc>>, _>("update_time")
                    .ok()
                    .flatten()
                    .map(|dt| dt.to_rfc3339())
                    .unwrap_or_default(),
                duration: row.try_get("duration")?,
                uncompressed_size: row.try_get("uncompressed_size")?,
                compressed_size: row.try_get("compressed_size")?,
                clp_config,
            });
        }
        Ok(out)
    }

    /// Submits a compression job to the `compression_jobs` table.
    ///
    /// The job config is encoded as msgpack and zstd-compressed before being stored, mirroring
    /// the webui server's `CompressionJobDbManager`.
    ///
    /// # Errors
    ///
    /// Returns [`ClientError::InvalidDatasetName`] if the dataset name is invalid.
    /// Forwards [`rmp_serde::to_vec_named`]'s return values on failure.
    /// Forwards [`sqlx::query::Query::execute`]'s return values on failure.
    pub async fn submit_compression_job(
        &self,
        creation: CompressionJobCreation,
    ) -> Result<CompressionJob, ClientError> {
        if let Some(dataset) = creation.dataset.as_deref()
            && !VALID_DATASET_NAME_REGEX.is_match(dataset)
        {
            return Err(ClientError::InvalidDatasetName);
        }
        let archive_output = &self.config.archive_output;
        let storage_engine = &self.config.package.storage_engine;

        let mut input = serde_json::json!({
            "dataset": null,
            "path_prefix_to_remove": CONTAINER_INPUT_LOGS_ROOT_DIR,
            "paths_to_compress": creation.paths,
            "timestamp_key": null,
            "type": "fs",
            "unstructured": true,
        });
        let output = serde_json::json!({
            "compression_level": archive_output.compression_level,
            "target_archive_size": archive_output.target_archive_size,
            "target_dictionaries_size": archive_output.target_dictionaries_size,
            "target_encoded_file_size": archive_output.target_encoded_file_size,
            "target_segment_size": archive_output.target_segment_size,
        });

        if &StorageEngine::ClpS == storage_engine {
            input["unstructured"] = serde_json::Value::Bool(false);
            if let Some(dataset) = &creation.dataset
                && !dataset.is_empty()
            {
                input["dataset"] = serde_json::Value::String(dataset.clone());
            }
            if let Some(timestamp_key) = &creation.timestamp_key {
                input["timestamp_key"] = serde_json::Value::String(timestamp_key.clone());
            }
            if Some(true) == creation.unstructured {
                input["unstructured"] = serde_json::Value::Bool(true);
            }
        }

        let compressed = zstd::encode_all(
            rmp_serde::to_vec_named(&serde_json::json!({"input": input, "output": output}))?
                .as_slice(),
            3,
        )?;

        let result = sqlx::query("INSERT INTO compression_jobs (clp_config) VALUES (?)")
            .bind(compressed)
            .execute(&self.sql_pool)
            .await?;
        Ok(CompressionJob {
            job_id: i64::try_from(result.last_insert_id()).map_err(|_| {
                ClientError::InvalidInput("compression job id out of range".to_owned())
            })?,
        })
    }

    /// Lists files and directories at the specified path.
    ///
    /// # Errors
    ///
    /// Returns [`ClientError::Io`] if the path does not exist or cannot be read.
    pub async fn list_files(&self, path: String) -> Result<Vec<DirEntry>, ClientError> {
        let path_buf = PathBuf::from(&path);
        let metadata = tokio::fs::metadata(&path_buf).await.map_err(|err| {
            if err.kind() == std::io::ErrorKind::NotFound {
                ClientError::NotFound(path)
            } else {
                ClientError::Io(err)
            }
        })?;
        if !metadata.is_dir() {
            return Ok(Vec::new());
        }
        let mut entries = tokio::fs::read_dir(&path_buf).await?;
        let mut out = Vec::new();
        while let Some(entry) = entries.next_entry().await? {
            let file_type = entry.file_type().await?;
            let is_expandable = file_type.is_dir() || file_type.is_symlink();
            let name = entry.file_name().to_string_lossy().into_owned();
            let parent_path = path_buf.to_string_lossy().into_owned();
            out.push(DirEntry {
                is_expandable,
                name,
                parent_path,
            });
        }
        Ok(out)
    }

    /// Extracts a stream file containing the log event at `log_event_idx` in the stream with
    /// the given `stream_id`. If the stream has already been extracted, returns its metadata
    /// directly; otherwise submits an extraction job and waits for it to complete.
    ///
    /// The returned `path` is the resolved stream-file path. When stream-files S3 storage is
    /// configured, this is a pre-signed URL; otherwise it is a path relative to the webui
    /// `/streams` static mount.
    ///
    /// # Errors
    ///
    /// Returns [`ClientError::InvalidDatasetName`] if the dataset name is invalid.
    /// Returns [`ClientError::InvalidInput`] if the extract job type is invalid.
    /// Forwards [`mongodb::error::Error`]'s return values on failure.
    /// Forwards [`sqlx::query::Query::execute`]'s return values on failure.
    pub async fn extract_stream_file(
        &self,
        extraction: StreamFileExtraction,
    ) -> Result<StreamFileMetadata, ClientError> {
        if let Some(dataset) = extraction.dataset.as_deref()
            && !VALID_DATASET_NAME_REGEX.is_match(dataset)
        {
            return Err(ClientError::InvalidDatasetName);
        }
        let stream_files_collection = self
            .mongodb_client
            .database(&self.config.results_cache.db_name)
            .collection::<StreamFileMetadataDoc>(STREAM_FILES_COLLECTION_NAME);

        let existing = stream_files_collection
            .find_one(doc! {
                "stream_id": &extraction.stream_id,
                "begin_msg_ix": {"$lte": extraction.log_event_idx},
                "end_msg_ix": {"$gt": extraction.log_event_idx},
            })
            .await?;
        let mut metadata = if let Some(doc) = existing {
            doc.into_metadata()
        } else {
            self.submit_and_wait_extract_job(&extraction).await?;
            let doc = stream_files_collection
                .find_one(doc! {
                    "stream_id": &extraction.stream_id,
                    "begin_msg_ix": {"$lte": extraction.log_event_idx},
                    "end_msg_ix": {"$gt": extraction.log_event_idx},
                })
                .await?
                .ok_or_else(|| {
                    ClientError::InvalidInput(format!(
                        "Unable to extract stream with streamId={} at logEventIdx={}",
                        extraction.stream_id, extraction.log_event_idx
                    ))
                })?;
            doc.into_metadata()
        };

        metadata.path = format!("/streams/{}", metadata.path);
        Ok(metadata)
    }

    async fn submit_and_wait_extract_job(
        &self,
        extraction: &StreamFileExtraction,
    ) -> Result<(), ClientError> {
        let target_uncompressed_size = STREAM_TARGET_UNCOMPRESSED_SIZE;
        let job_config = match extraction.extract_job_type {
            ExtractJobType::ExtractIr => serde_json::json!({
                "file_split_id": null,
                "msg_ix": extraction.log_event_idx,
                "orig_file_id": extraction.stream_id,
                "target_uncompressed_size": target_uncompressed_size,
            }),
            ExtractJobType::ExtractJson => serde_json::json!({
                "dataset": extraction.dataset,
                "archive_id": extraction.stream_id,
                "target_chunk_size": target_uncompressed_size,
            }),
        };
        let encoded = rmp_serde::to_vec_named(&job_config)?;
        let job_type_i32: i32 = extraction.extract_job_type.into();
        let result = sqlx::query("INSERT INTO query_jobs (job_config, type) VALUES (?, ?)")
            .bind(encoded)
            .bind(job_type_i32)
            .execute(&self.sql_pool)
            .await?;
        let job_id = result.last_insert_id();

        let mut delay_ms = 100u64;
        loop {
            let row = sqlx::query("SELECT status FROM query_jobs WHERE id = ?")
                .bind(job_id)
                .fetch_optional(&self.sql_pool)
                .await?;
            let Some(row) = row else {
                return Err(ClientError::SearchJobNotFound(job_id));
            };
            let status: i32 = row.try_get("status")?;
            match status {
                2 => break,
                3 | 6 => {
                    return Err(ClientError::InvalidInput(format!(
                        "Extract job {job_id} exited with status={status}"
                    )));
                }
                5 => {
                    return Err(ClientError::InvalidInput(format!(
                        "Extract job {job_id} was cancelled"
                    )));
                }
                _ => {
                    tokio::time::sleep(tokio::time::Duration::from_millis(delay_ms)).await;
                    delay_ms = std::cmp::min(delay_ms.saturating_mul(2), 5000);
                }
            }
        }
        Ok(())
    }
}

/// Mirror of `CONTAINER_INPUT_LOGS_ROOT_DIR` in `clp_package_utils.general`.
const CONTAINER_INPUT_LOGS_ROOT_DIR: &str = "/mnt/logs";

/// The `MongoDB` collection name for stream files. Kept in sync with the webui server's
/// `MongoDbStreamFilesCollectionName` setting (`stream-files`).
const STREAM_FILES_COLLECTION_NAME: &str = "stream-files";

/// Internal document shape for the stream-files `MongoDB` collection.
#[derive(Debug, Deserialize)]
struct StreamFileMetadataDoc {
    begin_msg_ix: i64,
    end_msg_ix: i64,
    is_last_chunk: bool,
    path: String,
    stream_id: String,
}

impl StreamFileMetadataDoc {
    fn into_metadata(self) -> StreamFileMetadata {
        StreamFileMetadata {
            begin_msg_ix: self.begin_msg_ix,
            end_msg_ix: self.end_msg_ix,
            is_last_chunk: self.is_last_chunk,
            path: self.path,
            stream_id: self.stream_id,
        }
    }
}

/// The default target uncompressed size for stream extraction, mirroring the webui server's
/// `StreamTargetUncompressedSize` setting.
const STREAM_TARGET_UNCOMPRESSED_SIZE: i64 = 134_217_728;
