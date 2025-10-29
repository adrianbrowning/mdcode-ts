import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

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
        const result1 = await execCli(["extract", "-d", tmpDir], { stdin: markdown });
        assert.ok(result1.stderr.includes("✓"), "Should have status messages in stderr when not quiet");
        assert.strictEqual(result1.exitCode, 0, "Should exit successfully");

        // Extract with quiet - should suppress status messages
        const quietDir = join(tmpDir, "quiet");
        const result2 = await execCli(["extract", "-d", quietDir, "--quiet"], { stdin: markdown });
        assert.strictEqual(result2.stderr, "", "Should have no status messages in stderr when quiet");
        assert.strictEqual(result2.exitCode, 0, "Should exit successfully");
      } finally {
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
      const result1 = await execCli(["dump"], { stdin: markdown });
      assert.ok(result1.stderr.includes("✓"), "Should have status messages in stderr when not quiet");
      assert.ok(result1.stdout.length > 0, "Should output tar data to stdout");
      assert.strictEqual(result1.exitCode, 0, "Should exit successfully");

      // Dump with quiet - should suppress status messages
      const result2 = await execCli(["dump", "--quiet"], { stdin: markdown });
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
        const result1 = await execCli(["update", "--stdout", mdFile], { cwd: tmpDir });
        assert.ok(result1.stderr.includes("✓"), "Should have status messages in stderr when not quiet");
        assert.ok(result1.stdout.includes("console.log('new')"), "Should output updated markdown to stdout");
        assert.strictEqual(result1.exitCode, 0, "Should exit successfully");

        // Update with quiet - should suppress status messages
        const result2 = await execCli(["update", "--stdout", "--quiet", mdFile], { cwd: tmpDir });
        assert.strictEqual(result2.stderr, "", "Should have no status messages in stderr when quiet");
        assert.ok(result2.stdout.includes("console.log('new')"), "Should output updated markdown to stdout");
        assert.strictEqual(result2.exitCode, 0, "Should exit successfully");
      } finally {
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
        const result = await execCli(["dump", "-o", outFile, "--quiet"], { stdin: markdown });
        assert.strictEqual(result.exitCode, 0, "Should exit successfully");
        assert.strictEqual(result.stdout, "", "Should not write to stdout when using -o flag");

        // Verify file was created
        const { stat, readFile: readFilePromise } = await import("node:fs/promises");
        const stats = await stat(outFile);
        assert.ok(stats.size > 0, "Output file should have content");

        // Verify it's a valid tar file by checking tar signature
        const content = await readFilePromise(outFile);

        // Tar files contain filenames as readable strings
        const contentStr = content.toString();
        assert.ok(contentStr.includes("block-1.js"), "Tar should contain block-1.js");
        assert.ok(contentStr.includes("block-2.py"), "Tar should contain block-2.py");
      } finally {
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
      const result = await execCli(["dump", "--quiet"], { stdin: markdown });
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
      const result1 = await execCli(["list", "-l", "js"], { stdin: markdown });
      assert.strictEqual(result1.exitCode, 0, "Should exit successfully");
      assert.ok(result1.stdout.includes("js"), "Should include js block");
      assert.ok(!result1.stdout.includes("python"), "Should not include python block");

      // Test long flag --lang
      const result2 = await execCli(["list", "--lang", "python"], { stdin: markdown });
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
      const result1 = await execCli(["list", "-f", "app.js"], { stdin: markdown });
      assert.strictEqual(result1.exitCode, 0, "Should exit successfully");
      assert.ok(result1.stdout.includes("app.js"), "Should include app.js block");
      assert.ok(!result1.stdout.includes("test.js"), "Should not include test.js block");

      // Test long flag --file
      const result2 = await execCli(["list", "--file", "test.js"], { stdin: markdown });
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
      const result1 = await execCli(["list", "-m", "env=prod"], { stdin: markdown });
      assert.strictEqual(result1.exitCode, 0, "Should exit successfully");
      assert.ok(result1.stdout.includes("env=prod") || result1.stdout.includes("const x"), "Should include prod block");
      assert.ok(!result1.stdout.includes("const y"), "Should not include dev block");

      // Test long flag --meta
      const result2 = await execCli(["list", "--meta", "env=dev"], { stdin: markdown });
      assert.strictEqual(result2.exitCode, 0, "Should exit successfully");
      assert.ok(result2.stdout.includes("env=dev") || result2.stdout.includes("const y"), "Should include dev block");
      assert.ok(!result2.stdout.includes("const x"), "Should not include prod block");
    });
  });
});
