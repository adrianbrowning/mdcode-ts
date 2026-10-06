# Testing Guide

## Running All Tests

```bash
pnpm test
```

`pnpm test` is `pnpm -r test`: it already runs **both** packages — `mdcode-ts` unit tests and the
`usage` integration tests. (`pnpm test:all` also exists, but it just runs the `usage` package a
second time.)

Test counts are deliberately not recorded here; they rot. Run the suite to see them.

### Individual Package Tests

```bash
# mdcode-ts unit tests
pnpm --filter mdcode-ts test

# Watch mode
pnpm --filter mdcode-ts test:watch

# usage integration tests
pnpm --filter usage test
```

## Test Structure

Two packages, `packages/mdcode` (published as `mdcode-ts`) and `packages/usage`.

### Test Locations

- **Co-located unit tests** — `packages/mdcode/src/**/*.test.ts`
  - `region.test.ts` — marker matching, region splicing, and its refusal cases
  - `parser.test.ts` — info-string and fenced-block parsing
  - `commands/extract.test.ts` — in-place splicing, `--force`, and every refusal path
  - `commands/update.test.ts` — filling blocks from source regions
  - `commands/validate.test.ts` — every mapping rule for extract and update, and `--strict`
  - `commands/watch.test.ts` — debounce, apply, ignoring its own writes and recovery, through a fake
    watcher
  - `config.test.ts` — `mdcode.config.json` validation, glob expansion and path containment
- **Fixture-driven tests** — `packages/mdcode/tests/examples/integration.test.ts`, against the
  worked examples under `packages/mdcode/tests/examples/`
- **Docs coverage** — `packages/mdcode/tests/docs.test.ts` fails when a command or error code in
  `src/result.ts` is missing from the READMEs; see `docs/agents/adding-a-command.md`
- **Integration tests** — `packages/usage/tests/`
  - `cli-integration.test.ts` spawns the **built** CLI at `packages/mdcode/dist/main.js`
  - `json-contract.test.ts` and `project-config.test.ts` spawn it too: the `--json` envelope, and
    `--project`/`--config` discovery, precedence and multi-document runs
  - `validate.test.ts` spawns it for `mdcode validate`'s text and JSON reports, and for `extract`
    refusing before it writes
  - `watch.test.ts` spawns `mdcode watch` with the real file watcher and stops it with `SIGINT`
  - `check-docs-sync.test.ts` and `validate-snippets.test.ts` run the `examples/ci/` scripts against
    the built CLI, through an `mdcode` shim on `PATH`
  - `check-sync-action.test.ts` runs the check-sync GitHub Action's script
    (`.github/actions/check-sync/check-sync.mjs`) the way `action.yml` does, with inputs as
    environment variables and `mdcode-command` pointing at the built CLI
  - `skill-sync-markdown-code-blocks.test.ts` grades the task in `tests/skills/sync-markdown-code-blocks/`
    for the shipped skill: it accepts the skill's solution and rejects the mistakes the skill warns
    about. Set `SKILL_TASK_DIR` to grade an agent's attempt in another directory instead
  - the rest exercise the public library API as an external consumer would

### Important Notes

- The tests that spawn the CLI, and the `examples/ci/` script tests, run `dist/`, not `src/`. The
  `usage` package's `pretest` rebuilds it, so `pnpm test` is always current. Running a single usage
  test file with `node --test` skips that, so run `pnpm build` first.
- Region fixtures live in `packages/mdcode/tests/testdata/region/` and are compared byte-for-byte, so
  trailing newlines matter.
- Library code prints nothing, so assert on returned results and callbacks (`onBlock`, `onEvent`),
  not on console output. ESLint rejects `console`, process stdio and exit in `packages/mdcode/src`
  except `cli.ts`, `main.ts` and `*.test.ts`.

## Before Pushing

`pnpm check` runs what CI runs: type check, ESLint, `lint:s`, build, both test packages, and the
docs checks (`docs:check` and `docs:examples`). The pre-push hook runs it too.

## Adding New Tests

- **Region/marker behaviour** → `packages/mdcode/src/region.test.ts`
- **A command's behaviour** → `packages/mdcode/src/commands/<command>.test.ts`
- **CLI flags, exit codes, stderr** → `packages/usage/tests/cli-integration.test.ts`
- **Public API as a consumer sees it** → `packages/usage/tests/library-usage.test.ts`
