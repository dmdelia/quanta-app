# QUANTA

**A quiet notebook for scientific thinking.**

[Download preview builds](https://github.com/dmdelia/quanta-app/releases) · [Build status](https://github.com/dmdelia/quanta-app/actions) · [Validation](docs/VALIDATION.md)

QUANTA brings formatted notes, editable mathematics, Markdown, and a complete LaTeX source workspace together in a minimal desktop application. Rust handles local files, password verification, Google authorization, sync, and TeX compilation. A standalone web build shares the notebook editor and `.quanta` format, with IndexedDB, Google Identity Services, offline caching, and an on-demand PDFTeX WebAssembly worker.

## Everyday use

1. Install the Apple Silicon `.dmg` or Windows setup `.exe` from a verified release.
2. Set a local password on first launch. No server account, development environment, or `.env` file is needed for local writing.
3. Write a notebook. Use **Equation** for visual math or LaTeX input, and the command palette for Markdown insertion.
4. Organize with projects, tags, favorites, and search. Use focus mode when you want just the page.
5. Export the finished result or save an editable `.quanta` copy.
6. Optional: configure a Google OAuth client in **Settings → Google Drive** and authorize the Google account that should receive your files.

## Included

- Visual text editing with headings, lists, quotes, links, images, tables, code blocks, and undo/redo.
- Inline and display equations, hundreds of math commands, visual templates, and a core StarMath importer.
- A separate full-document LaTeX source editor with the bundled Tectonic engine on desktop.
- Atomic local saves, serialized autosave, up to 20 local snapshots, recoverable trash, and durable Drive-export queues.
- Google Drive sync attempts every 15 minutes while QUANTA is open and unlocked, plus manual sync and a retry when connectivity returns.
- Immutable cloud notebook revisions with conflict copies, compatible between desktop and web clients configured in the same Google Cloud project.
- Pearl, Graphite, Midnight, Sand, System, and Contrast themes; accent, font, spacing, paper, motion, performance, export, and lock settings.
- Optional interactive guided tour and documented worker plugins.
- PDF, PNG, SVG, Markdown, LaTeX, standalone HTML, and plain-text exports. Local export reuses the prior path; “as…” selects a new path. Drive exports can update a named result or create a separate result.

## Compatibility and limits

QUANTA's notebook equation editor and full TeX compiler have different capabilities. MathLive supports a broad mathematics command set; arbitrary LaTeX packages belong in the full-document source workspace. The StarMath importer covers the expression grammar implemented in `src/lib/starmath.ts`, not every LibreOffice formatting directive or native `.odf` file. See [compatibility](docs/compatibility.md).

The interface follows the Liquid Glass design language with CSS glass materials and restrained controls. It uses Tauri's native desktop window, with a web-rendered editor. It does not claim to use Apple's SwiftUI Liquid Glass component implementation.

Notebook PDF export preserves the visible page through high-resolution raster pages; compiled TeX PDF preserves TeX typesetting and vector text. In LaTeX mode, the export dialog produces PDF, PNG, or original TeX source from the current document, with all four destinations. PNG stacks the compiled pages into one image within the image-size limit. SVG notebook export contains a styled HTML `foreignObject`, so browser support is stronger than illustration-software import support.

Google requires an application OAuth registration. A desktop installer cannot invent one or reuse ChatGPT's Google authorization. Import the downloaded Desktop credentials in settings once. Configure the browser client separately. See [Google Drive](docs/google-drive.md).

The local password gates QUANTA's interface and native commands. It is not disk encryption; files remain readable by the OS account. In the web app the password is local to the browser profile. A public Pages app does not upload local notebooks to GitHub.

The release workflow builds unsigned/ad-hoc-signed personal-use installers unless valid signing credentials are configured. Apple notarization and a trusted Windows signing identity are separate distribution requirements.

## Development

Use Node 22.13+, Rust stable, and the platform prerequisites for Tauri 2.

```sh
npm ci
npm run engine:prepare
npm run desktop:dev
```

For frontend development: `npm run dev`. For a production web build: `npm run build:web`. For the desktop build: `npm run desktop:build`.

The GitHub Actions workflow builds on Windows and an Apple Silicon macOS runner, runs launch smoke checks, and publishes preview downloads with checksums. The dependent Pages deployment runs after both builds and the release pass. Enable its publishing source once in repository Settings → Pages → GitHub Actions. Read [building and releases](docs/building.md), [the file format](docs/file-format.md), and [the plugin API](docs/plugins.md).

## Project status

This source is the initial implementation. A release is usable only after the native pipeline succeeds and platform launch tests are completed. Check `docs/VALIDATION.md` for executed checks, pending checks, and current setup blockers. Do not infer a completed installer from the presence of a build workflow.
