import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { execCli } from "./test-utils.ts";

describe("CLI Integration Tests", () => {
  describe("quiet mode", () => {
    it("should suppress status messages in extract command", async () => {
      const markdown = `
\`\`\`js file=test.js
console.log('test');
\`\`\`
      `.trim();

      const tmpDir = await mkdtemp(join(tmpdir(), "mdcode-cli-test-"));

      try {
        // Extract without quiet - should have status messages in stderr
        const result1 = await execCli([ "extract", "-d", tmpDir ], { stdin: markdown });
        assert.ok(result1.stderr.includes("✓"), "Should have status messages in stderr when not quiet");
        assert.strictEqual(result1.exitCode, 0, "Should exit successfully");

        // Extract with quiet - should suppress status messages
        const quietDir = join(tmpDir, "quiet");
        const result2 = await execCli([ "extract", "-d", quietDir, "--quiet" ], { stdin: markdown });
        assert.strictEqual(result2.stderr, "", "Should have no status messages in stderr when quiet");
        assert.strictEqual(result2.exitCode, 0, "Should exit successfully");
      }
      finally {
        await rm(tmpDir, { recursive: true, force: true });
      }
    });

    it("should suppress status messages in dump command", async () => {
      const markdown = `
\`\`\`js
console.log('test');
\`\`\`
      `.trim();

      // Dump without quiet - should have status messages in stderr
      const result1 = await execCli([ "dump" ], { stdin: markdown });
      assert.ok(result1.stderr.includes("✓"), "Should have status messages in stderr when not quiet");
      assert.ok(result1.stdout.length > 0, "Should output tar data to stdout");
      assert.strictEqual(result1.exitCode, 0, "Should exit successfully");

      // Dump with quiet - should suppress status messages
      const result2 = await execCli([ "dump", "--quiet" ], { stdin: markdown });
      assert.strictEqual(result2.stderr, "", "Should have no status messages in stderr when quiet");
      assert.ok(result2.stdout.length > 0, "Should output tar data to stdout");
      assert.strictEqual(result2.exitCode, 0, "Should exit successfully");
    });

    it("should suppress status messages in update command", async () => {
      const markdown = `
\`\`\`js file=test.js
console.log('old');
\`\`\`
      `.trim();

      const tmpDir = await mkdtemp(join(tmpdir(), "mdcode-cli-test-"));
      const mdFile = join(tmpDir, "test.md");

      try {
        // Create source file with updated content
        await writeFile(join(tmpDir, "test.js"), "console.log('new');\n", "utf-8");
        await writeFile(mdFile, markdown, "utf-8");

        // Update without quiet - should have status messages in stderr
        const result1 = await execCli([ "update", "--stdout", mdFile ], { cwd: tmpDir });
        assert.ok(result1.stderr.includes("✓"), "Should have status messages in stderr when not quiet");
        assert.ok(result1.stdout.includes("console.log('new')"), "Should output updated markdown to stdout");
        assert.strictEqual(result1.exitCode, 0, "Should exit successfully");

        // Update with quiet - should suppress status messages
        const result2 = await execCli([ "update", "--stdout", "--quiet", mdFile ], { cwd: tmpDir });
        assert.strictEqual(result2.stderr, "", "Should have no status messages in stderr when quiet");
        assert.ok(result2.stdout.includes("console.log('new')"), "Should output updated markdown to stdout");
        assert.strictEqual(result2.exitCode, 0, "Should exit successfully");
      }
      finally {
        await rm(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe("dump command file output", () => {
    it("should write tar archive to file with -o flag", async () => {
      const markdown = `
\`\`\`js
console.log('test');
\`\`\`

\`\`\`python
print('hello')
\`\`\`
      `.trim();

      const tmpDir = await mkdtemp(join(tmpdir(), "mdcode-cli-test-"));
      const outFile = join(tmpDir, "output.tar");

      try {
        // Use dump command with -o flag to write to file
        const result = await execCli([ "dump", "-o", outFile, "--quiet" ], { stdin: markdown });
        assert.strictEqual(result.exitCode, 0, "Should exit successfully");
        assert.strictEqual(result.stdout, "", "Should not write to stdout when using -o flag");

        // Verify file was created
        // eslint-disable-next-line node/no-unsupported-features/es-syntax -- stale plugin; Node 22 supports dynamic import
        const { stat, readFile: readFilePromise } = await import("node:fs/promises");
        const stats = await stat(outFile);
        assert.ok(stats.size > 0, "Output file should have content");

        // Verify it's a valid tar file by checking tar signature
        const content = await readFilePromise(outFile);

        // Tar files contain filenames as readable strings
        const contentStr = content.toString();
        assert.ok(contentStr.includes("block-1.js"), "Tar should contain block-1.js");
        assert.ok(contentStr.includes("block-2.py"), "Tar should contain block-2.py");
      }
      finally {
        await rm(tmpDir, { recursive: true, force: true });
      }
    });

    it("should write to stdout by default (no -o flag)", async () => {
      const markdown = `
\`\`\`js
console.log('test');
\`\`\`
      `.trim();

      // Default behavior - writes tar data to stdout
      const result = await execCli([ "dump", "--quiet" ], { stdin: markdown });
      assert.strictEqual(result.exitCode, 0, "Should exit successfully");
      assert.ok(result.stdout.length > 0, "Should write tar data to stdout");

      // Verify it's valid tar content
      assert.ok(result.stdout.includes("block-1.js"), "Tar should contain block-1.js");
    });
  });

  describe("filter options", () => {
    it("should filter by language with short and long flag", async () => {
      const markdown = `
\`\`\`js
const x = 1;
\`\`\`

\`\`\`python
y = 2
\`\`\`
      `.trim();

      // Test short flag -l
      const result1 = await execCli([ "list", "-l", "js" ], { stdin: markdown });
      assert.strictEqual(result1.exitCode, 0, "Should exit successfully");
      assert.ok(result1.stdout.includes("js"), "Should include js block");
      assert.ok(!result1.stdout.includes("python"), "Should not include python block");

      // Test long flag --lang
      const result2 = await execCli([ "list", "--lang", "python" ], { stdin: markdown });
      assert.strictEqual(result2.exitCode, 0, "Should exit successfully");
      assert.ok(result2.stdout.includes("python"), "Should include python block");
      assert.ok(!result2.stdout.includes("const x"), "Should not include js block");
    });

    it("should filter by file metadata with short and long flag", async () => {
      const markdown = `
\`\`\`js file=app.js
const x = 1;
\`\`\`

\`\`\`js file=test.js
const y = 2;
\`\`\`
      `.trim();

      // Test short flag -f
      const result1 = await execCli([ "list", "-f", "app.js" ], { stdin: markdown });
      assert.strictEqual(result1.exitCode, 0, "Should exit successfully");
      assert.ok(result1.stdout.includes("app.js"), "Should include app.js block");
      assert.ok(!result1.stdout.includes("test.js"), "Should not include test.js block");

      // Test long flag --file
      const result2 = await execCli([ "list", "--file", "test.js" ], { stdin: markdown });
      assert.strictEqual(result2.exitCode, 0, "Should exit successfully");
      assert.ok(result2.stdout.includes("test.js"), "Should include test.js block");
      assert.ok(!result2.stdout.includes("app.js"), "Should not include app.js block");
    });

    it("should filter by custom metadata with short and long flag", async () => {
      const markdown = `
\`\`\`js env=prod
const x = 1;
\`\`\`

\`\`\`js env=dev
const y = 2;
\`\`\`
      `.trim();

      // Test short flag -m
      const result1 = await execCli([ "list", "-m", "env=prod" ], { stdin: markdown });
      assert.strictEqual(result1.exitCode, 0, "Should exit successfully");
      assert.ok(result1.stdout.includes("env=prod") || result1.stdout.includes("const x"), "Should include prod block");
      assert.ok(!result1.stdout.includes("const y"), "Should not include dev block");

      // Test long flag --meta
      const result2 = await execCli([ "list", "--meta", "env=dev" ], { stdin: markdown });
      assert.strictEqual(result2.exitCode, 0, "Should exit successfully");
      assert.ok(result2.stdout.includes("env=dev") || result2.stdout.includes("const y"), "Should include dev block");
      assert.ok(!result2.stdout.includes("const x"), "Should not include prod block");
    });

    it("--meta takes one key=value, so a file after it is still the file to read", async () => {
      const dir = await mkdtemp(join(tmpdir(), "mdcode-meta-"));
      await writeFile(join(dir, "doc.md"), [
        "```js env=prod tier=web name=web",
        "const web = 1;",
        "```",
        "",
        "```js env=prod tier=db name=db",
        "const db = 1;",
        "```",
        "",
        "```js env=dev expr=a=b name=dev",
        "const dev = 1;",
        "```",
        "",
      ].join("\n"), "utf-8");

      const names = async (...filters: Array<string>): Promise<Array<string>> => {
        const { exitCode, stdout } = await execCli([ "list", "--json", ...filters, "doc.md" ], { cwd: dir });
        assert.equal(exitCode, 0);
        return JSON.parse(stdout).result.blocks.map(({ name }: { name: string; }) => name);
      };

      try {
        assert.deepEqual(await names("--meta", "env=prod"), [ "web", "db" ], "doc.md must be read, not taken as a second key=value");
        assert.deepEqual(await names("-m", "env=prod", "-m", "tier=db"), [ "db" ], "repeated --meta must all match");
        assert.deepEqual(await names("--meta", "expr=a=b"), [ "dev" ], "a value may contain =");
      }
      finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it("every command reads the file that follows --meta", async () => {
      const dir = await mkdtemp(join(tmpdir(), "mdcode-meta-each-"));
      await writeFile(join(dir, "doc.md"), "```sh kind=keep name=keep\necho keep\n```\n\n```sh name=other\necho other\n```\n", "utf-8");

      type Json = { result: Record<string, unknown>; };
      const blocks = (envelope: Json): Array<{ name: string; }> => envelope.result.blocks as Array<{ name: string; }>;
      const inDocuments = (key: string) => (envelope: Json): Array<{ name: string; }> =>
        (envelope.result.documents as Array<Record<string, Array<{ name: string; blocks?: Array<{ name: string; }>; }>>>)
          .flatMap(document => document[key]!)
          .flatMap(entry => entry.blocks ?? [ entry ]);

      const commands: Array<[ Array<string>, (envelope: Json) => Array<{ name: string; }> ]> = [
        [[ "list" ], blocks ],
        [[ "update" ], inDocuments("blocks") ],
        [[ "validate", "--for", "extract" ], inDocuments("blocks") ],
        [[ "extract", "-d", "out" ], inDocuments("targets") ],
        [[ "run", "--allow-shell", "true" ], blocks ],
        [[ "dump", "-o", "out.tar" ], envelope => envelope.result.files as Array<{ name: string; }> ],
      ];

      try {
        for (const [[ command, ...flags ], selected ] of commands) {
          const { exitCode, stdout } = await execCli([ command!, "--json", ...flags, "--meta", "kind=keep", "doc.md" ], { cwd: dir });

          assert.equal(exitCode, 0, `${command}: ${stdout}`);
          assert.deepEqual(selected(JSON.parse(stdout)).map(({ name }) => name), [ "keep" ], `${command} must read doc.md after --meta`);
        }
      }
      finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });

  describe("block names", () => {
    const markdown = [
      "```js name=setup file=setup.js",
      "console.log('setup');",
      "```",
      "",
      "```js name=\"quick start\" file=\"getting started.js\"",
      "console.log('quick start');",
      "```",
      "",
    ].join("\n");
    const duplicated = "```js name=a file=a.js\n1\n```\n\n```py name=a file=b.py\n2\n```\n";

    const withTmpDir = async (body: (dir: string) => Promise<void>): Promise<void> => {
      const dir = await mkdtemp(join(tmpdir(), "mdcode-cli-names-"));
      try {
        await body(dir);
      }
      finally {
        await rm(dir, { recursive: true, force: true });
      }
    };

    it("list shows the name as the block's identity and in JSON", async () => {
      const text = await execCli([ "list", "--name", "quick start" ], { stdin: markdown });
      assert.strictEqual(text.exitCode, 0);
      assert.match(text.stdout, /\[1\] quick start \(js\)/);
      assert.match(text.stdout, /file="getting started\.js"/);
      assert.doesNotMatch(text.stdout, /setup/);

      const json = await execCli([ "list", "--json" ], { stdin: markdown });
      assert.deepStrictEqual(JSON.parse(json.stdout).result.blocks.map(({ name, meta }: { name: string; meta: unknown; }) => ({ name, meta })), [
        { name: "setup", meta: { name: "setup", file: "setup.js" } },
        { name: "quick start", meta: { name: "quick start", file: "getting started.js" } },
      ]);
    });

    it("extract -n writes only the named block, to a path with spaces", async () => {
      await withTmpDir(async dir => {
        const result = await execCli([ "extract", "-q", "-n", "quick start", "-d", dir ], { stdin: markdown });

        assert.strictEqual(result.exitCode, 0, result.stderr);
        assert.match(await readFile(join(dir, "getting started.js"), "utf-8"), /quick start/);
        await assert.rejects(readFile(join(dir, "setup.js"), "utf-8"), { code: "ENOENT" });
      });
    });

    it("update --name refreshes only the named block", async () => {
      await withTmpDir(async dir => {
        await writeFile(join(dir, "setup.js"), "console.log('setup v2');\n", "utf-8");
        await writeFile(join(dir, "getting started.js"), "console.log('quick start v2');\n", "utf-8");
        const doc = join(dir, "doc.md");
        await writeFile(doc, markdown, "utf-8");

        const result = await execCli([ "update", "-q", "--apply", "--name", "setup", doc ], { cwd: dir });

        assert.strictEqual(result.exitCode, 0, result.stderr);
        const updated = await readFile(doc, "utf-8");
        assert.match(updated, /setup v2/);
        assert.match(updated, /'quick start'\)/);
      });
    });

    it("run -n runs only the named block", async () => {
      await withTmpDir(async dir => {
        const result = await execCli([ "run", "--allow-shell", "-n", "quick start", "cat {file}" ], { stdin: markdown, cwd: dir });

        assert.strictEqual(result.exitCode, 0, result.stderr);
        assert.match(result.stdout, /Output: console\.log\('quick start'\);/);
        assert.doesNotMatch(result.stdout, /setup/);
      });
    });

    it("dump --name archives only the named block", async () => {
      const result = await execCli([ "dump", "-q", "--name", "setup" ], { stdin: markdown });

      assert.strictEqual(result.exitCode, 0, result.stderr);
      assert.ok(result.stdout.includes("setup.js"));
      assert.ok(!result.stdout.includes("getting started.js"));
    });

    for (const args of [[ "list" ], [ "extract", "-q" ], [ "update", "--stdout", "-q" ], [ "run", "--allow-shell", "cat {file}" ], [ "dump", "-q", "-o", "out.tar" ]]) {
      it(`${args[0]} fails on duplicate names before doing anything`, async () => {
        await withTmpDir(async dir => {
          const result = await execCli([ ...args, "-n", "a" ], { stdin: duplicated, cwd: dir });

          assert.strictEqual(result.exitCode, 1);
          assert.match(result.stderr, /line 1: duplicate name "a" on lines 1, 5/);
          assert.strictEqual(result.stdout, "", "no block may be processed");
          assert.deepStrictEqual(await readdir(dir), [], "nothing may be written, not even a temp directory");
        });
      });
    }

    it("rejects malformed quoted metadata with the fence line", async () => {
      const result = await execCli([ "list" ], { stdin: "intro\n\n```js file=\"open.js\nx\n```\n" });

      assert.strictEqual(result.exitCode, 1);
      assert.match(result.stderr, /line 3: unterminated quoted value for "file"/);
    });
  });

  describe("extract refusal is observable", () => {
    const markdown = [
      "```js file=s.js",
      "console.log('from markdown');",
      "```",
    ].join("\n");

    it("reports and fails even under --quiet when nothing was written", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "mdcode-cli-skip-"));

      try {
        const stale = join(tmpDir, "s.js");
        await writeFile(stale, "console.log('stale');\n", "utf-8");

        const result = await execCli([ "extract", "-q", "-d", tmpDir ], { stdin: markdown });

        assert.notStrictEqual(result.exitCode, 0, "a run that wrote nothing must not look green");
        assert.match(result.stderr, /Skipped 1 file/, "the refusal must be reported despite --quiet");
        assert.strictEqual(
          await readFile(stale, "utf-8"),
          "console.log('stale');\n",
          "the existing file must be untouched"
        );
      }
      finally {
        await rm(tmpDir, { recursive: true, force: true });
      }
    });

    it("succeeds and overwrites with --force", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "mdcode-cli-force-"));

      try {
        const stale = join(tmpDir, "s.js");
        await writeFile(stale, "console.log('stale');\n", "utf-8");

        const result = await execCli([ "extract", "-q", "-d", tmpDir, "--force" ], { stdin: markdown });

        assert.strictEqual(result.exitCode, 0, "--force is a successful outcome");
        assert.match(await readFile(stale, "utf-8"), /from markdown/);
      }
      finally {
        await rm(tmpDir, { recursive: true, force: true });
      }
    });

    it("emits the whole --update-source document to a pipe when a file is skipped", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "mdcode-cli-pipe-"));

      try {
        await writeFile(join(tmpDir, "s.js"), "console.log('stale');\n", "utf-8");

        // Anonymous blocks gain file=block-N.js; together they exceed one 64 KiB pipe buffer.
        const input = [ "```js file=s.js\nconsole.log('from markdown');\n```\n" ];
        const expected = [ ...input ];
        for (let i = 0; i < 4000; i++) {
          input.push(`\`\`\`js\nconsole.log(${i});\n\`\`\`\n`);
          expected.push(`\`\`\`js file=block-${i + 2}.js\nconsole.log(${i});\n\`\`\`\n`);
        }
        const expectedOutput = expected.join("\n");
        assert.ok(expectedOutput.length > 65536, "the document must overflow a pipe buffer");

        const result = await execCli([ "extract", "--update-source", "-q", "-d", tmpDir ], { stdin: input.join("\n") });

        assert.strictEqual(result.exitCode, 2, "the skipped s.js must still fail the run");
        assert.strictEqual(result.stdout.length, expectedOutput.length, "stdout must not be truncated");
        assert.strictEqual(result.stdout, expectedOutput);
      }
      finally {
        await rm(tmpDir, { recursive: true, force: true });
      }
    });

    it("refuses a relative file= outside the default output directory, exits 1, and writes nothing", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "mdcode-cli-outside-"));

      try {
        const docs = join(tmpDir, "docs");
        const target = join(tmpDir, "outside", "target.ts");
        await mkdir(docs, { recursive: true });
        await mkdir(join(tmpDir, "outside"), { recursive: true });
        await writeFile(target, "keep();\n// #region x\nold();\n// #endregion x\nkeep();\n", "utf-8");

        const markdown = "```ts file=inside.ts\nsafe();\n```\n\n```ts file=../outside/target.ts region=x\nfresh();\n```\n";
        const result = await execCli([ "extract", "-q" ], { stdin: markdown, cwd: docs });

        assert.strictEqual(result.exitCode, 1);
        assert.match(result.stderr, /line 5: .*\.\.\/outside\/target\.ts/, "the error names the block and the rejected path");
        assert.strictEqual(await readFile(target, "utf-8"), "keep();\n// #region x\nold();\n// #endregion x\nkeep();\n");
        assert.deepStrictEqual(await readdir(docs), []);

        // Pointing --dir higher is the explicit way to reach it.
        const widened = await execCli([ "extract", "-q", "-d", ".." ], { stdin: markdown.replace("../outside", "outside"), cwd: docs });

        assert.strictEqual(widened.exitCode, 0, widened.stderr);
        assert.match(await readFile(target, "utf-8"), /fresh\(\);/);
      }
      finally {
        await rm(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
