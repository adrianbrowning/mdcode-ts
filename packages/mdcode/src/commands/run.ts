import { exec } from "node:child_process";
import { mkdir, rmdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { styleText } from "node:util";

import { parse } from "../parser.ts";
import type { BlockRef, ResultError } from "../result.ts";
import { blockError, blockRef } from "../result.ts";
import type { FilterOptions } from "../types.ts";

const execAsync = promisify(exec);

/** Each block's command is killed after this long. */
const TIMEOUT_MS = 30_000;

export interface RunOptions {
  source: string;
  command: string;
  filter?: FilterOptions;
  keep?: boolean;
  dir?: string;
  /** Called as each block finishes, before the next one starts. */
  onBlock?: (block: RunBlockResult, index: number, total: number) => void;
}

export interface RunBlockResult extends BlockRef {
  lang: string;
  /** 0 on success. A command killed by the timeout reports 1. */
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface RunResult {
  /** Where block files were written; removed afterwards unless keep or dir was given. */
  workingDir: string;
  /** One entry per selected block, in document order. */
  blocks: Array<RunBlockResult>;
  /** One command_failed error per block whose command failed. */
  errors: Array<ResultError>;
}

/**
 * Run a shell command on each code block
 * @throws {MetadataError} when the document's metadata is invalid
 */
export async function run(options: RunOptions): Promise<RunResult> {
  const { source, command, filter, keep = false, dir, onBlock } = options;
  const blocks = parse({ source, filter });

  // Use custom directory if provided, otherwise use temp directory
  const workingDir = dir || join(process.cwd(), ".mdcode-tmp");
  const result: RunResult = { workingDir, blocks: [], errors: [] };

  if (blocks.length === 0) {
    return result;
  }

  await mkdir(workingDir, { recursive: true });

  try {
    for (const [ index, block ] of blocks.entries()) {
      const tmpFile = join(workingDir, `block-${index}${getExtension(block.lang)}`);

      await writeFile(tmpFile, block.code, "utf-8");

      // Replace {file} placeholder in command with the temp file path
      const actualCommand = command.replace(/\{file\}/g, tmpFile);
      const entry: RunBlockResult = { ...blockRef(block), lang: block.lang, exitCode: 0, stdout: "", stderr: "" };

      try {
        const { stdout, stderr } = await execAsync(actualCommand, { cwd: process.cwd(), timeout: TIMEOUT_MS });

        entry.stdout = stdout;
        entry.stderr = stderr;
      }
      catch (error: unknown) {
        const failure = error as { code?: unknown; killed?: boolean; stdout?: string; stderr?: string; };

        entry.exitCode = typeof failure.code === "number" ? failure.code : 1;
        entry.stdout = failure.stdout ?? "";
        entry.stderr = failure.stderr ?? "";
        result.errors.push(blockError(block, {
          code: "command_failed",
          message: failure.killed ? `command timed out after ${TIMEOUT_MS / 1000}s` : `command exited with code ${entry.exitCode}`,
        }));
      }
      finally {
        // Clean up temp file only if not keeping the directory
        if (!keep) {
          await unlink(tmpFile).catch(() => {});
        }
      }

      result.blocks.push(entry);
      onBlock?.(entry, index, blocks.length);
    }
  }
  finally {
    // Clean up temp directory only if not keeping and it's a temp directory (not custom)
    if (!keep && !dir) {
      // rmdir, not unlink: unlink cannot remove a directory, and rmdir leaves one that holds anything else.
      await rmdir(workingDir).catch(() => {});
    }
  }

  return result;
}

/** Human-readable report for one finished block, as the CLI prints it on stdout. */
export function formatRunBlock(block: RunBlockResult, index: number, total: number): Array<string> {
  const lines = [ styleText([ "bold", "cyan" ], `\n[${index + 1}/${total}] Running on block ${index + 1}...`) ];
  const ok = block.exitCode === 0;

  lines.push(ok ? styleText("green", "✓ Success") : styleText("red", `✗ Failed (exit code ${block.exitCode})`));

  if (block.stdout) {
    lines.push(`Output: ${block.stdout.trim()}`);
  }
  if (block.stderr) {
    lines.push(`${ok ? styleText("yellow", "Stderr:") : styleText("red", "Error:")} ${block.stderr.trim()}`);
  }

  return lines;
}

/**
 * Get file extension for a language
 */
function getExtension(lang: string): string {
  const extensions: Record<string, string> = {
    js: ".js",
    javascript: ".js",
    ts: ".ts",
    typescript: ".ts",
    py: ".py",
    python: ".py",
    go: ".go",
    rust: ".rs",
    rs: ".rs",
    java: ".java",
    c: ".c",
    cpp: ".cpp",
    "c++": ".cpp",
    sh: ".sh",
    bash: ".sh",
  };

  return extensions[lang.toLowerCase()] || ".txt";
}
