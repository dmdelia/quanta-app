# Validation record

Verified preview: [QUANTA 0.1.0 Preview 8](https://github.com/dmdelia/quanta-app/releases/tag/v0.1.0-preview.8).
Source commit: `39bd2b83d1d53fca2025083ebeeb12a9df0efcb6`.
[CI run 8](https://github.com/dmdelia/quanta-app/actions/runs/38481735803), 13 October 2026 (UTC).

## Passed in the matching CI run

- Strict TypeScript compilation and production frontend build.
- 15 frontend unit tests: save serialization and failure retention, document interchange, Markdown sanitization, StarMath conversion, IndexedDB persistence, and concurrent notebook/export preservation.
- 11 Rust core tests, Clippy with warnings denied, and Rust formatting.
- Three real-browser notebook tests: fast creation and typing followed by save/reload/password unlock; equations, themes, focus mode, and Markdown download; custom macro expansion and actual PDF/PNG exports. PDF pages are rasterized for checks of opaque document content and prevention of a repeated title. PNG pixels are checked for visible content.
- Apple Silicon: target compilation, bundled Tectonic, offline scientific TeX compilation, .app/.dmg packaging, ad-hoc signature verification, and a ten-second packaged-app launch smoke check.
- Windows x64: target compilation, bundled Tectonic, offline scientific TeX compilation, setup .exe packaging, silent installation, installed-engine presence, and a ten-second installed-app launch smoke check.
- Production web app under /quanta-app/: offline reload and password unlock, persisted worker plugin execution, actual browser TeX PDF compilation, and PNG export of the compiled document.
- Release publication with both platforms, source archive, example plugins, and SHA-256 checksums.

## Remaining acceptance and setup

- GitHub Pages deployment is blocked only by the repository setting. Configure Settings → Pages → Source → GitHub Actions, then rerun the failed Pages job. The deployment attempt returned “Get Pages site failed” / 404 because no Pages site is enabled. The connector cannot edit this administration setting, and the standard workflow token cannot initially enable it.
- Google authorization, OS keychain persistence with real credentials, two-device Drive sync, and Drive export need the user's Desktop and Web OAuth registrations in one Google Cloud project. Configure them in the app UI; no environment file is required. These live operations have not been claimed as tested.
- Interactive acceptance on the user's own Mac and Windows computer remains necessary. CI launches are smoke checks, and the shared editor was exercised in Chromium.
- macOS builds are ad-hoc signed without Apple notarization. Windows builds have no trusted publisher signature. Trusted signing credentials were not provided.
- No low-end hardware benchmark has been claimed.

## Deliberate limits

QUANTA is a tested preview, not a declaration that every feature or failure case is bug-free. It does not implement native LibreOffice .odf files or every StarMath formatting directive. The TeX workspace edits one document source; an attachment manager for arbitrary multi-file TeX projects is not implemented. Desktop uses Tectonic/XeTeX; browser uses the pinned PDFTeX WebAssembly engine with a bundled, checksum-verified format and on-demand TeX Live 2020 packages. See [compatibility](compatibility.md) and [Google Drive](google-drive.md).

The local password is an interface and command gate, not disk encryption. The static web password and workspace belong to the browser profile. Drive authorization in the browser is per session; desktop uses the OS keychain for refresh tokens.
