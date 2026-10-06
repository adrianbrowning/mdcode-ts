# CLAUDE.md

TypeScript port of [szkiba/mdcode](https://github.com/szkiba/mdcode): keeps Markdown code blocks in sync with source files. A pnpm workspace with two packages:

- `packages/mdcode` is the library and CLI, published as `mdcode-ts`.
- `packages/usage` holds integration tests that spawn the **built** `dist/main.js`. Its `pretest` rebuilds first.

## Checks

`pnpm check` runs everything CI runs: type check, ESLint, the style config (`lint:s`), build, both test packages, `docs:check` (Markdown blocks match their `file=`) and `docs:examples` (`runnable=true` blocks run). The husky pre-push hook runs it. `pnpm lint:fix` fixes most `lint:s` errors.

## Conventions

- Tests use `node:test`. The build uses `zshy`, not tsc.
- Relative imports keep their `.ts` extension: `import { parse } from "./parser.ts"`.
- Run the CLI from source with `node --experimental-strip-types packages/mdcode/src/main.ts list README.md`.

## Where things live

- **Parser** (`src/parser.ts`): a custom line-by-line state machine instead of remark, so in-place updates keep exact character offsets. `scanFences()` is shared by `parse()` and `updateInfoStrings()` so block indices always agree.
- **Mapping rules** (`src/commands/validate.ts`): `extract()` runs `planExtract()` before writing anything, and `update()` reads every `file=` through `readSource()`. `mdcode validate` reports the same rules without writing.
- **Writes**: `update()` never writes; the CLI decides, and only `--apply` writes the markdown. `watch()` writes only with `apply`.
- **Config** (`src/config.ts`): `mdcode.config.json` is loaded only with `--project` or `--config`. Without either, input defaults to stdin.
- **Contract** (`src/result.ts`): `COMMAND_NAMES` and `ERROR_CODES` are the source of truth for commands and error codes.

## Docs to read first

- Adding or changing a command, flag or error code: `docs/agents/adding-a-command.md`
- Test layout: `TESTING.md`
- Releasing and the release gates: `RELEASING.md`
- Issues (GitHub, `gh` CLI): `docs/agents/issue-tracker.md`
- Triage labels: `docs/agents/triage-labels.md`
- Domain language: `CONTEXT.md` and `docs/adr/`, see `docs/agents/domain.md`
