---
mdcode-ts: minor
---

Added `mdcode extract --check`. It works out every target exactly as `extract` would and compares it with the file on disk instead of writing it. It exits 1 with an `out_of_sync` error for each block whose part of a file would change: a region that differs or is missing, a whole file that differs (pass `--force` so existing whole files are compared rather than skipped), or a file that doesn't exist yet. In `--check` results, `unchanged` is a new target action.

Added the `check-sync` GitHub Action (`adrianbrowning/mdcode-ts/.github/actions/check-sync`). It fails a job when Markdown blocks and their files disagree in either direction, using `update --check` and `extract --check --force`, and writes nothing. Each problem becomes an annotation and a row in the job summary.

Fixed `extract` indenting a spliced region a second time when its markers are indented. `update` copies such a region with its indentation, so extracting it used to push every line right. `extract --force` now keeps an overwritten file's final newline, and refuses to replace a symlinked target with a regular file.
