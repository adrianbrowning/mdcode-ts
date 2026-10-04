---
mdcode-ts: patch
---

Added a ready-to-copy CI script, `examples/ci/check-docs-sync.mjs`, that checks one or more Markdown documents with `update --check` and exits 0 when all are in sync, 1 on drift, and 2 when a document could not be checked. The README shows how to run it locally and from GitHub Actions.
