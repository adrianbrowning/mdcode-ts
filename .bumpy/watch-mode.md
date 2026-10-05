---
mdcode-ts: minor
---

Added `mdcode watch` and `watch()`. They check documents and the files their blocks read after every change, debounced, and report only the blocks that drifted or failed. `--apply` writes changes and ignores the change events of its own writes. Watching continues through read and configuration errors, and SIGINT stops it with exit 0.
