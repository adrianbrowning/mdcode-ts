# Changelog

## 0.1.0
<sub>2026-10-03</sub>

- *(minor)*
  **Behaviour change:** `extract` no longer overwrites pre-existing files that a block describes in
  full. Such targets are skipped with a warning; pass `--force` for the old behaviour. When anything is
  skipped the count is reported even under `--quiet` and the CLI exits with status 2, so a pipeline
  cannot mistake "wrote nothing" for success.

  `extract` now splices `region=` blocks in place instead of rewriting the whole file, so surrounding
  code and untouched regions survive, and aliased `file=` paths pointing at one file resolve to a
  single write. Region markers are written and matched in the block language's own comment syntax, so
  shell, SQL, CSS and block-comment markers splice instead of being duplicated.

  A relative `file=` is honoured as written even when it resolves outside `--dir`
  (`file=../../shared-tests/where.ts`). An absolute `file=` is skipped. Generated `block-N.ext` names
  for blocks without `file=` always land inside `--dir`. A skip sets exit status 2 without cutting off
  `--update-source` markdown piped to stdout.

  A target is left byte-identical rather than spliced when it is a symlink, is not valid UTF-8, has a
  region it never closes or names inconsistently, declares a region twice, or when the blocks for one
  file mix `region=` with whole-file blocks. Two blocks that declare the same `region=` for one file
  are refused, whether the file exists or not, rather than keeping only one body. Writes go through a
  temp file and `rename`, preserving the target's permission bits, so an interrupted write cannot
  truncate a source file.

  Install and import docs now name the published package `mdcode-ts`; they previously pointed at a
  name that resolved to the upstream fork.
- *(minor)*
  Added CommonMark-style tilde fences and fences of any length from three up. Unlike CommonMark, an opening fence may still have any indent, so fences in nested lists keep working. Fixed `extract --update-source` writing `file=` onto the wrong fence when one fence contained another.

  Behaviour changes: a closing fence may now be indented up to three spaces more than its opener, and a backtick fence whose info string contains a backtick no longer opens a block.
