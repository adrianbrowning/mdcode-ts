import { writeFile, unlink, mkdir } from 'node:fs/promises';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { styleText } from 'node:util';
import { parse } from '../parser.js';
import type { FilterOptions } from '../types.js';

const execAsync = promisify(exec);

export interface RunOptions {
  source: string;
  command: string;
  filter?: FilterOptions;
}

export interface RunResult {
  blockIndex: number;
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: Error;
}

/**
 * Run a shell command on each code block
 */
export async function run(options: RunOptions): Promise<RunResult[]> {
  const { source, command, filter } = options;
  const blocks = parse({ source, filter });

  if (blocks.length === 0) {
    console.log(styleText('yellow', 'No code blocks found to run.'));
    return [];
  }

  const results: RunResult[] = [];
  const tmpDir = join(process.cwd(), '.mdcode-tmp');

  // Create temp directory
  await mkdir(tmpDir, { recursive: true });

  try {
    for (const [index, block] of blocks.entries()) {
      console.log(styleText(['bold', 'cyan'], `\n[${index + 1}/${blocks.length}] Running on block ${index + 1}...`));

      // Generate temp file
      const ext = getExtension(block.lang);
      const tmpFile = join(tmpDir, `block-${index}${ext}`);

      // Write block to temp file
      await writeFile(tmpFile, block.code, 'utf-8');

      // Replace {file} placeholder in command with the temp file path
      const actualCommand = command.replace(/\{file\}/g, tmpFile);

      try {
        const { stdout, stderr } = await execAsync(actualCommand, {
          cwd: process.cwd(),
          timeout: 30000, // 30 second timeout
        });

        results.push({
          blockIndex: index,
          stdout,
          stderr,
          exitCode: 0,
        });

        console.log(styleText('green', '✓ Success'));
        if (stdout) {
          console.log('Output:', stdout.trim());
        }
        if (stderr) {
          console.log(styleText('yellow', 'Stderr:'), stderr.trim());
        }
      } catch (error: any) {
        const exitCode = error.code || 1;
        results.push({
          blockIndex: index,
          stdout: error.stdout || '',
          stderr: error.stderr || '',
          exitCode,
          error,
        });

        console.log(styleText('red', `✗ Failed (exit code ${exitCode})`));
        if (error.stdout) {
          console.log('Output:', error.stdout.trim());
        }
        if (error.stderr) {
          console.log(styleText('red', 'Error:'), error.stderr.trim());
        }
      } finally {
        // Clean up temp file
        await unlink(tmpFile).catch(() => {});
      }
    }
  } finally {
    // Clean up temp directory
    await unlink(tmpDir).catch(() => {});
  }

  return results;
}

/**
 * Get file extension for a language
 */
function getExtension(lang: string): string {
  const extensions: Record<string, string> = {
    js: '.js',
    javascript: '.js',
    ts: '.ts',
    typescript: '.ts',
    py: '.py',
    python: '.py',
    go: '.go',
    rust: '.rs',
    rs: '.rs',
    java: '.java',
    c: '.c',
    cpp: '.cpp',
    'c++': '.cpp',
    sh: '.sh',
    bash: '.sh',
  };

  return extensions[lang.toLowerCase()] || '.txt';
}
