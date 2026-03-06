# mdcode

A TypeScript port of [szkiba/mdcode](https://github.com/szkiba/mdcode) - a Markdown code block authoring tool for extracting, updating, and managing code blocks within markdown documents.

## Development

### Run tests

```bash
# All tests (unit + E2E)
pnpm test:all

# Unit tests only
pnpm test

# Watch mode
pnpm --filter mdcode-ts test:watch
```

### Build

```bash
pnpm build
```

### Run directly (Node 22+)

```bash
node --experimental-strip-types packages/mdcode/src/main.ts list README.md
```

## Project Structure

```
packages/mdcode/src/
  types.ts           - Core type definitions (TransformerFunction, Block, etc.)
  parser.ts          - Custom line-by-line state machine markdown parser
  region.ts          - #region/#endregion extraction, replacement, outline
  outline.ts         - Region outline (markers-only) support
  commands/          - Command implementations
    list.ts          - List code blocks
    extract.ts       - Extract to files
    update.ts        - Update from files or transform with custom functions
    run.ts           - Run shell commands
    dump.ts          - Create tar archives
    transform.ts     - Transformer helpers
  cli.ts             - CLI setup with commander
  main.ts            - Entry point
  *.test.ts          - Co-located unit tests
packages/usage/
  tests/             - E2E integration tests
```

## Technology Stack

- **TypeScript** with strict mode and verbatimModuleSyntax
- **Node 22** built-in APIs (util.styleText, fs/promises, readline)
- **commander** for CLI argument parsing
- **node:test** native test runner
- **tar-stream** for tar archives
- **zshy** for TypeScript compilation and bundling

## License

ISC

## Credits

Original Go implementation by [szkiba](https://github.com/szkiba/mdcode)
