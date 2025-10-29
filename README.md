# mdcode

A TypeScript port of [szkiba/mdcode](https://github.com/szkiba/mdcode) - a Markdown code block authoring tool for extracting, updating, and managing code blocks within markdown documents.

## Development

### Run tests

```bash
pnpm test
```

### Build

```bash
pnpm build
```

### Run directly (Node 20+ with --experimental-strip-types)

Note: This project is configured for Node 22+ but can run on Node 20 with the experimental flag:

```bash
node --experimental-strip-types src/main.ts list examples/sample.md
```

## Project Structure

```
src/
  types.ts           - Core type definitions (includes TransformerFunction)
  parser.ts          - Markdown parsing with unified + remark
  commands/          - Command implementations
    list.ts          - List code blocks
    extract.ts       - Extract to files
    update.ts        - Update from files or transform with custom functions
    run.ts           - Run shell commands
    dump.ts          - Create tar archives
  cli.ts             - CLI setup with commander
  main.ts            - Entry point
examples/
  sample.md          - Example markdown file
  transforms/        - Example transformer functions
    uppercase-sql.ts - Convert SQL to uppercase
    add-comments.ts  - Add file headers
    conditional.ts   - Conditional transformations
    async-example.ts - Async transformation example
tests/
  parser.test.ts     - Parser tests
  transform.test.ts  - Transformer tests
```

## Technology Stack

- **TypeScript** with strict mode and verbatimModuleSyntax
- **Node 22** built-in APIs (util.styleText, fs/promises, readline)
- **commander** for CLI argument parsing
- **node:test** for testing
- **tar-stream** for tar archives
- **zshy** for TypeScript compilation and bundling

## License

ISC

## Credits

Original Go implementation by [szkiba](https://github.com/szkiba/mdcode)
