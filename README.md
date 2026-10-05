# mdcode

[![npm version](https://img.shields.io/npm/v/mdcode-ts)](https://www.npmjs.com/package/mdcode-ts)

mdcode keeps the code blocks in your Markdown docs in sync with real source files. You write and test examples as ordinary code, point a code block at the file (or a `#region` inside it), and `mdcode update` copies the current code into the document. Your README can't drift from code that compiles and passes its tests.

It also works the other way: `mdcode extract` writes code blocks out to files, and `mdcode run` runs a command against each block. It is a TypeScript port of [szkiba/mdcode](https://github.com/szkiba/mdcode), compatible with its CLI, and adds transform functions, a library API and a versioned `--json` output.

## Install

```bash
npm install --save-dev mdcode-ts
```

This installs the `mdcode` command. Node.js 22 or later is required. To try it without installing, run `npx mdcode-ts --help`.

## Quick start

Put the example in a source file and mark the part you want to show with a region:

```ts
// src/greet.ts
// #region greet
export function greet(name: string): string {
  return `Hello, ${name}!`;
}
// #endregion

console.log(greet("docs"));
```

In your README, add an empty code block that names the file and region:

````markdown
```ts file=src/greet.ts region=greet
```
````

Preview the change, then apply it:

```bash
npx mdcode update README.md          # list the blocks that would change
npx mdcode update --diff README.md   # review them as a unified diff
npx mdcode update --apply README.md  # write them
```

mdcode fills the block with the region's code, leaving out the markers and the rest of the file:

````markdown
```ts file=src/greet.ts region=greet
export function greet(name: string): string {
  return `Hello, ${name}!`;
}
```
````

When `src/greet.ts` changes, run `mdcode update --apply README.md` again. In CI, `mdcode update --check README.md` exits 1 when a block has drifted from its source, without writing anything. To check several documents and tell drift apart from a broken `file=`, copy [`examples/ci/check-docs-sync.mjs`](examples/ci/check-docs-sync.mjs); see [Checking Docs in CI](packages/mdcode/README.md#checking-docs-in-ci).

To keep several documents in sync without repeating their paths, list them in `mdcode.config.json` and run `mdcode update --project --check`. See [Project Configuration](packages/mdcode/README.md#project-configuration).

To check that snippets actually run, mark them `runnable=true` and copy [`examples/ci/validate-snippets.mjs`](examples/ci/validate-snippets.mjs). It extracts only those blocks into a temporary workspace, runs your test or lint command there, and fails CI naming the block that broke. See [Validating Runnable Snippets in CI](packages/mdcode/README.md#validating-runnable-snippets-in-ci).

## Commands

| Command | What it does |
| --- | --- |
| `list` | List code blocks with their language, metadata and a preview |
| `update` | Refresh blocks from the files they reference, or rewrite them with a transform function. Plans by default; `--apply` writes, `--diff` and `--check` review |
| `extract` | Write blocks to files named by their `file=` metadata |
| `validate` | Report every block that `update` or `extract` would refuse, such as a missing region or two blocks writing one file, without writing anything |
| `run` | Run a shell command on each block, such as a compiler or test runner |
| `dump` | Pack blocks into a tar archive |

Every command reads a Markdown file or stdin, filters blocks by language, file, name or other metadata, and supports `--json`. Running `mdcode` with no command lists the blocks in `README.md`.

## Documentation

- [Package README](packages/mdcode/README.md): the full reference, also published on [npm](https://www.npmjs.com/package/mdcode-ts)
  - [CLI usage](packages/mdcode/README.md#cli-usage) and [flags reference](packages/mdcode/README.md#cli-flags-reference)
  - [JSON contract](packages/mdcode/README.md#json-contract) for scripts and CI
  - [Library usage](packages/mdcode/README.md#library-usage) and [API reference](packages/mdcode/README.md#api-reference)
  - [Code block metadata](packages/mdcode/README.md#metadata-in-code-blocks), [regions](packages/mdcode/README.md#region-extraction) and [outlines](packages/mdcode/README.md#outline-extraction)
- [CLI examples](examples/CLI_EXAMPLES.md): worked examples for each command
- [Comparison with the Go mdcode](packages/mdcode/README.md#comparison-with-original-mdcode)

## Development

This is a pnpm workspace. `packages/mdcode` is the published package and `packages/usage` holds end-to-end tests against the built CLI. See [TESTING.md](TESTING.md) for the test layout.

```bash
pnpm install
pnpm build      # build packages/mdcode with zshy
pnpm test       # unit and E2E tests (E2E runs the built dist/main.js)
pnpm -r lint:ts # type check
```

Run the CLI from source with Node 22.17+:

```bash
node --experimental-strip-types packages/mdcode/src/main.ts list README.md
```

## License

[MIT](LICENSE)

## Credits

Original Go implementation by [szkiba](https://github.com/szkiba/mdcode).
