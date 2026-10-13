# QUANTA plugins, API version 1

A plugin is a single `.qplugin` JSON bundle. Install it from **Settings → Plugins**, inspect its permissions, then enable it. Registered commands appear in the command palette. Plugins are optional and do not slow normal note editing when disabled.

## Bundle

```json
{
  "manifest": {
    "id": "quanta.example",
    "name": "Example tool",
    "version": "1.0.0",
    "description": "Insert a useful note fragment.",
    "apiVersion": 1,
    "author": "Your name",
    "entry": "plugin.js",
    "permissions": ["read-note", "insert-content"]
  },
  "source": "quanta.registerCommand({id:'example',title:'Example tool'}, async api => { api.insertMarkdown('## Observation\\n\\n'); });"
}
```

IDs use lowercase letters, digits, dots, and hyphens; they start with a letter and have 3 to 80 characters. Bundles are at most 600 KB and source at most 512 KB. The source is plain JavaScript, without dependencies or imports that require a bundler.

## Register commands

```js
quanta.registerCommand(
  { id: 'unit-reference', title: 'Insert SI reference' },
  async (api) => {
    api.insertMarkdown('## Units\n\n| Quantity | Unit |\n| --- | --- |\n| Time | s |\n| Length | m |\n');
    api.notify('SI reference inserted.');
  }
);
```

Registration happens when the worker starts. Each handler runs only when the user selects its command.

## Handler API

| Method | Permission | Behavior |
| --- | --- | --- |
| `api.getNotebook()` | `read-note` | Returns a structured copy of the selected `.quanta` document. |
| `api.insertMarkdown(text)` | `insert-content` | Inserts sanitized Markdown at the current notebook cursor. Maximum 50,000 characters per insertion. |
| `api.notify(text)` | None | Shows a short message. The UI limits its displayed length. |

The API does not expose filesystem paths, passwords, Google credentials, arbitrary native commands, or the whole notebook collection. The host validates insertion permissions on receipt.

Plugins run in Web Workers. There is no DOM or Tauri global in the worker. This separation is a performance and API boundary, not a security audit of third-party JavaScript; install code you trust. A browser build's normal browser sandbox and network rules also apply.

## Packaging an example

Edit `plugins/examples/*.js`, then run:

```sh
node scripts/package-plugins.mjs
```

The script writes installable examples in the same folder. No environment variables, credentials, or build tools are required by the user installing the resulting `.qplugin` file.

## Versioning

`apiVersion` is required and currently must be `1`. A future API version must keep existing version-1 bundles usable or return an explicit unsupported-version error. Plugin versions are descriptive strings and do not trigger automatic network updates.
