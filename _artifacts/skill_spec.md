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
| sync-markdown-code-blocks | The package README and examples/CLI_EXAMPLES.md show globs, directories and --file patterns the CLI rejects (issue #54). The skill states the verified behaviour; README.md stays a source for the parts that are accurate. | open |
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
- **Remaining work:** repeat the consumer run in a sandbox that exposes only the consumer project; run discovery checks; revisit the README sources once #54 lands.
