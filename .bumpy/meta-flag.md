---
mdcode-ts: patch
---

Fixed `--meta` swallowing the Markdown file after it. `mdcode list --meta type=example README.md` used to read `README.md` as a second `key=value`, read stdin instead and report no blocks. `--meta` now takes one pair per flag; repeat it to require several (`-m type=example -m region=main`). A value containing `=` is now kept whole. The README and CLI examples no longer pass directories or several files to `list`, `run` and `dump`, or globs to `--file`, which matches `file=` exactly.
