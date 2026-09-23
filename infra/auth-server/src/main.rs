use std::{
    env,
    sync::{Arc, LazyLock},
    time::{Duration, Instant},
};

use axum::{
    Router,
    extract::State,
    http::{
        HeaderMap, StatusCode,
        header::{AUTHORIZATION, HOST},
    },
    routing::{any, get},
};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use moka::future::Cache;
use regex::Regex;
use sha2::{Digest, Sha256};
use sqlx::{
    MySqlPool,
    mysql::{MySqlConnectOptions, MySqlPoolOptions},
};
use subtle::ConstantTimeEq;
use tracing::{debug, error, info, warn};
use tracing_appender::non_blocking::{NonBlockingBuilder, WorkerGuard};
use tracing_subscriber::EnvFilter;

const USER_ID_HEADER: &str = "x-auth0-user-id";
// Bounds how long a revoked token or removed user keeps working on a replica
// that cached the record before the change. The cloud console shows this as
// the revocation countdown, so keep the two in sync (see values.yaml).
const DEFAULT_ACCESS_CACHE_TTL_SECONDS: u64 = 60;
const DEFAULT_ACCESS_CACHE_MAX_ENTRIES: u64 = 10_000;
const TOKEN_SECRET_BYTES: usize = 32;
const TOKEN_SELECTOR_BYTES: usize = 16;

static BEARER_TOKEN_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    let selector_len = (TOKEN_SELECTOR_BYTES * 8).div_ceil(6);
    let secret_len = (TOKEN_SECRET_BYTES * 8).div_ceil(6);
    Regex::new(&format!(
        "^(?i-u:bearer) +ysclp_(?<selector>[A-Za-z0-9_-]{{{selector_len}}})(?<secret>[A-Za-z0-9_-]{{{secret_len}}})$"
    ))
    .expect("bearer token pattern is valid")
});

fn decode_base64<const N: usize>(value: &str) -> Option<[u8; N]> {
    URL_SAFE_NO_PAD.decode(value).ok()?.try_into().ok()
}

#[derive(Hash, PartialEq, Eq)]
struct AccessCacheKey {
    user_id: String,
    deployment_id: String,
}

#[derive(Clone)]
struct ApiTokenRecord {
    secret_hash: Vec<u8>,
    deployment_id: String,
    /// When the token stops being honoured: the earlier of its expiry and its
    /// revocation. Fixed when the record is fetched so that a cached record
    /// enforces it without another database query.
    valid_until: Instant,
}

struct App {
    base_domain: String,
    pool: MySqlPool,
    access_cache: Cache<AccessCacheKey, bool>,
    api_token_cache: Cache<[u8; TOKEN_SELECTOR_BYTES], ApiTokenRecord>,
}

async fn authorize_auth0(State(app): State<Arc<App>>, headers: HeaderMap) -> StatusCode {
    let host = match headers.get(HOST).and_then(|value| value.to_str().ok()) {
        Some(value) => value.split(':').next().unwrap_or(value),
        None => {
            warn!("authorization denied: missing host");
            return StatusCode::FORBIDDEN;
        }
    };
    if host == app.base_domain {
        debug!(host, "base domain allowed");
        return StatusCode::OK;
    }
    let deployment_id = match host.strip_suffix(&format!(".{}", app.base_domain)) {
        Some(value) if !value.is_empty() && !value.contains('.') => value,
        _ => {
            warn!(host, "authorization denied: invalid deployment host");
            return StatusCode::FORBIDDEN;
        }
    };
    let user_id = match headers
        .get(USER_ID_HEADER)
        .and_then(|value| value.to_str().ok())
    {
        Some(value) if !value.is_empty() => value,
        _ => {
            warn!(
                host,
                deployment_id, "authorization denied: missing identity"
            );
            return StatusCode::UNAUTHORIZED;
        }
    };
    let access_cache_key = AccessCacheKey {
        user_id: user_id.to_owned(),
        deployment_id: deployment_id.to_owned(),
    };
    let allowed: bool = match app
        .access_cache
        .try_get_with(access_cache_key, async {
            info!(
                host,
                deployment_id, user_id, "querying database for deployment access"
            );
            sqlx::query_scalar(
                "SELECT EXISTS (SELECT 1 FROM user_deployment_access \
                 WHERE user_id = ? AND deployment_id = ?)",
            )
            .bind(user_id)
            .bind(deployment_id)
            .fetch_one(&app.pool)
            .await
        })
        .await
    {
        Ok(allowed) => allowed,
        Err(error) => {
            error!(
                %error,
                host,
                deployment_id,
                user_id,
                "authorization query failed"
            );
            return StatusCode::INTERNAL_SERVER_ERROR;
        }
    };

    info!(
        host,
        deployment_id, user_id, allowed, "authorization evaluated"
    );
    if allowed {
        StatusCode::OK
    } else {
        StatusCode::FORBIDDEN
    }
}

async fn authorize_api_token(State(app): State<Arc<App>>, headers: HeaderMap) -> StatusCode {
    let host = match headers.get(HOST).and_then(|value| value.to_str().ok()) {
        Some(value) => value.split(':').next().unwrap_or(value),
        None => {
            warn!("API token authorization denied: missing host.");
            return StatusCode::FORBIDDEN;
        }
    };
    let deployment_id = match host.strip_suffix(&format!(".{}", app.base_domain)) {
        Some(value) if !value.is_empty() && !value.contains('.') => value,
        _ => {
            warn!(
                host,
                "API token authorization denied: invalid deployment host."
            );
            return StatusCode::FORBIDDEN;
        }
    };
    let Some((selector, secret)) = headers
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|authorization_header| BEARER_TOKEN_REGEX.captures(authorization_header))
        .and_then(|captures| {
            let selector: [u8; TOKEN_SELECTOR_BYTES] = decode_base64(&captures["selector"])?;
            let secret: [u8; TOKEN_SECRET_BYTES] = decode_base64(&captures["secret"])?;
            Some((selector, secret))
        })
    else {
        warn!(
            host,
            deployment_id, "API token authorization denied: missing or malformed bearer token."
        );
        return StatusCode::UNAUTHORIZED;
    };
    let record = match app.api_token_cache.get(&selector).await {
        Some(record) => record,
        None => {
            info!(host, deployment_id, "querying database for API token");
            // The database reports how long the token remains valid so that
            // every replica agrees on the clock. Anchoring to an instant taken
            // before the query errs towards rejecting slightly early rather
            // than late.
            let fetched_at = Instant::now();
            let row = match sqlx::query_as::<_, (Vec<u8>, Vec<u8>, i64)>(
                "SELECT secret_hash, deployment_id, \
                 TIMESTAMPDIFF(MICROSECOND, UTC_TIMESTAMP(6), \
                 LEAST(expires_at, COALESCE(revoked_at, expires_at))) \
                 FROM api_tokens WHERE id = ? LIMIT 1",
            )
            .bind(selector.as_slice())
            .fetch_optional(&app.pool)
            .await
            {
                Ok(row) => row,
                Err(error) => {
                    error!(
                        error = %error,
                        host,
                        deployment_id,
                        "API token authorization query failed."
                    );
                    return StatusCode::INTERNAL_SERVER_ERROR;
                }
            };
            let Some((secret_hash, raw_deployment_id, valid_for_micros)) = row else {
                return StatusCode::UNAUTHORIZED;
            };
            let deployment_id = match String::from_utf8(raw_deployment_id) {
                Ok(value) => value,
                Err(error) => {
                    error!(
                        error = %error,
                        host,
                        deployment_id,
                        "API token record has a non-UTF-8 deployment ID."
                    );
                    return StatusCode::INTERNAL_SERVER_ERROR;
                }
            };
            // A negative remainder means the token is already expired or
            // revoked; caching it as such avoids re-querying until the cache
            // entry ages out.
            let record = ApiTokenRecord {
                secret_hash,
                deployment_id,
                valid_until: fetched_at
                    + Duration::from_micros(u64::try_from(valid_for_micros).unwrap_or(0)),
            };
            app.api_token_cache.insert(selector, record.clone()).await;
            record
        }
    };
    if Instant::now() >= record.valid_until {
        debug!(
            host,
            deployment_id, "API token authorization denied: expired or revoked."
        );
        return StatusCode::UNAUTHORIZED;
    }
    if !bool::from(record.secret_hash.ct_eq(Sha256::digest(secret).as_slice())) {
        return StatusCode::UNAUTHORIZED;
    }
    if record.deployment_id == deployment_id {
        StatusCode::OK
    } else {
        StatusCode::FORBIDDEN
    }
}

fn init_tracing() -> WorkerGuard {
    let (writer, guard) = NonBlockingBuilder::default()
        .lossy(false)
        .finish(std::io::stdout());
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("auth_server=info")),
        )
        .with_writer(writer)
        .json()
        .init();
    guard
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let _tracing_guard = init_tracing();
    let pool = MySqlPoolOptions::new()
        .max_connections(10)
        .acquire_timeout(Duration::from_secs(4))
        .connect_with(
            MySqlConnectOptions::new()
                .host(&env::var("MYSQL_HOST")?)
                .port(env::var("MYSQL_PORT")?.parse()?)
                .username(&env::var("MYSQL_USER")?)
                .password(&env::var("MYSQL_PASSWORD")?)
                .database(&env::var("MYSQL_DATABASE")?),
        )
        .await?;
    // TODO: Run migrations as a separate task so this service can use a
    // least-privilege database account without schema modification permissions.
    sqlx::migrate!("db/migrations").run(&pool).await?;
    info!("authorization database ready");

    let access_cache_ttl_seconds: u64 = match env::var("ACCESS_CACHE_TTL_SECONDS") {
        Ok(value) => value.parse()?,
        Err(_) => DEFAULT_ACCESS_CACHE_TTL_SECONDS,
    };
    let access_cache_max_entries: u64 = match env::var("ACCESS_CACHE_MAX_ENTRIES") {
        Ok(value) => value.parse()?,
        Err(_) => DEFAULT_ACCESS_CACHE_MAX_ENTRIES,
    };
    let app = Arc::new(App {
        base_domain: env::var("BASE_DOMAIN")?,
        pool,
        access_cache: Cache::builder()
            .max_capacity(access_cache_max_entries)
            .time_to_live(Duration::from_secs(access_cache_ttl_seconds))
            .build(),
        api_token_cache: Cache::builder()
            .max_capacity(access_cache_max_entries)
            .time_to_live(Duration::from_secs(access_cache_ttl_seconds))
            .build(),
    });
    let router = Router::new()
        .route("/health", get(|| async { StatusCode::OK }))
        .route("/authorize/auth0", any(authorize_auth0))
        .route("/authorize/api-token", any(authorize_api_token))
        .with_state(app);
    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await?;
    info!("auth server listening");
    axum::serve(listener, router).await?;
    Ok(())
}
