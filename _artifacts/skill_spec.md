# mdcode-ts — Skill Spec

mdcode-ts keeps fenced code blocks in Markdown in sync with real source files. A block names a
`file=` and optionally a `region=`; `mdcode update` copies the source into the block, `extract` goes
the other way, and `list`, `validate`, `run` and `dump` inspect, check, execute or archive blocks. It
ships the `mdcode` CLI and a library API from the workspace package `packages/mdcode`.

## Domains

| Domain | Description | Skills |
| --- | --- | --- |
| markdown-code-blocks | Linking fenced blocks to source files and regions, and moving code between them safely | sync-markdown-code-blocks |

## Skill Inventory

| Skill | Type | Domain | What it covers | Failure modes |
| --- | --- | --- | --- | --- |
| sync-markdown-code-blocks | core | markdown-code-blocks | file=/region=/outline=, update plan/diff/apply/check, --base and project sourceRoot, list/validate, selection filters, extract with splicing, run/dump, transformers and library API, JSON results, untrusted-Markdown approval rules | 8 |

## Failure Mode Inventory

### sync-markdown-code-blocks (8 failure modes)

| # | Mistake | Priority | Source | Cross-skill? |
| --- | --- | --- | --- | --- |
| 1 | Editing code inside a linked block | CRITICAL | src/commands/update.ts | — |
| 2 | Running update on untrusted Markdown that names secrets | CRITICAL | README.md (Security: Untrusted Markdown) | — |
| 3 | Treating the default plan as having written | HIGH | src/cli.ts; task check | — |
| 4 | Plain extract on a README | HIGH | src/commands/validate.ts | — |
| 5 | Overwriting existing files with --force | HIGH | src/commands/extract.ts | — |
| 6 | Globs or directories as file arguments or --file values | MEDIUM | src/parser.ts; src/cli.ts | — |
| 7 | Region markers in another language's comment syntax | MEDIUM | src/region.ts | — |
| 8 | file= relative to the wrong directory | MEDIUM | src/cli.ts; task check | — |

## Subsystems & Reference Candidates

| Skill | Subsystems | Reference candidates |
| --- | --- | --- |
| sync-markdown-code-blocks | — | references/json-results.md (envelope, error codes, exit codes); references/transformers.md (--transform modules, update()/parse()/extract()) |

## Remaining Gaps

| Skill | Question | Status |
| --- | --- | --- |
| sync-markdown-code-blocks | The package README and examples/CLI_EXAMPLES.md showed globs, directories and --file patterns the CLI rejects. Fixed in #54. | resolved |
| sync-markdown-code-blocks | Discovery (whether agents load the skill from its description for unrelated phrasings) is unverified. | open |

## Coverage and batch history

### Batch 1 — 2026-10-06, mdcode-ts 0.0.4 (source revision 5254174)

- **Scope assessed:** the seven developer tasks in `domain_map.yaml`, from issue #30: point a block at a file or region, update after code changes, fail CI on drift, extract with region splicing, select blocks, run or archive snippets, and transform during update. Not assessed: `watch`, and the `examples/ci/` scripts beyond a pointer.
- **Decisions:**
  - One core skill rather than one per command, because the commands are used together in one inspect → plan → apply → check loop. JSON results and transformers/library API are conditional references.
  - Distribution is package-only (`distribution.mode: none`). Skills version with the npm package. Repository or plugin exports can be chosen later with `intent maintainer setup --distribution repo`.
  - Every CLI claim was checked by running the built CLI from this revision, not the original Go mdcode docs. Where the README disagreed (single-file `list`/`run`/`dump`, exact-match `--file`), the skill follows the CLI and issue #54 tracks the README.
  - Untrusted Markdown: the skill separates commands that write or execute (approval needed) from those that only read. It warns that reads still follow `file=` inside the base, and that containment is check-then-use.
  - Sources include the command implementations, parser, region and outline code, `src/result.ts`, the package README, the worked examples in `tests/examples/` (fibonacci: region and outline blocks; factorial: a region in a test file), `examples/ci/check-docs-sync.mjs` and `validate-snippets.mjs`, and the skill's own task check. A change to any of them reopens review of the skill.
- **Checks:**
  - `intent validate packages/mdcode/skills`: passed.
  - Task check `packages/usage/tests/skill-sync-markdown-code-blocks.test.ts` (fixture in `packages/usage/tests/skills/sync-markdown-code-blocks/`). It accepts `update --apply --project`. It rejects plan-only, applying without the configuration's `sourceRoot`, and changing the source to match the docs.
  - Consumer session: a separate agent got the task text and was pointed at a disposable project with the packed `mdcode-ts-0.0.4.tgz` and `@tanstack/intent@0.5.4`. The project was set up with `intent install` choosing "Enable all", which writes `intent.skills: ["*"]`; that is broader than a consumer should configure, and a least-privilege selection of just this skill was not tested. The agent loaded `mdcode-ts#sync-markdown-code-blocks` through `intent load`, ran `update --diff --project`, then `update --apply --project`, and the unchanged grader passed on its result. **Not an isolated run:** the session also read this repository's own agent instructions and edited an unrelated file here (reverted), so it is not independent fresh-consumer evidence.
  - Discovery: not verified.
- **Remaining work:** repeat the consumer run in a sandbox that exposes only the consumer project; run discovery checks.

### Batch 2 — 2026-10-06, mdcode-ts 0.0.4 (issue #54)

- **Change:** `--meta` is now repeatable, one `key=value` per flag, instead of variadic. Before, it took every following argument, so `mdcode list --meta runnable=true README.md` read stdin and found nothing. That included the skill's own `--meta` example. A value may now contain `=`. The package README and `examples/CLI_EXAMPLES.md` now pass one file to `list`, `run` and `dump` and an exact `--file` value. The flags reference no longer calls `--file` a pattern.
- **Guidance:** no change. The skill already said `list`, `run` and `dump` read one file and that `--file` is exact, and its `--meta` example is now correct as written. README.md remains a source; the parts that disagreed with the CLI are fixed.
- **Checks:** `cli-integration.test.ts` adds "--meta takes one key=value, so a file after it is still the file to read". It failed before the change and passes after. The skill task check still passes.

### Batch 3 — 2026-10-06, mdcode-ts 0.0.4 (issue #28, check-sync)

- **Change:** new `extract --check` compares each target with what `extract` would write and writes nothing. `extract --force` keeps an overwritten file's final newline and refuses symlinked targets. A spliced region whose markers are indented is no longer indented a second time. New consumer GitHub Action `.github/actions/check-sync`.
- **Guidance:** the skill's Extract section adds `extract --check --force --ignore-anonymous` as the read-only preview, and notes that without `--force` existing whole files are reported as skipped (exit 2). The safety table lists `extract --check` among the commands that write nothing. The GitHub Action is not part of the skill; the package README documents it.
- **Checks:** `extract.test.ts` "extract: check" covers in sync, per-region drift, missing files and regions, trailing newlines, LF and CRLF round trips and symlinks. `region.test.ts` adds a read-then-splice round trip for indented markers. The skill task check still passes.

### Batch 4 — 2026-10-08, mdcode-ts 0.0.4 (issue #26)

- **Change:** `extract` skips blocks without `file=` unless `--update-source` is given, which writes them as `block-<N>.<ext>` and adds that `file=` to the Markdown. `--ignore-anonymous` and the library's `ignoreAnonymous` are removed. `validate --for extract` reports anonymous blocks with `path: null`. The check-sync action drops its `ignore-anonymous` input.
- **Guidance:** the Extract section's examples drop `--ignore-anonymous` and describe `--update-source` as the only way anonymous blocks become files. The "plain extract on a README" common mistake is replaced by "extract --update-source on a README". The domain map's failure mode is updated to match.
- **Checks:** `extract.test.ts` "skips blocks without file= unless updateSource names them in the markdown"; `validate.test.ts` counts generated names only with `updateSource`; usage tests for the JSON contract, `validate --for extract`, `--meta` parsing and `validate-snippets` (which now pipes each document to `extract --update-source` so its Markdown is never rewritten). The skill task check still passes.
