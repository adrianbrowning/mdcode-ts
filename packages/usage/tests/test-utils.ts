import { exec, spawn, spawnSync } from "node:child_process";
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import type { Block } from "mdcode";
import { extract, parse, update } from "mdcode";

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

/** Where the examples/ci scripts live. */
export const CI_EXAMPLES = join(__dirname, "../../../examples/ci");

/**
 * Put an `mdcode` that runs the built CLI in `<dir>/bin`, and return a PATH holding it and the
 * system directories. The examples/ci scripts run whatever `mdcode` is on PATH.
 */
export async function installMdcodeShim(dir: string): Promise<string> {
  const binDir = join(dir, "bin");
  const shim = join(binDir, "mdcode");
  await mkdir(binDir);
  await writeFile(shim, `#!/bin/sh\nexec "${process.execPath}" "${CLI_PATH}" "$@"\n`, "utf-8");
  await chmod(shim, 0o755);
  return [ binDir, dirname(process.execPath), "/usr/bin", "/bin" ].join(delimiter);
}

/** How an examples/ci script run ended. */
export type CiRun = { code: number | null; stdout: string; stderr: string; };

/** Run an examples/ci script with node, in cwd, with exactly the given environment. */
export function runCiExample(
  script: string,
  args: Array<string>,
  options: { cwd: string; env: Record<string, string>; },
): CiRun {
  const run = spawnSync(process.execPath, [ join(CI_EXAMPLES, script), ...args ], {
    cwd: options.cwd,
    encoding: "utf8",
    env: options.env,
  });
  return { code: run.status, stdout: run.stdout, stderr: run.stderr };
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
  const { targets } = await extract({ source, outputDir });
  return targets.filter(target => target.action !== "skipped").map(target => target.path);
}

/**
 * Run the update command and return updated markdown
 */
export async function runUpdate(mdFile: string, basePath?: string): Promise<string> {
  const source = await readFile(mdFile, "utf-8");
  // If no basePath provided, use the directory of the markdown file
  const resolvedBasePath = basePath || dirname(mdFile);
  return (await update({ source, basePath: resolvedBasePath })).source;
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
  options?: { stdin?: string; cwd?: string; }
): Promise<{ stdout: string; stderr: string; exitCode: number | null; }> {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [ CLI_PATH, ...args ], {
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

    child.on("error", error => {
      reject(error);
    });

    child.on("close", exitCode => {
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
