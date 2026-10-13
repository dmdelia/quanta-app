# Validation record

Initial implementation, 13 October 2026. This record distinguishes completed checks from build instructions and pending runtime tests.

## Executed locally

- TypeScript strict compilation: passed.
- Production frontend build: passed.
- Standalone web build with relative assets, service worker, and validated browser TeX WebAssembly: passed.
- Frontend tests (14 passed): save serialization, failure retention, concurrent flushes, equation interchange, Markdown sanitization, file validation, StarMath conversion, and IndexedDB persistence.
- Rust core tests (11 passed): atomic local storage, stale-write refusal, path validation, recovery of healthy notes beside a damaged file, trash/restore, durable export queues, password hashing, PKCE, callback state checks, and immutable conflict branches.
- Rust core Clippy with warnings denied: passed.
- Rust formatting check: passed.
- Pinned desktop Tectonic executable download: succeeded.

## Blocked or pending

- Native Windows and Apple Silicon builds: pending the new GitHub repository and its matching-host Actions jobs. The current build container lacks Linux WebKitGTK development dependencies; this does not constitute a successful native build.
- Full desktop TeX compile: the package-bundle endpoint is unavailable from this environment. Engine preparation correctly fails rather than claiming an offline cache was completed.
- Real-browser UI/visual checks: the required local browser download did not complete in this managed environment. E2E specifications are included and required by CI.
- Actual Google sign-in, token persistence, two-device sync, and Drive export: pending valid OAuth registrations and a runtime authorization. Algorithm tests are not a substitute for those live checks.
- Browser TeX runtime compilation: pending a real browser and access to the upstream package service.
- macOS installation/launch, Windows installation/launch, signing, and notarization: pending actual platform builds and runtime sessions.
- GitHub repository creation: stopped after the user corrected the intended account. No repository was created in the earlier account.
- GitHub Pages publication: deliberately dependent on successful native build jobs. No Pages deployment has been claimed.

## Follow-up acceptance checks

1. Finish sign-in to the intended GitHub account, create QUANTA with the intended audience, and push the reviewed source.
2. Run the Actions pipeline and resolve all E2E and platform build errors.
3. Download the native artifacts, verify checksums, and perform launch and save/reopen checks on Windows and Apple Silicon.
4. Register the Desktop and Web clients in one Google Cloud project, configure through the app, and verify offline editing followed by successful sync.
5. Verify actual PDF/PNG/HTML exports, real TeX compilation, and an enabled example plugin.
6. Enable Pages for the correct repository and plan, then verify the deployed URL, subpath assets, offline reload, and browser Google sign-in.

The implementation is not yet declared feature-complete or bug-free. Broad LaTeX support comes from the TeX engines; full LibreOffice native-format and formatting compatibility is not implemented. See compatibility.md.
