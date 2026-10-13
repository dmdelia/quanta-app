#[cfg(feature = "desktop")]
pub mod desktop;

#[cfg(test)]
mod interop_tests {
    #[test]
    fn matches_web_notebook_canonicalization() {
        let note: crate::models::Notebook =
            serde_json::from_str(include_str!("../../tests/fixtures/hash-notebook.json")).unwrap();
        let reference: serde_json::Value =
            serde_json::from_str(include_str!("../../tests/fixtures/hash-reference.json")).unwrap();
        let hash = crate::store::hash_note(&note).unwrap();
        assert_eq!(hash, reference["hash"].as_str().unwrap());
        let copy = uuid::Uuid::new_v5(
            &uuid::Uuid::NAMESPACE_URL,
            format!("quanta-conflict:{}:{hash}", note.id).as_bytes(),
        );
        assert_eq!(copy.to_string(), reference["conflictId"].as_str().unwrap());
    }
}
pub mod models;
pub mod oauth;
pub mod plugins;
pub mod store;
pub mod sync;
pub mod tex;
