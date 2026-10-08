# Extract shrink guard

`mdcode extract` does not refuse, or ask for an extra flag, when a write would make an existing file
smaller.

## Why this is out of scope

The idea came from #21. There, a plain `extract` on a README whose blocks were excerpts
(`file=… region=…`) replaced 27 real source files with just those excerpts, and a "refuse writes that
shrink a file" check would have caught every one. That data loss is now prevented by what `extract`
writes, not by a size check:

- A block with `region=` is spliced into the existing file. Code outside the region, and regions the
  Markdown doesn't mention, are kept.
- Ambiguous mappings, such as several blocks for one file without distinct `region=` values, broken
  markers or unsafe paths, are refused before anything is written.
- Without `--force`, an existing file whose block has no `region=` is never overwritten; it is
  skipped and `extract` exits 2.

That leaves one way to shrink a file: `extract --force` on a whole-file block, where the block is the
entire file. `--force` already is the explicit opt-in to replace an existing file with the block's
contents. A shrink guard there would only mean a second flag (`--force --allow-shrink`) for the same
intent, and a block that legitimately removes code is exactly the case `--force` is for.

To see what `--force` would change before running it, use the check, which writes nothing:

```bash
mdcode extract --check --force README.md
# ✗ Out of sync: line 3: src/whole.ts differs from this block; extract would overwrite it
```

Splices that make a region shorter are ordinary code edits, so any threshold there (bytes, lines or a
ratio) would refuse normal changes or let real loss through.

## Prior requests

- #25: "extract: refuse writes that would shrink an existing file unless --force", split out of #21
