use crate::store::{read_json, write_json, Store};
use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub api_version: u32,
    #[serde(default)]
    pub author: String,
    pub entry: String,
    pub permissions: Vec<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Plugin {
    pub manifest: Manifest,
    pub source: String,
}
pub fn valid_id(id: &str) -> bool {
    id.len() >= 3
        && id.len() <= 80
        && id.as_bytes()[0].is_ascii_lowercase()
        && id
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || b".-".contains(&c))
        && !id.contains("..")
}
pub fn validate(plugin: &Plugin) -> Result<(), String> {
    let m = &plugin.manifest;
    if !valid_id(&m.id)
        || m.api_version != 1
        || m.name.is_empty()
        || m.name.len() > 100
        || m.version.len() > 50
        || plugin.source.len() > 512 * 1024
    {
        return Err("Invalid QUANTA plugin bundle.".into());
    }
    if m.permissions
        .iter()
        .any(|p| p != "read-note" && p != "insert-content")
    {
        return Err("This plugin requests an unsupported permission.".into());
    }
    Ok(())
}
pub fn list(store: &Store) -> Result<Vec<Plugin>, String> {
    let mut plugins = vec![];
    for entry in fs::read_dir(store.root.join("plugins")).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if path.extension().and_then(|s| s.to_str()) == Some("qplugin") {
            let p: Plugin = read_json(&path)?;
            validate(&p)?;
            plugins.push(p);
        }
    }
    Ok(plugins)
}
pub fn install(store: &Store, bundle: &str) -> Result<Plugin, String> {
    if bundle.len() > 600 * 1024 {
        return Err("The plugin exceeds 600 KB.".into());
    }
    let plugin: Plugin =
        serde_json::from_str(bundle).map_err(|_| "The file is not a valid .qplugin bundle.")?;
    validate(&plugin)?;
    write_json(
        &store
            .root
            .join("plugins")
            .join(format!("{}.qplugin", plugin.manifest.id)),
        &plugin,
    )?;
    Ok(plugin)
}
pub fn uninstall(store: &Store, id: &str) -> Result<(), String> {
    if !valid_id(id) {
        return Err("Invalid plugin ID.".into());
    }
    fs::remove_file(store.root.join("plugins").join(format!("{id}.qplugin")))
        .map_err(|e| e.to_string())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn traversal_is_rejected() {
        assert!(!valid_id("../settings"));
        assert!(!valid_id("foo..bar"));
        assert!(valid_id("quanta.example"));
    }
}
