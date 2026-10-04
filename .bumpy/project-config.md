---
mdcode-ts: minor
---

Added `mdcode.config.json`: `update` and `extract` read documents (paths or globs), `sourceRoot`, `outputRoot` and default filters with `--project` or `--config <path>`, and take several Markdown files. Under `--json`, both now report `result.documents`, and errors name their `document`. Needs Node 22.17 or later.
