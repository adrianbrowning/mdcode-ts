# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

TypeScript port of [szkiba/mdcode](https://github.com/szkiba/mdcode) - a Markdown code block authoring tool for extracting, updating, and managing code blocks within markdown documents.

This is a **pnpm workspace monorepo** with three packages:
- `packages/mdcode` - Main library and CLI
- `packages/usage` - E2E integration tests
- `packages/example` - Example usage (no tests)

## Essential Commands

### Testing (ALWAYS RUN BOTH)
```bash
# Run ALL tests (mdcode + usage packages = 21 total tests)
pnpm test:all

# Watch mode during development
pnpm --filter mdcode test:watch

# Individual packages
pnpm --filter @gcm/mdcode test          # 16 unit tests
pnpm --filter @gcm/mdcode-usage test    # 5 E2E tests
```

**IMPORTANT**: `pnpm test` only runs mdcode unit tests. Always use `pnpm test:all` before committing.

### Building
```bash
pnpm build                    # Build main package via zshy bundler
pnpm --filter mdcode dev      # Watch mode
```

### Linting
```bash
pnpm -r lint:ts              # TypeScript type checking
pnpm -r lint                 # ESLint + type check
pnpm -r lint:s               # Style lint only
pnpm -r lint:fix             # Fix style issues
```

### Direct Execution (Development)
```bash
# Node 22+ runs TypeScript natively
node --experimental-strip-types packages/mdcode/src/main.ts list README.md
```

## Architecture

### Core Parsing Strategy (packages/mdcode/src/parser.ts)
- **Custom line-by-line state machine** for parsing markdown (no unified/remark)
- Parses fenced code blocks (3-4 backticks) with metadata from info string
- Extracts: language, metadata (key=value pairs), code content, position offsets
- Two main functions:
  - `parse()` - Extract blocks as array
  - `walk()` - Transform blocks in-place, returns modified markdown

### Region Extraction (packages/mdcode/src/region.ts)
Supports `#region name` / `#endregion` markers in source files:
- `read()` - Extract content between markers
- `outline()` - Show only markers (hide content)
- `replace()` - Update content within markers
- Handles both line comments (`//`, `#`) and block comments (`/* */`)

### Commands Architecture (packages/mdcode/src/commands/)
Each command is a separate module with typed options:
- **list** - Display blocks with metadata (JSON or formatted)
- **extract** - Write blocks to filesystem based on `file` metadata
- **update** - Bidirectional sync: read from files OR apply transformers
  - File mode: reads from `file` metadata, supports `region` extraction
  - Transform mode: uses `--transform` flag with custom function
- **run** - Execute shell commands on each block (uses temp files)
- **dump** - Create tar archive using `tar-stream`

### Update Command Workflow (packages/mdcode/src/commands/update.ts)
The `update` command has a two-step process:
1. **Read from file** (if `file` metadata exists)
   - Resolves path relative to `basePath`
   - Supports `region=name` to extract specific region
   - Supports `outline=true` to show only region markers
2. **Apply transformer** (if `--transform` flag provided)
   - Dynamically imports transformer module
   - Calls with `{tag, meta, code}`
   - Can further modify file-loaded content

### Transformer Functions
Type signature: `(options: {tag, meta, code}) => string | Promise<string>`

Use `defineTransform()` helper for type safety:
```typescript
import { defineTransform } from 'mdcode';

export default defineTransform(({tag, code}) => {
  if (tag === 'sql') return code.toUpperCase();
  return code;
});
```

### CLI Architecture (packages/mdcode/src/cli.ts)
- Uses `commander` for argument parsing
- All commands support stdin or file input
- Filter options: `--lang`, `--file`, `--meta key=value`
- Default behavior: if no command, runs `list README.md`

## Technology Stack
- **Node 22+** with native TypeScript support (`--experimental-strip-types`)
- **pnpm workspaces** for monorepo management
- **zshy** - TypeScript bundler (not tsc, not rollup)
- **node:test** - Native test runner (NOT vitest, jest, or mocha)
- **commander** - CLI framework
- **tar-stream** - Tar archive creation
- **TypeScript**: strict mode, `verbatimModuleSyntax: true`, ES2022 target

## Key Design Decisions

### Why Custom Parser?
Original design used `unified` + `remark-parse`, but switched to custom state machine for:
- Precise character offset tracking (needed for in-place updates)
- Simpler metadata extraction from info strings
- No AST overhead for simple code block extraction

### Test Organization
- **Root tests/** - Parser and transformer unit tests (not used currently)
- **packages/mdcode/src/*.test.ts** - Co-located unit tests (16 tests)
- **packages/usage/tests/** - E2E workflow tests (5 tests)
- Import path from root: `../packages/mdcode/src/...`

### File Imports Must Use .ts Extension
TypeScript config uses `allowImportingTsExtensions: true`:
```typescript
// Correct
import { parse } from './parser.ts';

// Wrong
import { parse } from './parser';
```

## Before Committing
1. `pnpm test:all` - Ensure ALL 21 tests pass
2. `pnpm build` - Ensure build succeeds
3. `pnpm -r lint:ts` - Type check all packages
