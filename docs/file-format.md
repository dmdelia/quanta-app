# `.quanta` notebook format, version 1

Files are UTF-8 JSON. This format is deliberately inspectable and recoverable.

Required fields: `format: "quanta.notebook"`, `schemaVersion: 1`, a UUID `id`, `title`, ISO-8601 `createdAt` and `updatedAt`, a non-negative integer `revision`, and a ProseMirror JSON `content` document with `type: "doc"` and a `content` array.

Additional fields: `project`, `tags`, `favorite`, and `texSource`. Images are embedded as data URLs, so a copied notebook is self-contained. Notebooks have a 32 MB supported limit; individual imported images have an 8 MB UI limit.

The visual math nodes are:

```json
{"type":"mathInline","attrs":{"latex":"x_i"}}
{"type":"mathBlock","attrs":{"latex":"E=mc^2"}}
```

The standard text, heading, list, quote, code, image, and table nodes follow the Tiptap/ProseMirror document schema. Math expressions remain source strings, rather than screenshots.

Rust saves write a temporary file in the same directory, sync it, then atomically replace the destination. The main workspace stores notes, snapshots, trash, sync metadata, export jobs, plugins, and the TeX cache separately. Damaged notes are retained and reported without hiding healthy ones.

The Drive hash is SHA-256 of the canonical notebook JSON, using the Rust struct field order and sorted nested JSON object keys. Web and desktop implementations must keep the canonicalization compatible. Each cloud revision stores `quantaId`, `quantaHash`, and `quantaParent` app properties.
