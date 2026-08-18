use std::{env, sync::Arc, time::Duration};

use axum::{
    Router,
    extract::State,
    http::{HeaderMap, StatusCode, header::HOST},
    routing::get,
};
use moka::future::Cache;
use sqlx::{
    MySqlPool,
    mysql::{MySqlConnectOptions, MySqlPoolOptions},
};
use tracing::{debug, error, info, warn};
use tracing_appender::non_blocking::{NonBlockingBuilder, WorkerGuard};
use tracing_subscriber::EnvFilter;

const USER_ID_HEADER: &str = "x-auth0-user-id";
const DEFAULT_ACCESS_CACHE_TTL_SECONDS: u64 = 60;
const DEFAULT_ACCESS_CACHE_MAX_ENTRIES: u64 = 10_000;

#[derive(Hash, PartialEq, Eq)]
struct AccessCacheKey {
    user_id: String,
    deployment_id: String,
}

struct App {
    base_domain: String,
    pool: MySqlPool,
    access_cache: Cache<AccessCacheKey, bool>,
}

async fn authorize(State(app): State<Arc<App>>, headers: HeaderMap) -> StatusCode {
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
    });
    let router = Router::new()
        .route("/health", get(|| async { StatusCode::OK }))
        .fallback(authorize)
        .with_state(app);
    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await?;
    info!("auth server listening");
    axum::serve(listener, router).await?;
    Ok(())
}
