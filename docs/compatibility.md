# Mathematics and export compatibility

| Capability | Visual notebook | Full-document LaTeX |
| --- | --- | --- |
| Fractions, roots, scripts, operators, Greek, relations, sets | Yes | Yes |
| Integrals, limits, sums, products, matrices, cases, vectors, accents | Yes | Yes |
| Formatted text, images, tables, code, Markdown insertion | Yes | TeX commands |
| Arbitrary LaTeX document classes and packages | Not a mathfield feature | Supported when available to the bundled XeTeX-based engine |
| TikZ, siunitx, booktabs, bibliography | Use full-document source | TeX package workflow |
| Shell-escape programs or arbitrary external executables | No | Disabled in untrusted compilation |
| Native LibreOffice `.odf` formula files | Not implemented | Not a TeX format |
| Every StarMath formatting directive | Not implemented | Translate manually in source |

The core StarMath importer supports groups, fractions (`over`), roots, scripts, limits (`from`, `to`), matrices, stacks, scalable delimiters, accents, font styles, Greek symbols, relations, and common named operators. Unsupported directives raise a visible error. It is not marketed as full LibreOffice file compatibility.

The visual editor uses MathLive. HTML and notebook image/PDF export use KaTeX for static mathematics. Some MathLive-supported expressions may not be supported by KaTeX; the static output displays an error representation for those commands. Use compiled TeX PDF when exact typesetting for an advanced expression is required.

## Export distinctions

- `.quanta`: fully editable notebook with metadata, visual document JSON, embedded images, and optional TeX source.
- `.pdf` from the visual notebook: paginated raster representation. Text is not fully selectable.
- `.pdf` from TeX compilation: real TeX PDF, with vector text and formula typography.
- `.png`: high-resolution notebook image, or stacked compiled document pages in LaTeX mode; image-size limits prevent excessive allocation.
- `.svg`: scalable outer image with HTML `foreignObject` content. Best opened in a browser.
- `.md`: Markdown with inline and display LaTeX mathematics.
- `.tex`: standalone document source. Embedded notebook images are described as figure placeholders; use HTML, PNG, or notebook PDF for their pixels.
- `.html`: portable styled page with embedded math fonts and notebook images.
- `.txt`: plain readable text and equation source.

Advanced documents should be checked in the compiled-PDF workspace before sharing. First use of a TeX package outside the bundled scientific cache needs network access; subsequent use can use the cache.

## Document-source scope

Desktop uses the XeTeX-based Tectonic engine; the browser uses PDFTeX with a pinned format and TeX Live 2020 package downloads. Browser Unicode/font capabilities differ from XeTeX. The source workspace currently edits one .tex document. An attachment manager for arbitrary .bib files, figures, and multi-file projects is not implemented; notebook image exports preserve embedded image pixels, while generated TeX describes those images as placeholders.
