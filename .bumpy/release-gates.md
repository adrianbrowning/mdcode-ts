---
mdcode-ts: patch
---

Fixed the README's library examples: the `parse()` and `update()` examples now run as written, and code blocks no longer carry `file=` paths to files that were never committed, so `mdcode update` works on the README itself. Releases now publish only after type check, lint, build, tests, a docs-sync check and the README's `runnable=true` examples all pass.
