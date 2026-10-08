# Changelog

## 0.1.0
<sub>2026-10-08</sub>

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
- *(minor)*
  Added stable block names: `name=` identifies a block, must be unique within a document, and every command can select it with `-n, --name`. Metadata values can now be double-quoted, as in `file="getting started.ts"`, with `\"` and `\\` escapes. `list` shows names, including in `--json`. **Behaviour change:** commands and `parse()` now refuse a document whose metadata has an unterminated quote, an invalid escape, a repeated key, an empty name, or a duplicate name, and throw `MetadataError` listing each problem by line.
- *(minor)*
  Added `--json` to `list`, `extract`, `update`, `run` and `dump`: each prints one versioned JSON envelope (`version`, `command`, `ok`, `result`, `errors`) with block names, fence lines, per-block outcomes and coded errors, and no colour or progress text. `dump --json` writes the archive to the required `--out` and reports its manifest. **Behaviour changes:** `list --json` prints the envelope instead of one object per line; `run` exits 1 when a block command fails and `update` exits 1 when a `file=` read or transformer fails (both exited 0); `run --keep` prints the working directory after the blocks; `extract --update-source` no longer adds `file=` to a block whose file it skipped, and creates no directories for skipped targets; `run` now removes its empty `.mdcode-tmp` directory. **Library:** command functions return structured results and no longer print: `update()` returns `{ source, blocks, errors }`, `list()` returns `{ blocks }`, `extract()` returns `{ targets, updatedSource?, errors }`, `run()` returns `{ workingDir, blocks, errors }` and `dump()` returns `{ files, archive }`; the `quiet` and `json` options are gone. The default `mdcode()` export still returns the markdown string.
- *(minor)*
  `update` now separates planning from writing. By default, or with `--plan`, it lists the blocks that would change. `--diff` prints a unified diff of the markdown, `--check` exits 1 with an `out_of_sync` error for each block that has drifted from its source (a failed `file=` read or transform is reported as `read_failed` or `transform_failed`, not as drift), `--stdout` prints the updated markdown, and `--apply` is the only mode that writes the file. A no-op `--apply` leaves the file untouched. `--name` can be repeated on every command, and `update` fails with `invalid_usage` when no selected block has a given name. Each `UpdatedBlock` now carries its resulting `code`. **Behaviour changes:** `mdcode update README.md` no longer writes README.md; add `--apply`. `--apply` refuses stdin input; use `--stdout`. A block whose `file=` content matches it apart from the file's final newline is no longer reported as `changed`.
- *(minor)*
  mdcode now treats the markdown it reads as untrusted and the caller as trusted. A block's `file=` must stay inside its base: `update` resolves it against the markdown file's directory (the current directory for stdin) or the new `--base <dir>`, `extract` against `--dir`, and both refuse absolute paths, `..` escapes and paths that lead out through a symlink before anything is read or written. `dump` refuses entry names that would unpack outside the archive. These refusals use the new `unsafe_path` error code. `update` gains `--continue-on-error` to report every failed read or transform and keep going. **Behaviour changes:** `run` needs `--allow-shell` and fails with `invalid_usage` without it. `update` stops at the first `read_failed`, `unsafe_path` or `transform_failed` error, writes nothing and reports only that error, unless `--continue-on-error` is given. `update` confines `file=` to the base, so `file=../src/app.js` from `docs/README.md` now fails; run with `--base .` and write `file=src/app.js`. `extract` confines `file=` to `--dir`, and an unsafe target aborts the whole extract with exit 1 and nothing written, where a relative path used to be honoured outside `--dir` and an absolute one was skipped with exit 2. `dump` refuses escaping entry names and produces no archive. The default export `mdcode(filePath, transformer, filter?)` resolves `file=` against the markdown file's directory instead of the current directory, confines it there, and rejects on the first failed read or transform.
- *(minor)*
  Added `mdcode.config.json`: `update` and `extract` read documents (paths or globs), `sourceRoot`, `outputRoot` and default filters with `--project` or `--config <path>`, and take several Markdown files. Under `--json`, both now report `result.documents`, and errors name their `document`. Needs Node 22.17 or later.
- *(minor)*
  Added `mdcode validate` (and `validate()`), which reports every block that `update` or `extract` would refuse, without writing anything. `--for extract` checks extract targets instead of update sources, and `--strict` requires `file=` on every selected block. **Behaviour changes:** `extract` checks every target before writing any. Blocks that share a file without each declaring their own `region=` in one language, identical whole-file blocks included, are refused as `ambiguous_target`, and broken markers in an existing target as `malformed_region`, `duplicate_region` or `region_language_mismatch`; nothing is written and it exits 1, where it used to skip that file with exit 2. `update` refuses a `region=` its file opens more than once instead of joining the bodies, and reports missing, unclosed or wrongly marked regions as `missing_region`, `malformed_region` or `region_language_mismatch` instead of `read_failed`. `update --apply --continue-on-error` no longer writes a document in which a block's `file=` or `region=` failed.
- *(minor)*
  Added `mdcode watch` and `watch()`. They check documents and the files their blocks read after every change, debounced, and report only the blocks that drifted or failed. `--apply` writes changes and ignores the change events of its own writes. Watching continues through read and configuration errors, and SIGINT stops it with exit 0.
- *(minor)*
  Removed `transform()` and `transformWithFunction()`, which printed every block to the console and `transform()` read stdin. `update({ source, transformer, filter })` replaces `transformWithFunction()` but reads each `file=` first, so a missing file is a `read_failed` error (thrown, or collected with `continueOnError`); use `walk()` to transform without reading files. Added `update({ onBlock })` to report each block as it finishes.
- *(minor)*
  `extract` with several documents now checks all of them before writing anything. Blocks in different documents that write one file follow the same rule as blocks within one document: each needs its own `region=`, in one language. Otherwise they are refused as `ambiguous_target`, each error naming its document, and nothing is written for any document. Previously the first document's version won and the second was skipped, depending on document order. A rule broken in a later document no longer leaves the earlier documents' files written. `validate --for extract` reports the same cross-document conflicts.
- *(minor)*
  The package now ships an Agent Skill, `skills/sync-markdown-code-blocks`, managed with TanStack Intent. It teaches coding agents the mdcode workflow: link a block to a file or region, inspect and plan, apply explicitly and verify with `--check`. It also covers `extract`, `run`, `dump`, transformers, JSON results, and which commands need approval on untrusted Markdown. Run `npx @tanstack/intent install` in your project to let your agent find it; see Agent Skills in the README.
- *(minor)*
  Added `mdcode extract --check`. It works out every target exactly as `extract` would and compares it with the file on disk instead of writing it. It exits 1 with an `out_of_sync` error for each block whose part of a file would change: a region that differs or is missing, a whole file that differs (pass `--force` so existing whole files are compared rather than skipped), or a file that doesn't exist yet. In `--check` results, `unchanged` is a new target action.

  Added the `check-sync` GitHub Action (`adrianbrowning/mdcode-ts/.github/actions/check-sync`). It fails a job when Markdown blocks and their files disagree in either direction, using `update --check` and `extract --check --force`, and writes nothing. Each problem becomes an annotation and a row in the job summary.

  Fixed `extract` indenting a spliced region a second time when its markers are indented. `update` copies such a region with its indentation, so extracting it used to push every line right. `extract --force` now keeps an overwritten file's final newline, and refuses a target that is a symlink or not valid UTF-8, as region splices already did.
- *(minor)*
  Added the `update-readme` GitHub Action (`adrianbrowning/mdcode-ts/.github/actions/update-readme`). It treats source files as authoritative: it runs `mdcode update --apply` on the selected documents in a temporary worktree at the base branch's tip, then opens one pull request holding only the Markdown changes, or refreshes the one it opened before. A rerun with nothing new pushes nothing. Once the base branch is in sync, it closes its pull request. It never pushes to the base branch and never writes a source file.
- *(minor)*
  Breaking: `extract` no longer writes blocks without `file=` by default. A plain `mdcode extract README.md` used to write every untagged block as `block-<N>.<ext>` beside the README; now it writes only the blocks that have `file=`. To extract anonymous blocks, pass `--update-source` (`updateSource: true`), which also adds their generated `file=` to the Markdown. `--ignore-anonymous` is removed from `extract` and `validate`, and so is the library's `ignoreAnonymous` option; drop it, since skipping is now the default. `validate --for extract` reports anonymous blocks with `path: null`. The check-sync GitHub Action drops its `ignore-anonymous` input.
- *(patch)*
  Improved npm and GitHub discoverability. The package README opens with what mdcode does and how to install it, and links to a quick start. The package description, keywords, homepage, bug tracker and repository directory now describe the project accurately, and the `license` field now says MIT to match the LICENSE file. CLI and library behaviour are unchanged.
- *(patch)*
  Added a ready-to-copy CI script, `examples/ci/check-docs-sync.mjs`, that checks one or more Markdown documents with `update --check` and exits 0 when all are in sync, 1 on drift, and 2 when a document could not be checked. The README shows how to run it locally and from GitHub Actions.
- *(patch)*
  Added a ready-to-copy CI script, `examples/ci/validate-snippets.mjs`, that extracts the code blocks marked `runnable=true` into a temporary workspace, runs your validation command there, names the block that failed, and always removes the workspace.
- *(patch)*
  Fixed the `docs:check` CI recipe in the README to add mdcode-ts to `devDependencies`, so `npm ci` installs the `mdcode` the script runs.
- *(patch)*
  Explained the source-first workflow in the package README: examples live in source or test files that your tools check, and mdcode copies them into Markdown. Added a comparison with snippet type-checkers such as Kiira.
- *(patch)*
  Fixed the README's library examples: the `parse()` and `update()` examples now run as written, and code blocks no longer carry `file=` paths to files that were never committed, so `mdcode update` works on the README itself. Releases now publish only after type check, lint, build, tests, a docs-sync check and the README's `runnable=true` examples all pass.
- *(patch)*
  Added a CI/CD Integration section to the README. It puts the docs-sync check, the runnable-snippet check and release gating in one sequence, and shows how to publish only after they pass, either with `prepublishOnly` or with a GitHub Actions publish job that needs a checks job.
- *(patch)*
  Fixed `--meta` swallowing the Markdown file after it. `mdcode list --meta type=example README.md` used to read `README.md` as a second `key=value`, read stdin instead and report no blocks. `--meta` now takes one pair per flag; repeat it to require several (`-m type=example -m region=main`). A value containing `=` is now kept whole. The README and CLI examples no longer pass directories or several files to `list`, `run` and `dump`, or globs to `--file`, which matches `file=` exactly.
