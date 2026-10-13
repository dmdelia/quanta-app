# Validation record

Initial implementation, 13 October 2026. This record distinguishes completed checks from build instructions and pending runtime tests.

## Executed locally

- TypeScript strict compilation: passed.
- Production frontend build: passed.
- Standalone web build with relative assets, service worker, and validated browser TeX WebAssembly: passed.
- Frontend tests (15 passed): save serialization, failure retention, concurrent flushes, equation interchange, Markdown sanitization, file validation, StarMath conversion, IndexedDB persistence, and preservation of concurrent notebook/export writes.
- Rust core tests (11 passed): atomic local storage, stale-write refusal, path validation, recovery of healthy notes beside a damaged file, trash/restore, durable export queues, password hashing, PKCE, callback state checks, and immutable conflict branches.
- Rust core Clippy with warnings denied: passed.
- Rust formatting check: passed.
- Pinned desktop Tectonic executable download: succeeded.

## Executed on GitHub Actions

- Repository: `dmdelia/quanta-app`; source and `AGENTS.md` published to `main`.
- Initial checks job, run 1: passed, including the two real-browser editor tests for save/reload/password, equation insertion, themes, focus mode, and Markdown download.
- Run 2 exposed a MathLive mount-order regression introduced by the visual macro wiring. The regression was fixed; run 3 passed all three browser specifications, including custom macro expansion and actual PDF/PNG downloads.
- Run 3 output inspection found a blank PNG despite a valid PNG signature. The export mount has been corrected, and the browser test now checks for visible ink. Production web tests also cover the Pages subpath, offline reload, worker plugin execution, and real browser TeX compilation. These additions await the next CI run.

## Blocked or pending

- Native Windows and Apple Silicon builds: matching-host Actions jobs are running. The current local build container lacks Linux WebKitGTK development dependencies; this does not constitute a successful native build.
- Full desktop TeX compile: the package-bundle endpoint is unavailable from this environment. Engine preparation correctly fails rather than claiming an offline cache was completed.
- Local real-browser UI/visual checks: the required local browser download did not complete in this managed environment. The original browser E2E tests passed in CI; generated screenshots and finished export files are retained by subsequent runs.
- Actual Google sign-in, token persistence, two-device sync, and Drive export: pending valid OAuth registrations and a runtime authorization. Algorithm tests are not a substitute for those live checks.
- Browser TeX runtime compilation: pending a real browser and access to the upstream package service.
- macOS installation/launch, Windows installation/launch, signing, and notarization: pending actual platform builds and runtime sessions.
- GitHub repository: the user supplied the public `dmdelia/quanta-app` repository. It is now populated; no repository was created in the earlier account.
- GitHub Pages publication: deliberately dependent on successful native build jobs. No Pages deployment has been claimed.

## Follow-up acceptance checks

1. Run the Actions pipeline and resolve all E2E and platform build errors.
2. Download the native artifacts, verify checksums, and perform launch and save/reopen checks on Windows and Apple Silicon.
3. Register the Desktop and Web clients in one Google Cloud project, configure through the app, and verify offline editing followed by successful sync.
4. Verify actual PDF/PNG/HTML exports, real TeX compilation, and an enabled example plugin.
5. Set Settings → Pages → Source to GitHub Actions, then verify the deployed URL, subpath assets, offline reload, and browser Google sign-in. The connector can publish repository code but cannot change the Pages administration setting; the standard workflow token cannot initially enable Pages either.

The implementation is not yet declared feature-complete or bug-free. Broad LaTeX support comes from the TeX engines; full LibreOffice native-format and formatting compatibility is not implemented. See compatibility.md.
