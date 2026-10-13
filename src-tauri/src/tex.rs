use crate::store::{atomic_write, Store};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use std::{path::Path, time::Duration};

#[derive(Serialize)]
pub struct CompiledPdf {
    pub data: String,
    pub log: String,
}
pub async fn compile(store: &Store, engine: &Path, source: &str) -> Result<CompiledPdf, String> {
    if source.len() > 2 * 1024 * 1024 {
        return Err("The TeX source exceeds 2 MB.".into());
    }
    if !engine.is_file() {
        return Err("The bundled TeX engine is missing. Install a complete QUANTA release.".into());
    }
    let work = tempfile::tempdir_in(store.root.join("recovery")).map_err(|e| e.to_string())?;
    let input = work.path().join("paper.tex");
    atomic_write(&input, source.as_bytes())?;
    let mut command = tokio::process::Command::new(engine);
    command
        .arg("--untrusted")
        .arg("--keep-logs")
        .arg("--outdir")
        .arg(work.path())
        .arg(&input)
        .env("TECTONIC_CACHE_DIR", store.root.join("tex-cache"))
        .current_dir(work.path())
        .kill_on_drop(true);
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    let result=tokio::time::timeout(Duration::from_secs(120),command.output()).await.map_err(|_|"TeX compilation reached the two-minute limit and was stopped. Simplify the document or check the network for missing packages.")?.map_err(|_|"The bundled TeX engine could not start.")?;
    let mut log = String::from_utf8_lossy(&result.stdout).to_string();
    log.push_str(&String::from_utf8_lossy(&result.stderr));
    if log.len() > 60000 {
        log = log.chars().take(60000).collect();
    }
    if !result.status.success() {
        return Err(format!(
            "TeX compilation failed. Your source is still saved.\n\n{log}"
        ));
    }
    let bytes = std::fs::read(work.path().join("paper.pdf"))
        .map_err(|_| "The TeX engine did not produce a PDF.")?;
    if bytes.len() > crate::models::MAX_EXPORT_BYTES {
        return Err("The compiled PDF exceeds 100 MB.".into());
    }
    Ok(CompiledPdf {
        data: STANDARD.encode(bytes),
        log,
    })
}
