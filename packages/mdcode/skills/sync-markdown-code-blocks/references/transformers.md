# Transformers and the library API

## Transformers

A transformer is an ES module whose default export receives each selected block and returns its new
code. `update --transform <module>` loads it from a path you choose, relative to the current
directory. Never take that path from the Markdown: the module runs inside the mdcode process with
your permissions.

```js
// transformers/uppercase-sql.js
export default function ({ tag, meta, code }) {
  // tag: the block's language; meta: { file?, region? }; code: the block's current code
  if (tag === "sql") {
    return code.toUpperCase();
  }
  return code; // return unchanged code for blocks you don't handle
}
```

```bash
mdcode update --transform ./transformers/uppercase-sql.js --diff README.md    # review first
mdcode update --transform ./transformers/uppercase-sql.js --apply README.md
mdcode update -t ./transformers/uppercase-sql.js --lang sql --apply README.md  # only sql blocks
```

- A block with `file=` is read from its source first, and the transformer receives that code. If
  the read fails, `update` stops before transforming. With `--continue-on-error`, the transformer
  receives the block's original code instead.
- `meta` holds only `file` and `region`. Other `key=value` metadata is not passed in, so select on
  it with `--meta` instead.
- Return a string, or a promise of one. A transformer that throws stops `update` with
  `transform_failed`, and nothing is written. With `--continue-on-error`, that block keeps the code
  it had before the transform and the other blocks carry on.
- A module without a default function export fails with `invalid_transform` before any block is
  processed.

## Library API

The package exports the same operations as functions. They print nothing. Inspect the results they
return.

```ts
import { readFile, writeFile } from "node:fs/promises";

import { defineTransform, parse, update } from "mdcode-ts";

const markdown = await readFile("README.md", "utf-8");

// List blocks, optionally filtered: the same filters as the CLI flags
const blocks = parse({ source: markdown, filter: { lang: "ts" } });
console.log(blocks.map(block => [ block.position?.line, block.meta.file ]));

// update() never writes: it returns the new Markdown, and you decide whether to save it
const result = await update({
  source: markdown,
  basePath: ".", // file= paths resolve here and must stay inside it
  transformer: defineTransform(({ tag, code }) => (tag === "sql" ? code.toUpperCase() : code)),
});

if (result.blocks.some(block => block.changed)) {
  await writeFile("README.md", result.source, "utf-8");
}
```

- `update()` throws a `BlockFailure` on the first unreadable `file=`, broken region rule or failed
  transform. Its `errors` array holds the same error objects as the CLI's JSON output. Pass
  `continueOnError: true` to collect every failure in `result.errors` instead.
- `parse()` and `update()` throw a `MetadataError` when an info string is malformed or two blocks
  share a `name=`.
- `extract({ source, outputDir })` **writes files**, under the same rules as the CLI: every target is
  checked before any write, `region=` blocks splice, and `force` overwrites. Treat calling it like
  running `mdcode extract`.
