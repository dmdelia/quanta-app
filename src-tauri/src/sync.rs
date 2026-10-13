use crate::{
    models::*,
    oauth,
    store::{hash_note, write_json, Store},
};
use reqwest::{Client, Response};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, BTreeSet},
    sync::Mutex,
};

const API: &str = "https://www.googleapis.com/drive/v3/files";
const UPLOAD: &str = "https://www.googleapis.com/upload/drive/v3/files";
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteFile {
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub created_time: String,
    #[serde(default)]
    pub app_properties: BTreeMap<String, String>,
}
impl RemoteFile {
    fn note_id(&self) -> &str {
        self.app_properties
            .get("quantaId")
            .map(String::as_str)
            .unwrap_or("")
    }
    fn hash(&self) -> &str {
        self.app_properties
            .get("quantaHash")
            .map(String::as_str)
            .unwrap_or("")
    }
    fn parent(&self) -> &str {
        self.app_properties
            .get("quantaParent")
            .map(String::as_str)
            .unwrap_or("")
    }
    fn deleted(&self) -> bool {
        self.app_properties
            .get("quantaDeleted")
            .is_some_and(|s| s == "true")
    }
}
pub struct Drive {
    client: Client,
    token: String,
}
async fn response_json(response: Response) -> Result<Value, String> {
    let status = response.status();
    if !status.is_success() {
        return Err(match status.as_u16() {401=>"Google authorization needs to be renewed. Reconnect in Settings.",403=>"Google Drive refused access. Check API enablement, account quota, and consent settings.",429=>"Google Drive asked QUANTA to slow down. Sync will retry in 15 minutes.",_=>"Google Drive is unavailable. Your local files and queued exports are safe."}.into());
    }
    response
        .json()
        .await
        .map_err(|_| "Google Drive returned an invalid response.".into())
}
impl Drive {
    pub fn new(token: String) -> Result<Self, String> {
        Ok(Self {
            client: oauth::http_client()?,
            token,
        })
    }
    async fn list(&self, query: &str) -> Result<Vec<RemoteFile>, String> {
        let mut files = vec![];
        let mut page = String::new();
        loop {
            let mut params = vec![
                ("q", query),
                (
                    "fields",
                    "nextPageToken,files(id,name,createdTime,appProperties)",
                ),
                ("pageSize", "1000"),
                ("spaces", "drive"),
            ];
            if !page.is_empty() {
                params.push(("pageToken", &page));
            }
            let response = self
                .client
                .get(API)
                .bearer_auth(&self.token)
                .query(&params)
                .send()
                .await
                .map_err(|_| {
                    "No working connection to Google Drive. Sync will retry in 15 minutes."
                })?;
            let mut value = response_json(response).await?;
            let mut batch: Vec<RemoteFile> = serde_json::from_value(value["files"].take())
                .map_err(|_| "Invalid Drive file listing.")?;
            files.append(&mut batch);
            page = value["nextPageToken"].as_str().unwrap_or("").into();
            if page.is_empty() {
                break;
            }
        }
        Ok(files)
    }
    async fn folder(&self, parent: Option<&str>, name: &str, kind: &str) -> Result<String, String> {
        let parent_q = parent
            .map(|id| format!(" and '{id}' in parents"))
            .unwrap_or_default();
        let query=format!("trashed=false and mimeType='application/vnd.google-apps.folder' and appProperties has {{ key='quantaFolder' and value='{kind}' }}{parent_q}");
        if let Some(folder) = self.list(&query).await?.first() {
            return Ok(folder.id.clone());
        }
        let mut metadata = json!({"name":name,"mimeType":"application/vnd.google-apps.folder","appProperties":{"quantaFolder":kind}});
        if let Some(parent) = parent {
            metadata["parents"] = json!([parent]);
        }
        let response = self
            .client
            .post(API)
            .bearer_auth(&self.token)
            .query(&[("fields", "id")])
            .json(&metadata)
            .send()
            .await
            .map_err(|_| "Could not create QUANTA's Drive folder.")?;
        response_json(response).await?["id"]
            .as_str()
            .map(str::to_owned)
            .ok_or("Drive did not return a folder ID.".into())
    }
    async fn upload(
        &self,
        folder: &str,
        name: &str,
        mime: &str,
        bytes: Vec<u8>,
        properties: Value,
        replace_id: Option<&str>,
    ) -> Result<RemoteFile, String> {
        let mut metadata = json!({"name":name,"mimeType":mime,"appProperties":properties});
        if replace_id.is_none() {
            metadata["parents"] = json!([folder]);
        }
        let boundary = format!("quanta-{}", uuid::Uuid::new_v4());
        let mut body=format!("--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{}\r\n--{boundary}\r\nContent-Type: {mime}\r\n\r\n",metadata).into_bytes();
        body.extend(bytes);
        body.extend(format!("\r\n--{boundary}--\r\n").as_bytes());
        let url = replace_id
            .map(|id| format!("{UPLOAD}/{id}"))
            .unwrap_or_else(|| UPLOAD.into());
        let request = if replace_id.is_some() {
            self.client.patch(url)
        } else {
            self.client.post(url)
        };
        let response = request
            .bearer_auth(&self.token)
            .query(&[
                ("uploadType", "multipart"),
                ("fields", "id,name,createdTime,appProperties"),
            ])
            .header(
                "Content-Type",
                format!("multipart/related; boundary={boundary}"),
            )
            .body(body)
            .send()
            .await
            .map_err(|_| {
                "Upload was interrupted. It will be retried without deleting local data."
            })?;
        serde_json::from_value(response_json(response).await?)
            .map_err(|_| "Invalid Drive upload response.".into())
    }
    async fn download(&self, file: &RemoteFile) -> Result<Notebook, String> {
        let response = self
            .client
            .get(format!("{API}/{}", file.id))
            .bearer_auth(&self.token)
            .query(&[("alt", "media")])
            .send()
            .await
            .map_err(|_| "Notebook download was interrupted.")?;
        if !response.status().is_success() {
            return Err("Google Drive could not download a notebook.".into());
        }
        if response
            .content_length()
            .is_some_and(|s| s > MAX_NOTE_BYTES as u64)
        {
            return Err("A Drive notebook exceeds 32 MB.".into());
        }
        let bytes = response
            .bytes()
            .await
            .map_err(|_| "Notebook download was interrupted.")?;
        if bytes.len() > MAX_NOTE_BYTES {
            return Err("A Drive notebook exceeds 32 MB.".into());
        }
        let note: Notebook = serde_json::from_slice(&bytes)
            .map_err(|_| "A Drive notebook is damaged. QUANTA kept your local copy.")?;
        note.validate()?;
        if note.id != file.note_id() || hash_note(&note)? != file.hash() {
            return Err("A Drive notebook's content does not match its saved revision. QUANTA kept your local copy.".into());
        }
        Ok(note)
    }
}
#[derive(Debug, PartialEq, Eq)]
pub enum Merge {
    Same,
    Push,
    Pull,
    Conflict,
}
pub fn merge_action(base: Option<&str>, local: &str, remote: &str) -> Merge {
    if local == remote {
        return Merge::Same;
    }
    if base == Some(remote) {
        return Merge::Push;
    }
    if base == Some(local) {
        return Merge::Pull;
    }
    Merge::Conflict
}
pub fn remote_heads(files: &[RemoteFile]) -> Vec<RemoteFile> {
    let parents: BTreeSet<&str> = files
        .iter()
        .map(RemoteFile::parent)
        .filter(|s| !s.is_empty())
        .collect();
    let mut heads: Vec<_> = files
        .iter()
        .filter(|f| !parents.contains(f.hash()))
        .cloned()
        .collect();
    heads.sort_by(|a, b| a.created_time.cmp(&b.created_time).then(a.id.cmp(&b.id)));
    heads
}
fn conflict_copy(note: &Notebook) -> Result<Notebook, String> {
    let hash = hash_note(note)?;
    let mut copy = note.clone();
    copy.id = uuid::Uuid::new_v5(
        &uuid::Uuid::NAMESPACE_URL,
        format!("quanta-conflict:{}:{hash}", note.id).as_bytes(),
    )
    .to_string();
    copy.title = format!("{} (conflict copy)", note.title);
    copy.tags.push("sync-conflict".into());
    // Deterministic content makes a retry idempotent, even after a process restart.
    Ok(copy)
}
fn preserve_conflict(store: &Store, note: &Notebook) -> Result<(), String> {
    let copy = conflict_copy(note)?;
    if store.get_note(&copy.id).is_err() {
        store.save_note(&copy)?;
    }
    Ok(())
}
fn io<'a>(lock: &'a Mutex<()>) -> Result<std::sync::MutexGuard<'a, ()>, String> {
    lock.lock()
        .map_err(|_| "Local storage is busy after an unexpected failure. Restart QUANTA.".into())
}
pub async fn run(store: &Store, io_lock: &Mutex<()>) -> Result<SyncStatus, String> {
    let settings = {
        let _guard = io(io_lock)?;
        store.settings()?
    };
    let token = oauth::access_token(&settings).await?;
    let drive = Drive::new(token)?;
    let root = drive.folder(None, "QUANTA", "root").await?;
    let notes_folder = drive.folder(Some(&root), "Notebooks", "notebooks").await?;
    let exports_folder = drive.folder(Some(&root), "Exports", "exports").await?;
    let query = format!("trashed=false and '{notes_folder}' in parents");
    let mut remote = drive.list(&query).await?;
    let mut index = {
        let _g = io(io_lock)?;
        store.sync_index()?
    };
    index.folder_id = root;
    // Each notebook revision is immutable in Drive. Two devices cannot overwrite one another's bytes.
    let tombstones = {
        let _g = io(io_lock)?;
        store.sync_index()?.tombstones
    };
    for (id, date) in tombstones {
        let hash = format!("deleted:{date}");
        let existing = remote
            .iter()
            .find(|f| f.note_id() == id && f.hash() == hash)
            .cloned();
        let parent = index
            .entries
            .get(&id)
            .map(|e| e.base_hash.as_str())
            .unwrap_or("");
        let file=match existing{Some(f)=>f,None=>drive.upload(&notes_folder,&format!("{id}.qtrash"),"application/json",json!({"id":id,"deletedAt":date}).to_string().into_bytes(),json!({"quantaId":id,"quantaHash":hash,"quantaParent":parent,"quantaDeleted":"true"}),None).await?};
        index.entries.insert(
            id.clone(),
            SyncEntry {
                remote_id: file.id.clone(),
                base_hash: hash,
            },
        );
        remote.push(file);
        let _g = io(io_lock)?;
        let current = store.sync_index()?;
        index.tombstones = current.tombstones;
        index.tombstones.remove(&id);
        store.save_sync_index(&index)?;
    }
    let mut groups: BTreeMap<String, Vec<RemoteFile>> = BTreeMap::new();
    for file in remote
        .iter()
        .filter(|f| uuid::Uuid::parse_str(f.note_id()).is_ok())
    {
        groups
            .entry(file.note_id().into())
            .or_default()
            .push(file.clone());
    }
    for (id, files) in &groups {
        let mut heads = remote_heads(files);
        let Some(winner) = heads.pop() else { continue };
        // Preserve every concurrent cloud branch, not just the last uploaded branch.
        for losing in heads.iter().filter(|f| !f.deleted()) {
            let note = drive.download(losing).await?;
            let _g = io(io_lock)?;
            preserve_conflict(store, &note)?;
        }
        if winner.deleted() {
            let _g = io(io_lock)?;
            if let Ok(local) = store.get_note(id) {
                // A local restore advances from the deletion marker and must be uploaded.
                if index
                    .entries
                    .get(id)
                    .is_some_and(|e| e.base_hash == winner.hash())
                {
                    continue;
                }
                let local_hash = hash_note(&local)?;
                if ![winner.parent(), winner.hash()].contains(&local_hash.as_str()) {
                    preserve_conflict(store, &local)?;
                }
                write_json(
                    &store.root.join("trash").join(format!("{id}.quanta")),
                    &local,
                )?;
                std::fs::remove_file(store.root.join("notes").join(format!("{id}.quanta")))
                    .map_err(|e| e.to_string())?;
            }
            index.entries.insert(
                id.clone(),
                SyncEntry {
                    remote_id: winner.id.clone(),
                    base_hash: winner.hash().into(),
                },
            );
            index.tombstones = store.sync_index()?.tombstones;
            store.save_sync_index(&index)?;
            continue;
        }
        let local = {
            let _g = io(io_lock)?;
            store.get_note(id).ok()
        };
        let base = index.entries.get(id).map(|e| e.base_hash.as_str());
        let action = local
            .as_ref()
            .map(|n| hash_note(n).map(|h| merge_action(base, &h, winner.hash())))
            .transpose()?
            .unwrap_or(Merge::Pull);
        if action == Merge::Pull || action == Merge::Conflict {
            let downloaded = drive.download(&winner).await?;
            let _g = io(io_lock)?;
            let current = store.get_note(id).ok();
            if let Some(current) = &current {
                // Recheck after the network await: the editor may have saved a newer revision.
                let h = hash_note(current)?;
                if h != winner.hash() && base != Some(h.as_str()) {
                    preserve_conflict(store, current)?;
                }
            }
            store.accept_remote(&downloaded)?;
            index.entries.insert(
                id.clone(),
                SyncEntry {
                    remote_id: winner.id.clone(),
                    base_hash: winner.hash().into(),
                },
            );
        } else if action == Merge::Same {
            index.entries.insert(
                id.clone(),
                SyncEntry {
                    remote_id: winner.id.clone(),
                    base_hash: winner.hash().into(),
                },
            );
        }
        let _g = io(io_lock)?;
        index.tombstones = store.sync_index()?.tombstones;
        store.save_sync_index(&index)?;
    }
    let locals = {
        let _g = io(io_lock)?;
        store.list_notes()?
    };
    for note in locals {
        let hash = hash_note(&note)?;
        if index
            .entries
            .get(&note.id)
            .is_some_and(|e| e.base_hash == hash)
        {
            continue;
        }
        let parent = index
            .entries
            .get(&note.id)
            .map(|e| e.base_hash.clone())
            .unwrap_or_default();
        let file = match remote
            .iter()
            .find(|f| f.note_id() == note.id && f.hash() == hash)
        {
            Some(f) => f.clone(),
            None => {
                drive
                    .upload(
                        &notes_folder,
                        &format!("{} - r{}.quanta", safe_name(&note.title), note.revision),
                        "application/vnd.quanta.notebook+json",
                        serde_json::to_vec_pretty(&note).map_err(|e| e.to_string())?,
                        json!({"quantaId":note.id,"quantaHash":hash,"quantaParent":parent}),
                        None,
                    )
                    .await?
            }
        };
        let _g = io(io_lock)?;
        index.entries.insert(
            note.id.clone(),
            SyncEntry {
                remote_id: file.id,
                base_hash: hash,
            },
        );
        index.tombstones = store.sync_index()?.tombstones;
        store.save_sync_index(&index)?;
    }
    let jobs = {
        let _g = io(io_lock)?;
        store.export_jobs()?
    };
    let mut exports = drive
        .list(&format!("trashed=false and '{exports_folder}' in parents"))
        .await?;
    for job in jobs {
        if exports
            .iter()
            .any(|f| f.app_properties.get("quantaJob") == Some(&job.id))
        {
            let _g = io(io_lock)?;
            store.finish_export(&job.id)?;
            continue;
        }
        let replace = if job.replace {
            exports
                .iter()
                .find(|f| f.name == job.name)
                .map(|f| f.id.clone())
        } else {
            None
        };
        let bytes = {
            let _g = io(io_lock)?;
            store.export_bytes(&job.id)?
        };
        let file = drive
            .upload(
                &exports_folder,
                &job.name,
                &job.mime,
                bytes,
                json!({"quantaJob":job.id}),
                replace.as_deref(),
            )
            .await?;
        exports.push(file);
        let _g = io(io_lock)?;
        store.finish_export(&job.id)?;
    }
    let _g = io(io_lock)?;
    index.last_sync = Some(chrono::Utc::now().to_rfc3339());
    index.tombstones = store.sync_index()?.tombstones;
    store.save_sync_index(&index)?;
    Ok(SyncStatus {
        connected: true,
        state: "idle".into(),
        last_sync: index.last_sync,
        pending: store.pending_count()?,
        message: "Your notebooks are up to date.".into(),
        account: index.account,
    })
}
pub fn safe_name(name: &str) -> String {
    let s: String = name
        .chars()
        .map(|c| {
            if c.is_control() || "<>:\"/\\|?*".contains(c) {
                '_'
            } else {
                c
            }
        })
        .take(150)
        .collect();
    if s.trim().is_empty() {
        "Scientific note".into()
    } else {
        s
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn merge_never_overwrites_both_sides_of_a_conflict() {
        assert_eq!(merge_action(Some("base"), "base", "remote"), Merge::Pull);
        assert_eq!(merge_action(Some("base"), "local", "base"), Merge::Push);
        assert_eq!(
            merge_action(Some("base"), "local", "remote"),
            Merge::Conflict
        );
        assert_eq!(merge_action(None, "same", "same"), Merge::Same);
        assert_eq!(merge_action(None, "local", "remote"), Merge::Conflict);
    }
    #[test]
    fn immutable_branches_remain_visible() {
        let file = |hash: &str, parent: &str, time: &str| RemoteFile {
            id: hash.into(),
            name: "Test".into(),
            created_time: time.into(),
            app_properties: BTreeMap::from([
                ("quantaHash".into(), hash.into()),
                ("quantaParent".into(), parent.into()),
            ]),
        };
        let heads = remote_heads(&[
            file("base", "", "1"),
            file("a", "base", "2"),
            file("b", "base", "3"),
        ]);
        assert_eq!(heads.len(), 2);
        assert_eq!(heads[0].hash(), "a");
        assert_eq!(heads[1].hash(), "b");
    }
}
