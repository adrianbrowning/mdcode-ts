# Transform Examples

This directory contains example transformer functions that demonstrate how to create custom transformations for code blocks.

## Basic Usage

### Option 1: Build transformers to JavaScript

```bash
# Build the project first
pnpm build

# Build your transformer
npx tsc examples/transforms/uppercase-sql.ts --outDir dist/examples/transforms --module ES2022 --target ES2022

# Use the built transformer with update command
node dist/main.js update --transform dist/examples/transforms/uppercase-sql.js examples/sample.md > output.md
```

### Option 2: Use Node's experimental TypeScript support (Node 20.6+)

```bash
# Use --experimental-strip-types flag
node --experimental-strip-types dist/main.js update --transform examples/transforms/uppercase-sql.ts examples/sample.md > output.md
```

Note: For production use, it's recommended to build your transformers to JavaScript first.

## Available Examples

### 1. uppercase-sql.ts
Converts SQL code blocks to uppercase.

```bash
node dist/main.js update -t dist/examples/transforms/uppercase-sql.js examples/sample.md
```

### 2. add-comments.ts
Adds file header comments based on metadata (file and region).

```bash
node dist/main.js update -t dist/examples/transforms/add-comments.js examples/sample.md
```

### 3. conditional.ts
Demonstrates various conditional transformations based on:
- File metadata (e.g., test files)
- Region metadata
- Language tag
- Code content

```bash
node dist/main.js update -t dist/examples/transforms/conditional.js examples/sample.md
```

### 4. async-example.ts
Demonstrates async transformations (useful for calling external APIs).

```bash
node dist/main.js update -t dist/examples/transforms/async-example.js examples/sample.md
```

## Creating Your Own Transformer

Create a new TypeScript file with this template:

```typescript
import { defineTransform } from '../../src/types.js';

export default defineTransform((tag, meta, code) => {
  // tag: The language tag (e.g., 'js', 'sql', 'python')
  // meta: { file?: string, region?: string }
  // code: The code block content

  // Your transformation logic here
  if (tag === 'sql') {
    return code.toUpperCase();
  }

  // Return unchanged
  return code;
});
```

### Async Transformers

You can also use async transformers:

```typescript
import { defineTransform } from '../../src/types.js';

export default defineTransform(async (tag, meta, code) => {
  if (tag === 'js') {
    // Call external API, run formatters, etc.
    const response = await fetch('https://api.example.com/format', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
    const data = await response.json();
    return data.formatted;
  }

  return code;
});
```

## Combining with Filters

You can combine transformers with filters to only process specific blocks:

```bash
# Only transform JavaScript blocks
node dist/main.js update --lang js -t dist/examples/transforms/add-comments.js input.md

# Only transform blocks with specific file metadata
node dist/main.js update --file hello.js -t dist/examples/transforms/uppercase-sql.js input.md
```

## Tips

1. **Return unchanged code** for blocks you don't want to transform
2. **Use the `defineTransform` helper** for better type checking
3. **Test your transformer** on a small example first
4. **Handle edge cases** like empty code blocks
5. **Use async transformers** when calling external services
