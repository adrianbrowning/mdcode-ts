import { exec, spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import type { Block } from "mdcode";
import { extract, update, parse } from "mdcode";

const execAsync = promisify(exec);

// Get path to the mdcode CLI binary
const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = join(__dirname, "../../mdcode/dist/main.js");

/**
 * Create a temporary test directory
 */
export async function createTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "mdcode-test-"+Date.now()+"-"));
}

/**
 * Clean up a temporary directory
 */
export async function cleanupTempDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

/**
 * Copy fixture files to a temporary directory
 */
export async function copyFixtures(tempDir: string): Promise<void> {
  const fixturesDir = new URL("../fixtures/", import.meta.url).pathname;

  // Copy source.md
  await copyFile(
    join(fixturesDir, "source.md"),
    join(tempDir, "test.md")
  );

  // Copy src directory
  const srcDir = join(fixturesDir, "src");
  const destSrcDir = join(tempDir, "src");
  await mkdir(destSrcDir, { recursive: true });

  // Copy each source file
  await copyFile(
    join(srcDir, "regions.js"),
    join(destSrcDir, "regions.js")
  );
  await copyFile(
    join(srcDir, "math.ts"),
    join(destSrcDir, "math.ts")
  );
  await copyFile(
    join(srcDir, "strings.py"),
    join(destSrcDir, "strings.py")
  );
}

/**
 * Run the extract command and return extracted file paths
 */
export async function runExtract(
  mdFile: string,
  outputDir: string
): Promise<Array<string>> {
  const source = await readFile(mdFile, "utf-8");
  return extract({ source, outputDir });
}

/**
 * Run the update command and return updated markdown
 */
export async function runUpdate(mdFile: string, basePath?: string): Promise<string> {
  const source = await readFile(mdFile, "utf-8");
  // If no basePath provided, use the directory of the markdown file
  const resolvedBasePath = basePath || dirname(mdFile);
  return update({ source, basePath: resolvedBasePath });
}

/**
 * Parse markdown and return code blocks
 */
export function parseMarkdown(source: string): Array<Block> {
  return parse({ source });
}

/**
 * Read a file as string
 */
export async function readFileContent(filePath: string): Promise<string> {
  return readFile(filePath, "utf-8");
}

/**
 * Write content to a file
 */
export async function writeFileContent(filePath: string, content: string): Promise<void> {
  await writeFile(filePath, content, "utf-8");
}

/**
 * Run unix diff on two files
 * Returns empty string if files are identical, otherwise returns diff output
 */
export async function runDiff(file1: string, file2: string): Promise<string> {
  try {
    const { stdout } = await execAsync(`diff -u "${file1}" "${file2}"`);
    return stdout;
  }

  catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    // diff exits with code 1 when files differ
    if (error.code === 1) {
      return error.stdout || "";
    }
    // Other errors (e.g., file not found) should be thrown
    throw error;
  }
}

/**
 * Execute mdcode CLI command and capture output
 */
export async function execCli(
  args: Array<string>,
  options?: { stdin?: string; cwd?: string }
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [CLI_PATH, ...args], {
      cwd: options?.cwd || process.cwd(),
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (exitCode) => {
      resolve({ stdout, stderr, exitCode });
    });

    // Write stdin if provided
    if (options?.stdin) {
      child.stdin.write(options.stdin);
      child.stdin.end();
    }
    else {
      child.stdin.end();
    }
  });
}



export function stripAnsi(text: string) {
    return text.replace(/\x1b\[[0-9;]*m/g, ''); // eslint-disable-line no-control-regex
}
