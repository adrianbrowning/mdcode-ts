---
mdcode-ts: minor
---

Removed `transform()` and `transformWithFunction()`, which printed every block to the console and `transform()` read stdin; use `update({ source, transformer, filter })` instead. Added `update({ onBlock })` to report each block as it finishes, and `extract()` now throws an `invalid_usage` error for `updateSource` with `ignoreAnonymous`.
