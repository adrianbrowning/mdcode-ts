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
- **Fixture-driven tests** — `packages/mdcode/tests/examples/integration.test.ts`, against the
  worked examples under `packages/mdcode/tests/examples/`
- **Integration tests** — `packages/usage/tests/`
  - `cli-integration.test.ts` spawns the **built** CLI at `packages/mdcode/dist/main.js`
  - the rest exercise the public library API as an external consumer would

### Important Notes

- `packages/usage/tests/cli-integration.test.ts` runs `dist/`, not `src/`. **Run `pnpm build` before
  it** or you will be testing the previous build.
- Region fixtures live in `packages/mdcode/tests/testdata/region/` and are compared byte-for-byte, so
  trailing newlines matter.
- Tests that assert on warnings use `mock.method(console, "error", …)` with `mock.restoreAll()` in a
  `finally`, so a failing assertion cannot leak the stub into sibling tests.

## Before Committing

1. **`pnpm test`** — all packages pass
2. **`pnpm build`** — build succeeds, and refreshes `dist/` for the CLI tests
3. **`pnpm -r lint`** — type check and ESLint are clean

## Adding New Tests

- **Region/marker behaviour** → `packages/mdcode/src/region.test.ts`
- **A command's behaviour** → `packages/mdcode/src/commands/<command>.test.ts`
- **CLI flags, exit codes, stderr** → `packages/usage/tests/cli-integration.test.ts`
- **Public API as a consumer sees it** → `packages/usage/tests/library-usage.test.ts`
