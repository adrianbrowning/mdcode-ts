import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { stdin } from "node:process";
import { pathToFileURL } from "node:url";

import { Command } from "commander";

import { dump } from "./commands/dump.js";
import { extract } from "./commands/extract.js";
import { list } from "./commands/list.js";
import { run } from "./commands/run.js";
import { update } from "./commands/update.js";
import type { FilterOptions } from "./types.js";

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

  program
    .name("mdcode")
    .description("Markdown code block authoring tool")
    .version("1.0.0");

  // List command
  program
    .command("list")
    .description("List code blocks from markdown")
    .argument("[file]", "Markdown file to read (default: stdin)")
    .option("--lang <lang>", "Filter by language")
    .option("--file <file>", "Filter by file metadata")
    .option("--meta <key=value...>", "Filter by custom metadata")
    .action(async (file, options) => {
      try {
        const source = await readInput(file);
        const filter = parseFilterOptions(options);
        const output = list({ source, filter });
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
    .option("--lang <lang>", "Filter by language")
    .option("--file <file>", "Filter by file metadata")
    .option("--meta <key=value...>", "Filter by custom metadata")
    .option("-o, --output <dir>", "Output directory (default: current directory)", ".")
    .action(async (file, options) => {
      try {
        const source = await readInput(file);
        const filter = parseFilterOptions(options);
        await extract({ source, filter, outputDir: options.output });
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
    .option("--lang <lang>", "Filter by language")
    .option("--file <file>", "Filter by file metadata")
    .option("--meta <key=value...>", "Filter by custom metadata")
    .action(async (command, file, options) => {
      try {
        const source = await readInput(file);
        const filter = parseFilterOptions(options);
        await run({ source, command, filter });
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
    .option("--lang <lang>", "Filter by language")
    .option("--file <file>", "Filter by file metadata")
    .option("--meta <key=value...>", "Filter by custom metadata")
    .option("-t, --transform <path>", "Path to transformer function file (must export default)")
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

        const output = await update({ source, filter, transformer });
        stdout.write(output);
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
    .option("--lang <lang>", "Filter by language")
    .option("--file <file>", "Filter by file metadata")
    .option("--meta <key=value...>", "Filter by custom metadata")
    .action(async (file, options) => {
      try {
        const source = await readInput(file);
        const filter = parseFilterOptions(options);
        const tarData = await dump({ source, filter });
        stdout.write(tarData);
      }
      catch (error: unknown) {
        if (error instanceof Error)stderr.write(`Error: ${error.message}\n`);
        // eslint-disable-next-line no-process-exit
        process.exit(1);
      }
    });

  await program.parseAsync(args, { from: "user" });
}
