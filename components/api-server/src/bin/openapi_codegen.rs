use anyhow::Result;
use clap::Parser;
use serde_json::to_string_pretty;
use utoipa::OpenApi;

#[derive(Parser)]
#[command(version, about = "Generate public and WebUI OpenAPI documents")]
struct Args {
    public_path: String,
    webui_path: String,
}

fn main() -> Result<()> {
    let args = Args::parse();
    let webui_api = api_server::routes::ApiDoc::openapi();
    let mut public_api = webui_api.clone();
    public_api
        .paths
        .paths
        .retain(|path, _| !path.starts_with("/metadata"));

    std::fs::write(args.public_path, to_string_pretty(&public_api)?)?;
    std::fs::write(args.webui_path, to_string_pretty(&webui_api)?)?;
    Ok(())
}
