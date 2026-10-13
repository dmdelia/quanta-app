use crate::{
    models::*,
    oauth, plugins,
    store::{atomic_write, decode_export, Store},
    sync, tex,
};
use serde::Serialize;
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};
use tauri::{Manager, State};

pub struct AppState {
    store: Store,
    io: Arc<Mutex<()>>,
    unlocked: AtomicBool,
    status: Mutex<SyncStatus>,
    sync_gate: tokio::sync::Mutex<()>,
    engine: PathBuf,
    tex_resource_cache: PathBuf,
    tex_gate: tokio::sync::Mutex<()>,
}
impl AppState {
    fn guard(&self) -> Result<(), String> {
        if self.unlocked.load(Ordering::Acquire) {
            Ok(())
        } else {
            Err("Unlock QUANTA to continue.".into())
        }
    }
    fn with_store<T>(
        &self,
        operation: impl FnOnce(&Store) -> Result<T, String>,
    ) -> Result<T, String> {
        self.guard()?;
        let _g = self
            .io
            .lock()
            .map_err(|_| "Local storage needs a restart.")?;
        operation(&self.store)
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Bootstrap {
    needs_password: bool,
    unlocked: bool,
    settings: Settings,
}
#[tauri::command]
async fn bootstrap(state: State<'_, AppState>) -> Result<Bootstrap, String> {
    let _g = state
        .io
        .lock()
        .map_err(|_| "Local storage needs a restart.")?;
    let mut settings = state.store.settings()?;
    if !state.unlocked.load(Ordering::Acquire) {
        settings.google_client_secret.clear();
        settings.google_client_id.clear();
        settings.author.clear();
    }
    Ok(Bootstrap {
        needs_password: state.store.needs_password(),
        unlocked: state.unlocked.load(Ordering::Acquire),
        settings,
    })
}
#[tauri::command]
async fn unlock(state: State<'_, AppState>, password: String, create: bool) -> Result<(), String> {
    let store = state.store.clone();
    let lock = state.io.clone();
    tokio::task::spawn_blocking(move || {
        let _g = lock.lock().map_err(|_| "Local storage needs a restart.")?;
        if create {
            if !store.needs_password() {
                return Err("A local password already exists.".into());
            }
            store.set_password(&password)
        } else {
            store.verify_password(&password)
        }
    })
    .await
    .map_err(|_| "Password verification was interrupted.")??;
    state.unlocked.store(true, Ordering::Release);
    Ok(())
}
#[tauri::command]
async fn lock(state: State<'_, AppState>) -> Result<(), String> {
    state.unlocked.store(false, Ordering::Release);
    Ok(())
}
#[tauri::command]
async fn change_password(
    state: State<'_, AppState>,
    current: String,
    next: String,
) -> Result<(), String> {
    state.guard()?;
    let store = state.store.clone();
    let lock = state.io.clone();
    tokio::task::spawn_blocking(move || {
        let _g = lock.lock().map_err(|_| "Local storage needs a restart.")?;
        store.verify_password(&current)?;
        store.set_password(&next)
    })
    .await
    .map_err(|_| "Password update was interrupted.")?
}
#[tauri::command]
async fn list_notes(state: State<'_, AppState>) -> Result<Vec<Notebook>, String> {
    state.with_store(Store::list_notes)
}
#[tauri::command]
async fn recovery_notices(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    state.with_store(Store::recovery_notices)
}
#[tauri::command]
async fn save_note(state: State<'_, AppState>, note: Notebook) -> Result<(), String> {
    state.with_store(|s| s.save_note(&note))
}
#[tauri::command]
async fn trash_note(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.with_store(|s| s.trash_note(&id))
}
#[tauri::command]
async fn list_trash(state: State<'_, AppState>) -> Result<Vec<Notebook>, String> {
    state.with_store(Store::list_trash)
}
#[tauri::command]
async fn restore_note(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.with_store(|s| s.restore_note(&id))
}
#[tauri::command]
async fn list_versions(state: State<'_, AppState>, id: String) -> Result<Vec<Version>, String> {
    state.with_store(|s| s.list_versions(&id))
}
#[tauri::command]
async fn restore_version(
    state: State<'_, AppState>,
    id: String,
    file: String,
) -> Result<Notebook, String> {
    state.with_store(|s| s.restore_version(&id, &file))
}
#[tauri::command]
async fn save_settings(state: State<'_, AppState>, settings: Settings) -> Result<(), String> {
    state.with_store(|s| s.save_settings(&settings))
}
#[tauri::command]
async fn sync_status(state: State<'_, AppState>) -> Result<SyncStatus, String> {
    state.guard()?;
    let mut status = state
        .status
        .lock()
        .map_err(|_| "Sync state needs a restart.")?
        .clone();
    let _g = state
        .io
        .lock()
        .map_err(|_| "Local storage needs a restart.")?;
    status.pending = state.store.pending_count()?;
    let index = state.store.sync_index()?;
    status.last_sync = index.last_sync;
    status.account = index.account;
    status.connected = oauth::load_tokens()?.is_some();
    if !status.connected {
        status.state = "disconnected".into();
    }
    Ok(status)
}
#[tauri::command]
async fn sync_now(state: State<'_, AppState>) -> Result<SyncStatus, String> {
    state.guard()?;
    let _gate = state.sync_gate.lock().await;
    {
        let mut s = state
            .status
            .lock()
            .map_err(|_| "Sync state needs a restart.")?;
        s.state = "syncing".into();
        s.message = "Syncing your notebooks…".into();
    }
    match sync::run(&state.store, &state.io).await {
        Ok(status) => {
            *state
                .status
                .lock()
                .map_err(|_| "Sync state needs a restart.")? = status.clone();
            Ok(status)
        }
        Err(error) => {
            let mut s = state
                .status
                .lock()
                .map_err(|_| "Sync state needs a restart.")?;
            s.state = if error.contains("connection")
                || error.contains("unreachable")
                || error.contains("interrupted")
                || error.contains("unavailable")
            {
                "offline"
            } else {
                "error"
            }
            .into();
            s.message = error.clone();
            Err(error)
        }
    }
}
#[tauri::command]
async fn connect_drive(state: State<'_, AppState>) -> Result<SyncStatus, String> {
    state.guard()?;
    let _gate = state.sync_gate.lock().await;
    let settings = state.with_store(Store::settings)?;
    let (_tokens, account) = oauth::connect(&settings).await?;
    let _g = state
        .io
        .lock()
        .map_err(|_| "Local storage needs a restart.")?;
    let mut index = state.store.sync_index()?;
    if !index.account.is_empty() && index.account != account {
        index = SyncIndex::default();
    }
    index.account = account.clone();
    state.store.save_sync_index(&index)?;
    let status = SyncStatus {
        connected: true,
        state: "idle".into(),
        last_sync: index.last_sync,
        pending: state.store.pending_count()?,
        message: "Google Drive is connected. Your local notebooks will sync to this account."
            .into(),
        account,
    };
    *state
        .status
        .lock()
        .map_err(|_| "Sync state needs a restart.")? = status.clone();
    Ok(status)
}
#[tauri::command]
async fn disconnect_drive(state: State<'_, AppState>) -> Result<(), String> {
    state.guard()?;
    let _gate = state.sync_gate.lock().await;
    oauth::disconnect()?;
    *state
        .status
        .lock()
        .map_err(|_| "Sync state needs a restart.")? = SyncStatus::default();
    Ok(())
}
#[tauri::command]
async fn queue_export(
    state: State<'_, AppState>,
    name: String,
    data: String,
    mime: String,
    replace: bool,
) -> Result<(), String> {
    state.with_store(|s| s.queue_export(&name, &data, &mime, replace))
}
#[tauri::command]
async fn write_export(
    state: State<'_, AppState>,
    path: String,
    data: String,
) -> Result<(), String> {
    state.guard()?;
    let path = PathBuf::from(path);
    if !path.is_absolute() {
        return Err("Choose an absolute export location.".into());
    }
    let bytes = decode_export(&data)?;
    // Export is a user-selected path. Never allow an export to replace QUANTA's internal records.
    let parent = path.parent().ok_or("Invalid export location.")?;
    let absolute_parent =
        std::fs::canonicalize(parent).map_err(|_| "The export directory no longer exists.")?;
    let root = std::fs::canonicalize(&state.store.root)
        .map_err(|_| "Cannot resolve the workspace directory.")?;
    if absolute_parent.starts_with(&root) {
        return Err("Choose an export directory outside QUANTA's internal workspace.".into());
    }
    atomic_write(&path, &bytes)
}
#[tauri::command]
async fn compile_tex(
    state: State<'_, AppState>,
    source: String,
) -> Result<tex::CompiledPdf, String> {
    state.guard()?;
    let _gate = state.tex_gate.lock().await;
    let from = state.tex_resource_cache.clone();
    let to = state.store.root.join("tex-cache");
    if from.exists() {
        tokio::task::spawn_blocking(move || copy_missing(&from, &to))
            .await
            .map_err(|_| "TeX cache preparation was interrupted.")?
            .map_err(|_| "Could not prepare the local TeX cache.")?;
    }
    tex::compile(&state.store, &state.engine, &source).await
}
#[tauri::command]
async fn list_plugins(state: State<'_, AppState>) -> Result<Vec<plugins::Plugin>, String> {
    state.with_store(plugins::list)
}
#[tauri::command]
async fn install_plugin(
    state: State<'_, AppState>,
    bundle: String,
) -> Result<plugins::Plugin, String> {
    state.with_store(|s| plugins::install(s, &bundle))
}
#[tauri::command]
async fn uninstall_plugin(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.with_store(|s| plugins::uninstall(s, &id))
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let root = app.path().app_data_dir()?;
            let store = Store::new(root).map_err(std::io::Error::other)?;
            let resource = app.path().resource_dir()?;
            let cache = resource.join("tex-cache");
            let extension = if cfg!(windows) { ".exe" } else { "" };
            let mut engine = std::env::current_exe()?
                .parent()
                .unwrap()
                .join(format!("tectonic{extension}"));
            if !engine.exists() {
                engine = resource.join(format!("tectonic{extension}"));
            }
            if cfg!(debug_assertions) && !engine.exists() {
                let triple = if cfg!(target_os = "macos") {
                    if cfg!(target_arch = "aarch64") {
                        "aarch64-apple-darwin"
                    } else {
                        "x86_64-apple-darwin"
                    }
                } else if cfg!(windows) {
                    "x86_64-pc-windows-msvc"
                } else {
                    "x86_64-unknown-linux-gnu"
                };
                engine = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .join("binaries")
                    .join(format!("tectonic-{triple}{extension}"));
            }
            app.manage(AppState {
                store,
                io: Arc::new(Mutex::new(())),
                unlocked: AtomicBool::new(false),
                status: Mutex::new(SyncStatus::default()),
                sync_gate: tokio::sync::Mutex::new(()),
                engine,
                tex_resource_cache: cache,
                tex_gate: tokio::sync::Mutex::new(()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            bootstrap,
            unlock,
            lock,
            change_password,
            list_notes,
            recovery_notices,
            save_note,
            trash_note,
            list_trash,
            restore_note,
            list_versions,
            restore_version,
            save_settings,
            sync_status,
            sync_now,
            connect_drive,
            disconnect_drive,
            queue_export,
            write_export,
            compile_tex,
            list_plugins,
            install_plugin,
            uninstall_plugin
        ])
        .run(tauri::generate_context!())
        .expect("QUANTA could not start");
}
fn copy_missing(from: &std::path::Path, to: &std::path::Path) -> std::io::Result<()> {
    std::fs::create_dir_all(to)?;
    for entry in std::fs::read_dir(from)? {
        let entry = entry?;
        let source = entry.path();
        let destination = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_missing(&source, &destination)?;
        } else if !destination.exists() {
            std::fs::copy(source, destination)?;
        }
    }
    Ok(())
}
