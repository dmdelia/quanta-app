use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

pub const FORMAT: &str = "quanta.notebook";
pub const MAX_NOTE_BYTES: usize = 32 * 1024 * 1024;
pub const MAX_EXPORT_BYTES: usize = 100 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Notebook {
    pub format: String,
    pub schema_version: u32,
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub project: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub favorite: bool,
    pub created_at: String,
    pub updated_at: String,
    pub revision: u64,
    pub content: Value,
    #[serde(default)]
    pub tex_source: String,
}

impl Notebook {
    pub fn validate(&self) -> Result<(), String> {
        uuid::Uuid::parse_str(&self.id).map_err(|_| "Invalid notebook ID.")?;
        if self.format != FORMAT || self.schema_version != 1 {
            return Err("Unsupported notebook format or version.".into());
        }
        if self.title.len() > 1000 || self.project.len() > 1000 || self.tags.len() > 200 {
            return Err("Notebook metadata is too large.".into());
        }
        if self.content.get("type").and_then(Value::as_str) != Some("doc")
            || !self.content.get("content").is_some_and(Value::is_array)
        {
            return Err("The notebook content is not a valid document.".into());
        }
        chrono::DateTime::parse_from_rfc3339(&self.created_at)
            .map_err(|_| "Invalid creation date.")?;
        chrono::DateTime::parse_from_rfc3339(&self.updated_at)
            .map_err(|_| "Invalid update date.")?;
        if serde_json::to_vec(self).map_err(|e| e.to_string())?.len() > MAX_NOTE_BYTES {
            return Err("Notebook exceeds the 32 MB limit. Use smaller images.".into());
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub theme: String,
    pub accent: String,
    pub performance: String,
    pub reduce_motion: bool,
    pub font: String,
    pub font_size: u32,
    pub line_height: f32,
    pub paper_width: u32,
    pub spellcheck: bool,
    pub autosave_ms: u64,
    pub lock_minutes: u32,
    pub tutorial_done: bool,
    pub last_notebook: String,
    pub author: String,
    pub paper_size: String,
    pub export_scale: u32,
    pub google_client_id: String,
    pub google_client_secret: String,
    pub google_web_client_id: String,
    pub plugin_ids: Vec<String>,
    pub custom_macros: BTreeMap<String, String>,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: "system".into(),
            accent: "blue".into(),
            performance: "auto".into(),
            reduce_motion: false,
            font: "serif".into(),
            font_size: 18,
            line_height: 1.8,
            paper_width: 780,
            spellcheck: true,
            autosave_ms: 600,
            lock_minutes: 15,
            tutorial_done: false,
            last_notebook: String::new(),
            author: String::new(),
            paper_size: "a4".into(),
            export_scale: 2,
            google_client_id: String::new(),
            google_client_secret: String::new(),
            google_web_client_id: String::new(),
            plugin_ids: vec![],
            custom_macros: BTreeMap::new(),
        }
    }
}
impl Settings {
    pub fn validate(&self) -> Result<(), String> {
        if !(12..=32).contains(&self.font_size)
            || !(400..=1400).contains(&self.paper_width)
            || !(200..=5000).contains(&self.autosave_ms)
            || !(1..=4).contains(&self.export_scale)
            || !self.line_height.is_finite()
            || !(1.2..=2.5).contains(&self.line_height)
        {
            return Err("A setting is outside its supported range.".into());
        }
        if self.google_client_id.len() > 1000
            || self.google_client_secret.len() > 1000
            || self.custom_macros.len() > 200
        {
            return Err("Settings are too large.".into());
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SyncEntry {
    pub remote_id: String,
    pub base_hash: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct SyncIndex {
    pub folder_id: String,
    pub entries: BTreeMap<String, SyncEntry>,
    pub last_sync: Option<String>,
    pub account: String,
    pub tombstones: BTreeMap<String, String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub connected: bool,
    pub state: String,
    pub last_sync: Option<String>,
    pub pending: usize,
    pub message: String,
    pub account: String,
}
impl Default for SyncStatus {
    fn default() -> Self {
        Self {
            connected: false,
            state: "disconnected".into(),
            last_sync: None,
            pending: 0,
            message: "Connect Google Drive to sync your notebooks.".into(),
            account: String::new(),
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportJob {
    pub id: String,
    pub name: String,
    pub mime: String,
    pub replace: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Version {
    pub file: String,
    pub updated_at: String,
    pub title: String,
    pub revision: u64,
}
