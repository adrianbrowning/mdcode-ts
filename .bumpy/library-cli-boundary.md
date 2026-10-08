---
mdcode-ts: minor
---

Removed `transform()` and `transformWithFunction()`, which printed every block to the console and `transform()` read stdin. `update({ source, transformer, filter })` replaces `transformWithFunction()` but reads each `file=` first, so a missing file is a `read_failed` error (thrown, or collected with `continueOnError`); use `walk()` to transform without reading files. Added `update({ onBlock })` to report each block as it finishes.
