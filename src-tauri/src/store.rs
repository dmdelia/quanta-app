use crate::models::*;
use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use rand::rngs::OsRng;
use serde::{de::DeserializeOwned, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

#[derive(Clone)]
pub struct Store {
    pub root: PathBuf,
}

pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("Invalid file path.")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let mut tmp = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    tmp.write_all(bytes).map_err(|e| e.to_string())?;
    tmp.as_file().sync_all().map_err(|e| e.to_string())?;
    tmp.persist(path).map_err(|e| e.error.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600)).map_err(|e| e.to_string())?;
        fs::File::open(parent)
            .and_then(|f| f.sync_all())
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
pub fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?;
    atomic_write(path, &bytes)
}
pub fn read_json<T: DeserializeOwned>(path: &Path) -> Result<T, String> {
    let bytes = fs::read(path).map_err(|e| {
        format!(
            "Cannot read {}: {e}",
            path.file_name().unwrap_or_default().to_string_lossy()
        )
    })?;
    serde_json::from_slice(&bytes).map_err(|e| {
        format!(
            "Cannot parse {}: {e}",
            path.file_name().unwrap_or_default().to_string_lossy()
        )
    })
}
pub fn hash_note(note: &Notebook) -> Result<String, String> {
    let value = serde_json::to_vec(note).map_err(|e| e.to_string())?;
    Ok(format!("{:x}", Sha256::digest(value)))
}

impl Store {
    pub fn new(root: PathBuf) -> Result<Self, String> {
        for dir in [
            "notes",
            "trash",
            "versions",
            "export-queue",
            "plugins",
            "tex-cache",
            "recovery",
        ] {
            fs::create_dir_all(root.join(dir)).map_err(|e| e.to_string())?;
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&root, fs::Permissions::from_mode(0o700))
                .map_err(|e| e.to_string())?;
        }
        Ok(Self { root })
    }
    fn note_path(&self, dir: &str, id: &str) -> Result<PathBuf, String> {
        uuid::Uuid::parse_str(id).map_err(|_| "Invalid notebook ID.")?;
        Ok(self.root.join(dir).join(format!("{id}.quanta")))
    }
    pub fn settings(&self) -> Result<Settings, String> {
        let path = self.root.join("settings.json");
        if !path.exists() {
            return Ok(Settings::default());
        }
        read_json(&path)
    }
    pub fn save_settings(&self, settings: &Settings) -> Result<(), String> {
        settings.validate()?;
        write_json(&self.root.join("settings.json"), settings)
    }
    pub fn needs_password(&self) -> bool {
        !self.root.join("password.hash").exists()
    }
    pub fn set_password(&self, password: &str) -> Result<(), String> {
        if password.chars().count() < 6 || password.len() > 1024 {
            return Err("Use a password between 6 and 1024 characters.".into());
        }
        let salt = SaltString::generate(&mut OsRng);
        let hash = Argon2::default()
            .hash_password(password.as_bytes(), &salt)
            .map_err(|e| e.to_string())?
            .to_string();
        atomic_write(&self.root.join("password.hash"), hash.as_bytes())
    }
    pub fn verify_password(&self, password: &str) -> Result<(), String> {
        if password.len() > 1024 {
            return Err("The password does not match.".into());
        }
        let hash = fs::read_to_string(self.root.join("password.hash"))
            .map_err(|_| "QUANTA has no password yet.")?;
        let parsed =
            PasswordHash::new(&hash).map_err(|_| "The local password record is damaged.")?;
        Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .map_err(|_| "The password does not match.".into())
    }
    fn list_dir(&self, dir: &str) -> Result<(Vec<Notebook>, Vec<String>), String> {
        let mut notes = vec![];
        let mut problems = vec![];
        for entry in fs::read_dir(self.root.join(dir)).map_err(|e| e.to_string())? {
            let path = entry.map_err(|e| e.to_string())?.path();
            if path.extension().and_then(|s| s.to_str()) != Some("quanta") {
                continue;
            }
            let parsed = read_json::<Notebook>(&path).and_then(|n| {
                n.validate()?;
                Ok(n)
            });
            match parsed {
                Ok(n) => notes.push(n),
                Err(e) => problems.push(e),
            }
        }
        notes.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        Ok((notes, problems))
    }
    pub fn list_notes(&self) -> Result<Vec<Notebook>, String> {
        Ok(self.list_dir("notes")?.0)
    }
    pub fn recovery_notices(&self) -> Result<Vec<String>, String> {
        Ok(self.list_dir("notes")?.1)
    }
    pub fn list_trash(&self) -> Result<Vec<Notebook>, String> {
        Ok(self.list_dir("trash")?.0)
    }
    pub fn get_note(&self, id: &str) -> Result<Notebook, String> {
        let n: Notebook = read_json(&self.note_path("notes", id)?)?;
        n.validate()?;
        Ok(n)
    }
    pub fn save_note(&self, note: &Notebook) -> Result<(), String> {
        note.validate()?;
        let path = self.note_path("notes", &note.id)?;
        if path.exists() {
            let old: Notebook = read_json(&path)?;
            if note.revision <= old.revision && hash_note(&old)? != hash_note(note)? {
                return Err(
                    "A newer version exists on disk. Reload this notebook before continuing."
                        .into(),
                );
            }
            if hash_note(&old)? == hash_note(note)? {
                return Ok(());
            }
            self.snapshot(&old)?;
        }
        write_json(&path, note)
    }
    pub fn accept_remote(&self, note: &Notebook) -> Result<(), String> {
        note.validate()?;
        let path = self.note_path("notes", &note.id)?;
        if path.exists() {
            self.snapshot(&read_json::<Notebook>(&path)?)?;
        }
        write_json(&path, note)
    }
    fn snapshot(&self, note: &Notebook) -> Result<(), String> {
        let dir = self.root.join("versions").join(&note.id);
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let mut paths = fs::read_dir(&dir)
            .map_err(|e| e.to_string())?
            .filter_map(Result::ok)
            .map(|e| e.path())
            .collect::<Vec<_>>();
        paths.sort();
        let recent = paths
            .last()
            .and_then(|p| fs::metadata(p).ok())
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.elapsed().ok())
            .is_some_and(|d| d.as_secs() < 60);
        if recent {
            return Ok(());
        }
        let name = format!(
            "{}-{:020}.quanta",
            chrono::Utc::now().format("%Y%m%dT%H%M%S%3f"),
            note.revision
        );
        write_json(&dir.join(name), note)?;
        if paths.len() >= 20 {
            for path in paths.drain(..paths.len() - 19) {
                fs::remove_file(path).map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    }
    pub fn list_versions(&self, id: &str) -> Result<Vec<Version>, String> {
        uuid::Uuid::parse_str(id).map_err(|_| "Invalid notebook ID.")?;
        let dir = self.root.join("versions").join(id);
        if !dir.exists() {
            return Ok(vec![]);
        }
        let mut versions = vec![];
        for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
            let path = entry.map_err(|e| e.to_string())?.path();
            if path.extension().and_then(|s| s.to_str()) != Some("quanta") {
                continue;
            }
            let n: Notebook = read_json(&path)?;
            versions.push(Version {
                file: path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into(),
                updated_at: n.updated_at,
                title: n.title,
                revision: n.revision,
            });
        }
        versions.sort_by(|a, b| b.file.cmp(&a.file));
        Ok(versions)
    }
    pub fn restore_version(&self, id: &str, file: &str) -> Result<Notebook, String> {
        uuid::Uuid::parse_str(id).map_err(|_| "Invalid notebook ID.")?;
        if file.contains(['/', '\\']) || !file.ends_with(".quanta") {
            return Err("Invalid version path.".into());
        }
        let mut note: Notebook = read_json(&self.root.join("versions").join(id).join(file))?;
        if note.id != id {
            return Err("That version belongs to another notebook.".into());
        }
        note.revision = self.get_note(id)?.revision + 1;
        note.updated_at = chrono::Utc::now().to_rfc3339();
        self.save_note(&note)?;
        Ok(note)
    }
    pub fn trash_note(&self, id: &str) -> Result<(), String> {
        let note = self.get_note(id)?;
        write_json(&self.note_path("trash", id)?, &note)?;
        let mut index = self.sync_index()?;
        index
            .tombstones
            .insert(id.into(), chrono::Utc::now().to_rfc3339());
        self.save_sync_index(&index)?;
        fs::remove_file(self.note_path("notes", id)?).map_err(|e| e.to_string())
    }
    pub fn restore_note(&self, id: &str) -> Result<(), String> {
        let path = self.note_path("trash", id)?;
        let mut note: Notebook = read_json(&path)?;
        if let Ok(current) = self.get_note(id) {
            note.id = uuid::Uuid::new_v4().to_string();
            note.title = format!("{} (restored copy)", current.title);
        }
        note.updated_at = chrono::Utc::now().to_rfc3339();
        note.revision += 1;
        self.save_note(&note)?;
        let mut index = self.sync_index()?;
        index.tombstones.remove(id);
        self.save_sync_index(&index)?;
        fs::remove_file(path).map_err(|e| e.to_string())
    }
    pub fn sync_index(&self) -> Result<SyncIndex, String> {
        let p = self.root.join("sync.json");
        if p.exists() {
            read_json(&p)
        } else {
            Ok(SyncIndex::default())
        }
    }
    pub fn save_sync_index(&self, index: &SyncIndex) -> Result<(), String> {
        write_json(&self.root.join("sync.json"), index)
    }
    pub fn pending_count(&self) -> Result<usize, String> {
        let index = self.sync_index()?;
        let dirty = self
            .list_notes()?
            .iter()
            .filter(|n| {
                index
                    .entries
                    .get(&n.id)
                    .is_none_or(|e| hash_note(n).ok().as_deref() != Some(&e.base_hash))
            })
            .count();
        Ok(dirty + self.export_jobs()?.len() + index.tombstones.len())
    }
    pub fn queue_export(
        &self,
        name: &str,
        data: &str,
        mime: &str,
        replace: bool,
    ) -> Result<(), String> {
        if name.is_empty() || name.len() > 250 || name.contains(['/', '\\', '\0']) {
            return Err("Choose a plain export filename.".into());
        }
        if ![
            "application/pdf",
            "image/png",
            "image/svg+xml",
            "text/markdown",
            "text/plain",
            "text/html",
            "application/x-tex",
        ]
        .contains(&mime)
        {
            return Err("Unsupported export type.".into());
        }
        let bytes = decode_export(data)?;
        let id = uuid::Uuid::new_v4().to_string();
        let dir = self.root.join("export-queue");
        atomic_write(&dir.join(format!("{id}.bin")), &bytes)?;
        write_json(
            &dir.join(format!("{id}.json")),
            &ExportJob {
                id,
                name: name.into(),
                mime: mime.into(),
                replace,
            },
        )
    }
    pub fn export_jobs(&self) -> Result<Vec<ExportJob>, String> {
        let mut jobs = vec![];
        for e in fs::read_dir(self.root.join("export-queue")).map_err(|e| e.to_string())? {
            let p = e.map_err(|e| e.to_string())?.path();
            if p.extension().and_then(|s| s.to_str()) == Some("json") {
                jobs.push(read_json(&p)?);
            }
        }
        jobs.sort_by(|a: &ExportJob, b| a.id.cmp(&b.id));
        Ok(jobs)
    }
    pub fn export_bytes(&self, id: &str) -> Result<Vec<u8>, String> {
        uuid::Uuid::parse_str(id).map_err(|_| "Invalid export ID.")?;
        fs::read(self.root.join("export-queue").join(format!("{id}.bin")))
            .map_err(|e| e.to_string())
    }
    pub fn finish_export(&self, id: &str) -> Result<(), String> {
        uuid::Uuid::parse_str(id).map_err(|_| "Invalid export ID.")?;
        for ext in ["json", "bin"] {
            fs::remove_file(self.root.join("export-queue").join(format!("{id}.{ext}")))
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}
pub fn decode_export(data: &str) -> Result<Vec<u8>, String> {
    if data.len() > MAX_EXPORT_BYTES * 4 / 3 + 8 {
        return Err("Export exceeds 100 MB.".into());
    }
    let bytes = STANDARD.decode(data).map_err(|_| "Invalid export data.")?;
    if bytes.len() > MAX_EXPORT_BYTES {
        return Err("Export exceeds 100 MB.".into());
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn note() -> Notebook {
        Notebook {
            format: FORMAT.into(),
            schema_version: 1,
            id: uuid::Uuid::new_v4().to_string(),
            title: "Test".into(),
            project: "Physics".into(),
            tags: vec![],
            favorite: false,
            created_at: chrono::Utc::now().to_rfc3339(),
            updated_at: chrono::Utc::now().to_rfc3339(),
            revision: 1,
            content: serde_json::json!({"type":"doc","content":[{"type":"paragraph"}]}),
            tex_source: String::new(),
        }
    }
    #[test]
    fn saves_trashes_and_restores_without_data_loss() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path().into()).unwrap();
        let n = note();
        store.save_note(&n).unwrap();
        assert_eq!(store.list_notes().unwrap().len(), 1);
        store.trash_note(&n.id).unwrap();
        assert_eq!(store.list_notes().unwrap().len(), 0);
        store.restore_note(&n.id).unwrap();
        assert_eq!(store.get_note(&n.id).unwrap().title, n.title);
        assert!(store.sync_index().unwrap().tombstones.is_empty());
    }
    #[test]
    fn refuses_stale_writes_and_path_traversal() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path().into()).unwrap();
        let mut n = note();
        n.revision = 2;
        store.save_note(&n).unwrap();
        n.revision = 1;
        n.title = "stale".into();
        assert!(store.save_note(&n).is_err());
        assert!(store.get_note("../../password.hash").is_err());
        assert!(store.restore_version(&n.id, "../settings.json").is_err());
        assert_eq!(store.get_note(&n.id).unwrap().title, "Test");
    }
    #[test]
    fn corruption_is_reported_without_hiding_healthy_notes() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path().into()).unwrap();
        let n = note();
        store.save_note(&n).unwrap();
        fs::write(dir.path().join("notes/broken.quanta"), "{broken").unwrap();
        assert_eq!(store.list_notes().unwrap().len(), 1);
        assert_eq!(store.recovery_notices().unwrap().len(), 1);
        assert!(dir.path().join("notes/broken.quanta").exists());
    }
    #[test]
    fn export_queue_survives_restart() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path().into()).unwrap();
        store
            .queue_export(
                "paper.pdf",
                &STANDARD.encode(b"%PDF-test"),
                "application/pdf",
                true,
            )
            .unwrap();
        let restarted = Store::new(dir.path().into()).unwrap();
        let jobs = restarted.export_jobs().unwrap();
        assert_eq!(restarted.export_bytes(&jobs[0].id).unwrap(), b"%PDF-test");
        restarted.finish_export(&jobs[0].id).unwrap();
        assert!(restarted.export_jobs().unwrap().is_empty());
    }
    #[test]
    fn password_record_never_contains_plaintext() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path().into()).unwrap();
        store.set_password("my-long-test-password").unwrap();
        assert!(store.verify_password("my-long-test-password").is_ok());
        assert!(store.verify_password("wrong").is_err());
        assert!(!fs::read_to_string(dir.path().join("password.hash"))
            .unwrap()
            .contains("my-long-test-password"));
    }
}
