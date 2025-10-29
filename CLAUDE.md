# mdcode TypeScript Conversion

You have a very short term memory. If you need to remember something, you can write it down.

## Overview
Converting the Go-based mdcode project to TypeScript with Node 22 and pnpm. mdcode is a Markdown code block authoring tool that extracts, updates, and manages code blocks within markdown documents.

Node 22 can run typescript files directly. Use `.ts` extension for imports.`

Original project: https://github.com/szkiba/mdcode

## Development Guidelines

### Testing
- Reference TESTING.md
- Do Not use vitest. Use native node:test instead

### ALWAYS Use Todo Lists
- Track all tasks with TodoWrite tool
- Update status in real-time (pending → in_progress → completed)
- Keep only one task in_progress at a time
- Mark tasks complete immediately after finishing

### ALWAYS Use Sub-Agents
- Use Task tool with sub-agents to keep main context clear
- Delegate complex searches, multi-step research, and file operations
- Specify exactly what information the agent should return

### Keep Todo List Synced with Local File
- Maintain a local file-based version of the todo list
- Base filename on branch name or project name (e.g., `TODO-mdcode.md`)
- Sync after every todo list update
- Format: Simple markdown checklist

### Prefer Node 22 APIs Over npm Packages
- Use `node:util.styleText` instead of chalk for colored output
- Use `node:fs` for file operations
- Use `node:readline` for interactive prompts
- Use `node:path` for path manipulation
- Use `node:process` for stdin/stdout/stderr

### Use Deno std via JSR for Missing Functionality
- If Node 22 doesn't have a needed module, check https://docs.deno.com/runtime/reference/std/
- Install via: `pnpm dlx jsr add @std/<module>`
- Example: `@std/tar` for tar archive creation

### TypeScript Configuration
- Use `verbatimModuleSyntax: true` for erasable syntax checking
- Enable `allowImportingTsExtensions: true` to import .ts files
- With Node 20+, you can run .ts files natively using `--experimental-strip-types`
- ALWAYS use `.ts` extension in imports (e.g., `import { foo } from './bar.ts'`)
- Example: `node --experimental-strip-types src/main.ts`

### Test-Driven Development (TDD)
- Follow TDD approach: write tests first, then implementation
- Use Vitest for all tests
- Run tests with: `pnpm test`
- Each command should have corresponding tests

### Build & Packaging
- Use `zx` for build scripts and packaging if needed
- Support both running .ts files directly (development) and compiled .js (production)
- Development: `node --experimental-strip-types src/main.ts`
- Production: `pnpm build && node dist/main.js`

## Project Architecture

### Core Types (`src/types.ts`)
```typescript
interface Block {
  lang: string;
  meta: Record<string, string>;
  code: string;
  position?: { start: number; end: number };
}

type WalkerFunction = (block: Block) => Block | null | Promise<Block | null>;

interface FilterOptions {
  lang?: string;
  file?: string;
  meta?: Record<string, string>;
}
```

### Markdown Parser (`src/parser.ts`)
- Use `unified` + `remark-parse` to parse markdown into AST
- Walk AST using visitor pattern to find fenced code blocks
- Extract:
  - Language from code block info string (e.g., ```js → "js")
  - Metadata from info string (e.g., ```js file=foo.js region=main)
  - Code content as string
- Support HTML-commented invisible code blocks
- Return array of Block objects

### Commands (`src/commands/`)

#### `extract.ts`
- Save code blocks to filesystem
- Use `block.meta.file` to determine output path
- Create directories as needed
- Support `--lang`, `--file`, `--meta` filters

#### `list.ts`
- Display code blocks with metadata
- Show language, file, region, and other metadata
- Format output with `util.styleText`

#### `dump.ts`
- Create tar archive of code blocks
- Use Deno std `@std/tar` if Node lacks tar support
- Include all filtered blocks

#### `update.ts`
- Update markdown code blocks from source files OR via transformer function
- **File-based mode** (default - no transformer provided):
  - Match blocks by `file` metadata
  - Support `region` extraction using special comments
  - Read content from source files
- **Transformer mode** (with --transform flag):
  - Load transformer from file using dynamic import
  - Call transformer for each block with (tag, meta, code)
  - Replace code block with returned value
- Preserve markdown structure in both modes
- Write modified markdown to stdout or file

#### `run.ts`
- Execute shell commands on code blocks
- Save blocks to temp files
- Run specified command on each file
- Collect and display results

#### Transformer Functions (used with `update --transform`)
Transform functionality is integrated into the `update` command via the `--transform` flag.

**Transformer Function Signature:**
```typescript
type TransformerFunction = (
  tag: string,                           // e.g., 'js', 'sql', 'python'
  meta: { file?: string; region?: string },
  code: string
) => string | Promise<string>;
```

**Example Transformer:**
```typescript
import { defineTransform } from '../../src/types.ts';

export default defineTransform((tag, meta, code) => {
  if (tag === 'sql') return code.toUpperCase();
  if (meta.file?.includes('.test.')) return `// TEST\n${code}`;
  return code;
});
```

**Usage:**
```bash
# Build transformer first
pnpm build

# Use with update command
mdcode update --transform dist/examples/transforms/uppercase-sql.js README.md

# Or use Node's experimental TS support
node --experimental-strip-types dist/main.js update --transform examples/transforms/uppercase-sql.ts README.md
```

### CLI Entry Point (`src/cli.ts`)
- Use `commander` for command parsing
- Define all commands and their options
- Handle stdin vs file input
- Wire stdout/stderr to Node streams
- Export Execute function for main.ts

### Main Entry (`src/main.ts`)
```typescript
import { Execute } from './cli.js';

Execute(process.argv.slice(2), process.stdout, process.stderr);
```

## Implementation Plan

### Phase 1: Project Setup
1. Initialize pnpm project
   - `pnpm init`
   - Set `type: "module"` in package.json
   - Add Node 22 engine requirement

2. Configure TypeScript
   - `pnpm add -D typescript @types/node`
   - Create tsconfig.json with ES2022 target, strict mode
   - Enable `moduleResolution: "bundler"`

3. Add dependencies
   - `pnpm add unified remark-parse remark-stringify commander`
   - `pnpm add -D vitest tsup`
   - Add Deno std modules as needed

4. Create project structure
   ```
   src/
     types.ts
     parser.ts
     commands/
       extract.ts
       list.ts
       dump.ts
       update.ts          # Includes transformer support
       run.ts
     cli.ts
     main.ts
   examples/
     sample.md
     transforms/          # Example transformer functions
       uppercase-sql.ts
   tests/
     parser.test.ts
     transform.test.ts
   ```

### Phase 2: Core Implementation
5. Implement types.ts
   - Define Block, WalkerFunction, FilterOptions interfaces
   - Export all type definitions

6. Implement parser.ts
   - Create markdown parser using unified + remark-parse
   - Implement AST walker to extract code blocks
   - Parse metadata from info string (key=value pairs)
   - Handle edge cases (empty blocks, no language)

7. Implement filter logic
   - Create filter function that applies FilterOptions
   - Support language matching
   - Support file glob patterns
   - Support metadata key-value matching

### Phase 3: Commands
8. Implement list command
   - Format and display blocks using util.styleText
   - Show language, metadata, code preview

9. Implement extract command
   - Create output directories using node:fs
   - Write blocks to files based on metadata
   - Handle file path conflicts

10. Implement update command
    - Read source files
    - Match blocks by file metadata
    - Support region extraction
    - Update markdown preserving structure

11. Implement dump command
    - Create tar archive of blocks
    - Use @std/tar from Deno or node:tar if available

12. Implement run command
    - Write blocks to temp files
    - Execute shell command on each
    - Capture and display output

13. Implement transform command
    - Display blocks with formatting
    - Prompt for user input using node:readline
    - Accept multiline code input
    - Update markdown with transformed code

### Phase 4: CLI & Testing
14. Implement CLI with commander
    - Define all commands and options
    - Wire up stdin/stdout/stderr handling
    - Add help text and examples

15. Add tests
    - Test parser with various markdown inputs
    - Test filter logic
    - Test each command with example files

16. Build configuration
    - Configure tsup or tsc for building
    - Add bin field to package.json
    - Make CLI executable

## Usage Examples

### Extract blocks to files
```bash
mdcode extract README.md
```

### List blocks with language filter
```bash
mdcode list --lang=js README.md
```

### Update markdown from source files
```bash
mdcode update README.md
```

### Transform blocks with custom function
```bash
# Build transformer first, then use with update command
pnpm build
mdcode update --transform dist/examples/transforms/uppercase-sql.js README.md > output.md
```

### Run tests on code blocks
```bash
mdcode run --lang=js "node" README.md
```

### Create archive of examples
```bash
mdcode dump --lang=js README.md > examples.tar
```

## Node 22 APIs Reference

### util.styleText
```typescript
import { styleText } from 'node:util';

console.log(styleText('red', 'Error message'));
console.log(styleText(['bold', 'blue'], 'Header'));
```

### readline for prompts
```typescript
import * as readline from 'node:readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Transform? ', (answer) => {
  console.log(answer);
  rl.close();
});
```

### fs promises for file operations
```typescript
import { readFile, writeFile, mkdir } from 'node:fs/promises';

await mkdir('output', { recursive: true });
await writeFile('output/file.js', code, 'utf-8');
```

## Local Todo File Format

File: `TODO-mdcode.md`

```markdown
# mdcode Todo List

## In Progress
- [ ] Implementing parser.ts

## Pending
- [ ] Implement extract command
- [ ] Implement transform command
- [ ] Add tests

## Completed
- [x] Initialize project
- [x] Configure TypeScript
- [x] Create types.ts
```

Update this file after every TodoWrite call to keep in sync.
