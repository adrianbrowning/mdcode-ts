---
"mdcode-ts": minor
---

**Behaviour change:** `extract` no longer overwrites pre-existing files that a block describes in
full. Such targets are skipped with a warning; pass `--force` for the old behaviour. When anything is
skipped the count is reported even under `--quiet` and the CLI exits with status 2, so a pipeline
cannot mistake "wrote nothing" for success.

`extract` now splices `region=` blocks in place instead of rewriting the whole file, so surrounding
code and untouched regions survive, and aliased `file=` paths pointing at one file resolve to a
single write. Region markers are written and matched in the block language's own comment syntax, so
shell, SQL, CSS and block-comment markers splice instead of being duplicated.

A target is left byte-identical rather than spliced when it is a symlink, is not valid UTF-8, has a
region it never closes or names inconsistently, declares a region twice, or when the blocks for one
file mix `region=` with whole-file blocks. Writes go through a temp file and `rename`, preserving the
target's permission bits, so an interrupted write cannot truncate a source file.

Install and import docs now name the published package `mdcode-ts`; they previously pointed at a
name that resolved to the upstream fork.
