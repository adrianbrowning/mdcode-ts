# Testing Guide

## Running All Tests

### Full Test Suite (ALWAYS RUN THIS)
```bash
pnpm -w run test:all
```
This runs tests for all packages in the workspace:
- Main mdcode package (16 unit tests)
- Usage package (5 E2E tests)
Total: **21 tests**

**Note**: `pnpm test` only runs the mdcode unit tests. Use `pnpm -w run test:all` to run everything.

### Individual Package Tests
```bash
# Main mdcode package (unit tests)
pnpm --filter @gcm/mdcode test

# Usage package (E2E tests)
pnpm --filter @gcm/mdcode-usage test
cd packages/usage && pnpm test  # Alternative
```

## Test Structure

### Test Locations
- **Root tests**: `/tests/` - Core functionality tests
  - `parser.test.ts` - Markdown parsing and walking (8 tests)
  - `transform.test.ts` - Transformer functionality (8 tests)
- **E2E tests**: `packages/usage/tests/e2e.test.ts` - End-to-end integration (5 tests)
- **Example package**: `packages/example/` - No tests, just runnable examples

### Important Notes
- Root `/tests/` are configured in `packages/mdcode/vitest.config.ts`
- Import paths from root tests must use `../packages/mdcode/src/...`
- **ALWAYS test all packages** - run `pnpm test` from workspace root
- E2E tests validate extract/update workflows with real files

## Before Committing
1. **`pnpm -w run test:all`** - Ensure ALL 21 tests pass (mdcode + usage packages)
2. **`pnpm build`** - Ensure build succeeds
3. **Test examples** - Manually run at least one example:
   ```bash
   pnpm --filter @gcm/mdcode-example example:list
   pnpm --filter @gcm/mdcode-example example:extract
   ```

## Adding New Tests
- **Parser/core**: Add to `/tests/parser.test.ts`
- **Transform**: Add to `/tests/transform.test.ts`
- **E2E workflows**: Add to `packages/usage/tests/e2e.test.ts`
- **New commands**: Add unit tests to root `/tests/` or create new test file
