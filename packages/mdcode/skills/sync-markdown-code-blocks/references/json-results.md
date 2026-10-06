# JSON results

Pass `--json` to any command except `watch`. stdout then carries exactly one JSON envelope and nothing
else; human messages are suppressed. Exit codes are the same with and without `--json`.

```json
{
  "version": 1,
  "command": "update",
  "ok": false,
  "result": { "documents": [{ "document": "README.md", "blocks": [] }] },
  "errors": [
    {
      "document": "README.md",
      "code": "out_of_sync",
      "message": "out of sync with src/greet.ts",
      "line": 3,
      "name": "greet",
      "path": "src/greet.ts"
    }
  ]
}
```

- Check `version` first. It is bumped only when the contract changes incompatibly; this guidance
  covers version `1`.
- `ok` is `errors.length === 0`. `result` is `null` when the command failed before doing any work,
  such as bad flags or an unreadable configuration.
- Each error has `code` and `message`, plus `document`, `line` (the opening fence, 1-based), `name`
  and `path` when they apply. `document` is absent for stdin.
- `update`, `extract` and `validate` put one entry per document in `result.documents`. `list` puts
  its blocks in `result.blocks`.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success; for `update --check`, every selected block is in sync |
| `1` | Any error, including drift found by `--check`, a problem found by `validate`, and `extract` refusing a target before writing |
| `2` | `extract` skipped an existing target (no `region=` and no `--force`) |

## Telling drift from breakage

`update --check` exits 1 in both cases. Read the codes instead:

- `out_of_sync`: the block differs from its source. Fix the source, or run `update --apply`.
- `read_failed`, `missing_region`, `duplicate_region`, `malformed_region`,
  `region_language_mismatch`, `unsafe_path`: the block's `file=` or `region=` cannot be read safely.
  `--apply` won't fix these; correct the metadata, the markers, or `--base`.
- `invalid_metadata`: an info string breaks the metadata grammar, or two blocks share a `name=`.

Add `--continue-on-error` to collect every failed read in one run instead of stopping at the first.

```bash
mdcode update --check --json --continue-on-error README.md \
  | node -e 'const e = JSON.parse(require("fs").readFileSync(0, "utf8")); for (const x of e.errors) console.log(x.code, x.document, x.line)'
```

For several documents and distinct exit codes for drift (1) and breakage (2), copy
`examples/ci/check-docs-sync.mjs` from the mdcode-ts repository instead of writing your own parser.
