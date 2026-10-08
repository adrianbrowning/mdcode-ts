---
mdcode-ts: minor
---

Breaking: `extract` no longer writes blocks without `file=` by default. A plain `mdcode extract README.md` used to write every untagged block as `block-<N>.<ext>` beside the README; now it writes only the blocks that have `file=`. To extract anonymous blocks, pass `--update-source` (`updateSource: true`), which also adds their generated `file=` to the Markdown. `--ignore-anonymous` is removed from `extract` and `validate`, and so is the library's `ignoreAnonymous` option; drop it, since skipping is now the default. `validate --for extract` reports anonymous blocks with `path: null`. The check-sync GitHub Action drops its `ignore-anonymous` input.
