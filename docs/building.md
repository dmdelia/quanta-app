# Building and releases

Users install the release application. These commands are for developers and CI, not normal setup.

## Targets

- Windows x64: `x86_64-pc-windows-msvc`, setup `.exe` and optional portable executable.
- Apple Silicon: `aarch64-apple-darwin`, `.app` and `.dmg`.
- Web: static Vite output, installed editor assets, IndexedDB, Google Identity Services, and a service worker.

Build a native application on the matching host. Tauri needs the platform build toolchain: Xcode on macOS, Visual Studio C++ build tools on Windows, and WebKitGTK development packages on Linux. The user's installed application does not need those developer tools.

```sh
npm ci
npm run engine:prepare
npm run check
npm run desktop:build
```

The engine script downloads pinned Tectonic 0.17.0 from the upstream release, copies the correct executable to Tauri's external-binary location, and warms a scientific TeX cache. Network failure during warm-up makes the release preparation fail explicitly; CI must not silently claim a complete offline package.

Normal notebook startup does not require TeX compilation. TeX runs in a separate process, with known unsafe TeX features disabled and a two-minute timeout. Uncached packages are fetched by Tectonic when needed.

## Automated pipeline

`build.yml` checks TypeScript, unit tests, and real-browser editor tests, then builds both native platforms. It uploads distributions and browser evidence for each commit. After successful native builds and launch smoke checks, it creates a preview release with installers, the app archive, source, plugin examples, and checksums. A dependent web job builds the static Pages artifact after the native jobs and release succeed. The deployment job publishes only when Pages has been enabled for the repository and the triggering branch is `main`.

The native jobs execute Rust tests and checks on their own OS. They use pinned lockfiles, prepare the matching TeX sidecar and cache, and compile the seed document again with `--only-cached` before building the installers. macOS archives preserve executable permissions. Windows installs its actual NSIS installer silently into a temporary CI directory. Both jobs start the native executable and reject an immediate exit during a ten-second smoke check. This verifies a basic launch; interacting with the editor, Google OAuth, and installation under a normal user account still needs a real platform session.

Enable Pages once from repository Settings → Pages → Build and deployment → Source → GitHub Actions. The standard `GITHUB_TOKEN` cannot initially enable a Pages site. Once enabled, the workflow maintains deployments automatically. A private repository requires an account plan that supports private-repository Pages. Do not make the source public automatically. A separate public repository containing only the built web assets is an alternative when needed.

## Signing

Unsigned/ad-hoc-signed binaries can be built without paid developer accounts. Trusted Windows signing and Apple notarization require valid distribution identities. If those credentials are not provided, describe the release as unsigned/ad-hoc-signed and do not claim frictionless installation.

Signing secrets, if configured later, belong in GitHub Actions secrets. They are build-time distribution credentials; end users never need an `.env` file.

## Checksums and contents

Release downloads should include installers, a source archive, `.qplugin` examples, and SHA-256 checksums. Do not package `node_modules`, Rust build targets, OAuth credentials, actual notebooks, password records, or private workspace data in source downloads.
