---
mdcode-ts: minor
---

Added stable block names: `name=` identifies a block, must be unique within a document, and every command can select it with `-n, --name`. Metadata values can now be double-quoted, as in `file="getting started.ts"`, with `\"` and `\\` escapes. `list` shows names, including in `--json`. **Behaviour change:** commands and `parse()` now refuse a document whose metadata has an unterminated quote, an invalid escape, a repeated key, an empty name, or a duplicate name, and throw `MetadataError` listing each problem by line.
