import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';


import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { stdin } from "node:process";
import { pathToFileURL } from "node:url";

import { Command } from "commander";

import { dump } from "./commands/dump.ts";
import { extract } from "./commands/extract.ts";
import { list } from "./commands/list.ts";
import { run } from "./commands/run.ts";
import { update } from "./commands/update.ts";
import type { FilterOptions } from "./types.ts";

/**
 * Read input from file or stdin
 */
async function readInput(filePath?: string): Promise<string> {
  if (filePath) {
    return readFile(filePath, "utf-8");
  }

  // Read from stdin
  const chunks: Array<Buffer> = [];
  for await (const chunk of stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

/**
 * Parse filter options from command-line flags
 */
function parseFilterOptions(options: { lang?: string; file?: string; meta?: Record<string, string>; }): FilterOptions | undefined {
  const filter: FilterOptions = {};

  if (options.lang) {
    filter.lang = options.lang;
  }

  if (options.file) {
    filter.file = options.file;
  }

  if (options.meta) {
    // Parse meta as key=value pairs
    filter.meta = {};
    const pairs = Array.isArray(options.meta) ? options.meta : [ options.meta ];
    for (const pair of pairs) {
      const [ key, value ] = pair.split("=");
      if (key && value) {
        filter.meta[key] = value;
      }
    }
  }

  return Object.keys(filter).length > 0 ? filter : undefined;
}

/**
 * Execute the CLI with given arguments
 */
export async function Execute(
  args: Array<string>,
  stdout: NodeJS.WriteStream,
  stderr: NodeJS.WriteStream
): Promise<void> {
  const program = new Command();

    const __dirname = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));

  program
    .name("mdcode")
    .description("Markdown code block authoring tool")
    .version(pkg.version);

  // List command
  program
    .command("list")
    .description("List code blocks from markdown")
    .argument("[file]", "Markdown file to read (default: stdin)")
    .option("-l, --lang <lang>", "Filter by language")
    .option("-f, --file <file>", "Filter by file metadata")
    .option("-m, --meta <key=value...>", "Filter by custom metadata")
    .option("--json", "Output as JSON")
    .action(async (file, options) => {
      try {
        const source = await readInput(file);
        const filter = parseFilterOptions(options);
        const output = list({ source, filter, json: options.json });
        stdout.write(output + "\n");
      }
      catch (error: unknown) {
        if (error instanceof Error) stderr.write(`Error: ${error.message}\n`);
        // eslint-disable-next-line no-process-exit
        process.exit(1);
      }
    });

  // Extract command
  program
    .command("extract")
    .description("Extract code blocks to files")
    .argument("[file]", "Markdown file to read (default: stdin)")
    .option("-l, --lang <lang>", "Filter by language")
    .option("-f, --file <file>", "Filter by file metadata")
    .option("-m, --meta <key=value...>", "Filter by custom metadata")
    .option("-d, --dir <dir>", "Output directory (default: current directory)", ".")
    .option("-q, --quiet", "Suppress status messages")
    .action(async (file, options) => {
      try {
        const source = await readInput(file);
        const filter = parseFilterOptions(options);
        await extract({ source, filter, outputDir: options.dir, quiet: options.quiet });
      }
      catch (error: unknown) {
        if(error instanceof Error) stderr.write(`Error: ${error.message}\n`);
        // eslint-disable-next-line no-process-exit
        process.exit(1);
      }
    });

  // Run command
  program
    .command("run")
    .description("Run a shell command on each code block")
    .argument("<command>", "Command to run (use {file} as placeholder)")
    .argument("[file]", "Markdown file to read (default: stdin)")
    .option("-l, --lang <lang>", "Filter by language")
    .option("-f, --file <file>", "Filter by file metadata")
    .option("-m, --meta <key=value...>", "Filter by custom metadata")
    .option("-n, --name <name>", "Filter by block name")
    .option("-k, --keep", "Keep temporary directory after execution")
    .option("-d, --dir <dir>", "Working directory for command execution (default: temp directory)")
    .action(async (command, file, options) => {
      try {
        const source = await readInput(file);
        const filter = parseFilterOptions(options);

        // Add name to filter if provided
        if (options.name) {
          if (!filter) {
            await run({ source, command, filter: { meta: { name: options.name } }, keep: options.keep, dir: options.dir });
          }
          else {
            filter.meta = { ...filter.meta, name: options.name };
            await run({ source, command, filter, keep: options.keep, dir: options.dir });
          }
        }
        else {
          await run({ source, command, filter, keep: options.keep, dir: options.dir });
        }
      }
      catch (error: unknown) {
        if (error instanceof Error)stderr.write(`Error: ${error.message}\n`);
        // eslint-disable-next-line no-process-exit
        process.exit(1);
      }
    });

  // Update command
  program
    .command("update")
    .description("Update markdown code blocks from source files or via transformer")
    .argument("[file]", "Markdown file to read (default: stdin)")
    .option("-l, --lang <lang>", "Filter by language")
    .option("-f, --file <file>", "Filter by file metadata")
    .option("-m, --meta <key=value...>", "Filter by custom metadata")
    .option("-t, --transform <path>", "Path to transformer function file (must export default)")
    .option("-q, --quiet", "Suppress status messages")
    .option("--stdout", "Write output to stdout instead of updating file in-place")
    .action(async (file, options) => {
      try {
        const source = await readInput(file);
        const filter = parseFilterOptions(options);

        // Load transformer function if provided
        let transformer;
        if (options.transform) {
          try {
            // Resolve to absolute path and convert to file URL
            const absolutePath = resolve(process.cwd(), options.transform);
            const fileUrl = pathToFileURL(absolutePath).href;
            const transformModule = await import(fileUrl); // eslint-disable-line node/no-unsupported-features/es-syntax
            if (!transformModule.default || typeof transformModule.default !== "function") {
              stderr.write("Error: Transform file must export a default function\n");
              // eslint-disable-next-line no-process-exit
              process.exit(1);
            }
            transformer = transformModule.default;
          }
          catch (error: unknown) {
            if(error instanceof Error) stderr.write(`Error loading transform file: ${error.message}\n`);
            // eslint-disable-next-line no-process-exit
            process.exit(1);
          }
        }

        // Set basePath to the directory of the input file, or current directory if stdin
        const basePath = file ? dirname(resolve(file)) : process.cwd();

        const output = await update({ source, filter, transformer, basePath, quiet: options.quiet });

        // If file path is provided and --stdout flag is not set, write in-place
        if (file && !options.stdout) {
          await writeFile(file, output, "utf-8");
        }
        else {
          // Otherwise write to stdout
          stdout.write(output);
        }
      }
      catch (error: unknown) {
        if (error instanceof Error) stderr.write(`Error: ${error.message}\n`);
        // eslint-disable-next-line no-process-exit
        process.exit(1);
      }
    });

  // Dump command
  program
    .command("dump")
    .description("Create a tar archive of code blocks")
    .argument("[file]", "Markdown file to read (default: stdin)")
    .option("-l, --lang <lang>", "Filter by language")
    .option("-f, --file <file>", "Filter by file metadata")
    .option("-m, --meta <key=value...>", "Filter by custom metadata")
    .option("-q, --quiet", "Suppress status messages")
    .option("-o, --out <file>", "Output file (default: stdout)")
    .action(async (file, options) => {
      try {
        const source = await readInput(file);
        const filter = parseFilterOptions(options);
        const tarData = await dump({ source, filter, quiet: options.quiet });

        if (options.out) {
          await writeFile(options.out, tarData);
          if (!options.quiet) {
            stderr.write(`Dumped archive to ${options.out}\n`);
          }
        }
        else {
          stdout.write(tarData);
        }
      }
      catch (error: unknown) {
        if (error instanceof Error)stderr.write(`Error: ${error.message}\n`);
        // eslint-disable-next-line no-process-exit
        process.exit(1);
      }
    });

  // Default behavior: if no subcommand is provided, run list on README.md
  const commands = [ "list", "extract", "update", "run", "dump" ];
  const hasCommand = !!args[0] && commands.includes(args[0]);

  if (!hasCommand && args.length === 0) {
    // No arguments at all - run list README.md
    args = [ "list", "README.md" ];
  }
  else if (!hasCommand && !args[0]?.startsWith("-")) {
    // First arg is not a command and not a flag - could be a file
    // Insert 'list' command before it
    args = [ "list", ...args ];
  }

  await program.parseAsync(args, { from: "user" });
}
