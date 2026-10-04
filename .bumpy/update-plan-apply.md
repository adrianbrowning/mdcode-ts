---
mdcode-ts: minor
---

`update` now separates planning from writing. By default, or with `--plan`, it lists the blocks that would change. `--diff` prints a unified diff of the markdown, `--check` exits 1 with an `out_of_sync` error for each block that has drifted from its source (a failed `file=` read or transform is reported as `read_failed` or `transform_failed`, not as drift), `--stdout` prints the updated markdown, and `--apply` is the only mode that writes the file. A no-op `--apply` leaves the file untouched. `--name` can be repeated on every command, and `update` fails with `invalid_usage` when no selected block has a given name. Each `UpdatedBlock` now carries its resulting `code`. **Behaviour changes:** `mdcode update README.md` no longer writes README.md; add `--apply`. `--apply` refuses stdin input; use `--stdout`. A block whose `file=` content matches it apart from the file's final newline is no longer reported as `changed`.
