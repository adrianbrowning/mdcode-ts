---
"mdcode-ts": minor
---

`extract` now splices `region=` blocks in place instead of overwriting the whole file, so surrounding code and untouched regions survive, and aliased `file=` paths pointing at the same file no longer clobber each other. Added `--force` to opt into overwriting existing non-region files. Region markers are written and matched with the block language's comment syntax, so block-comment markers (`/* #region x */`, `<!-- #region x -->`) splice instead of being duplicated.
