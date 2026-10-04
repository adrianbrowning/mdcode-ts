import { readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { stdin } from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { styleText } from "node:util";

import { Command, CommanderError } from "commander";

import { dump, formatDump } from "./commands/dump.ts";
import { extract, formatExtract } from "./commands/extract.ts";
import { formatList, list } from "./commands/list.ts";
import { formatRunBlock, run } from "./commands/run.ts";
import { formatUpdate, update } from "./commands/update.ts";
import type { CommandName, Envelope, ResultError } from "./result.ts";
import { CommandError, CONTRACT_VERSION, errorsFrom } from "./result.ts";
import type { FilterOptions, TransformerFunction } from "./types.ts";

const COMMANDS: ReadonlyArray<CommandName> = [ "list", "extract", "update", "run", "dump" ];

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

type FilterCliOptions = {
  lang?: string;
  name?: string;
  file?: string;
  meta?: Record<string, string>;
  json?: boolean;
};

/** Flags accepted by `mdcode extract`, so a renamed flag is a compile error. */
type ExtractCliOptions = FilterCliOptions & {
  dir: string;
  quiet?: boolean;
  updateSource?: boolean;
  ignoreAnonymous?: boolean;
  force?: boolean;
};

/**
 * Parse filter options from command-line flags
 */
function parseFilterOptions(options: FilterCliOptions): FilterOptions | undefined {
  const filter: FilterOptions = {};

  if (options.lang) {
    filter.lang = options.lang;
  }

  if (options.name) {
    filter.name = options.name;
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

/** Load the default export of a --transform module. */
async function loadTransformer(path: string): Promise<TransformerFunction> {
  let module: { default?: unknown; };

  try {
    // Dynamic: the module path comes from --transform at runtime.
    module = await import(pathToFileURL(resolve(process.cwd(), path)).href); // eslint-disable-line node/no-unsupported-features/es-syntax
  }
  catch (error: unknown) {
    throw new CommandError("invalid_transform", `could not load transform file: ${error instanceof Error ? error.message : String(error)}`, path);
  }

  if (typeof module.default !== "function") {
    throw new CommandError("invalid_transform", "Transform file must export a default function", path);
  }

  return module.default as TransformerFunction;
}

/** What one command produced, before it is presented as JSON or as text. */
type Outcome = {
  /** The envelope's `result`. */
  result: unknown;
  errors: Array<ResultError>;
  /** Print the human-readable form; only called without --json. */
  human: () => void;
  /** Exit code when errors is non-empty; defaults to 1. */
  failureExitCode?: number;
};

/**
 * Execute the CLI with given arguments
 */
export async function Execute(
  args: Array<string>,
  stdout: NodeJS.WriteStream,
  stderr: NodeJS.WriteStream
): Promise<void> {
  // Default behavior: if no subcommand is provided, run list on README.md
  const hasCommand = COMMANDS.includes(args[0] as CommandName);

  if (!hasCommand && args.length === 0) {
    // No arguments at all - run list README.md
    args = [ "list", "README.md" ];
  }
  else if (!hasCommand && !args[0]?.startsWith("-")) {
    // First arg is not a command and not a flag - could be a file
    // Insert 'list' command before it
    args = [ "list", ...args ];
  }

  const commandName = COMMANDS.find(name => name === args[0]);
  // Known before parsing, so that even a flag error can be reported as JSON.
  const jsonRequested = commandName !== undefined && args.includes("--json");

  const writeEnvelope = (command: CommandName, result: unknown, errors: Array<ResultError>): void => {
    const envelope: Envelope<unknown> = { version: CONTRACT_VERSION, command, ok: errors.length === 0, result, errors };
    stdout.write(JSON.stringify(envelope) + "\n");
  };

  /**
   * Run one command and present its outcome. Nothing is printed until the work
   * is done, so --json output is exactly one envelope. process.exitCode rather
   * than process.exit(), which could drop output still buffered for a pipe.
   */
  const perform = async (command: CommandName, json: boolean | undefined, work: () => Promise<Outcome>): Promise<void> => {
    let outcome: Outcome;

    try {
      outcome = await work();
    }
    catch (error: unknown) {
      if (json) {
        writeEnvelope(command, null, errorsFrom(error));
      }
      else {
        stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
      }
      process.exitCode = 1;
      return;
    }

    if (json) {
      writeEnvelope(command, outcome.result, outcome.errors);
    }
    else {
      outcome.human();
    }

    if (outcome.errors.length > 0) {
      process.exitCode = outcome.failureExitCode ?? 1;
    }
  };

  const writeLines = (stream: NodeJS.WriteStream, lines: Array<string>): void => {
    if (lines.length > 0) {
      stream.write(lines.join("\n") + "\n");
    }
  };

  const program = new Command();

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf-8"));

  // Set before any .command() so every subcommand inherits them.
  program
    .exitOverride()
    .configureOutput({
      writeOut: text => stdout.write(text),
      // With --json, a flag error is reported in the envelope instead.
      writeErr: text => {
        if (!jsonRequested) stderr.write(text);
      },
    });

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
    .option("-n, --name <name>", "Select the block with this name= metadata")
    .option("--json", "Print one versioned JSON result instead of text")
    .action(async (file: string | undefined, options: FilterCliOptions) => {
      await perform("list", options.json, async () => {
        const result = list({ source: await readInput(file), filter: parseFilterOptions(options) });

        return { result, errors: [], human: () => stdout.write(formatList(result) + "\n") };
      });
    });

  // Extract command
  program
    .command("extract")
    .description("Extract code blocks to files")
    .argument("[file]", "Markdown file to read (default: stdin)")
    .option("-l, --lang <lang>", "Filter by language")
    .option("-f, --file <file>", "Filter by file metadata")
    .option("-m, --meta <key=value...>", "Filter by custom metadata")
    .option("-n, --name <name>", "Select the block with this name= metadata")
    .option("-d, --dir <dir>", "Directory that relative file= paths resolve against; they may leave it (e.g. file=../x.ts). Absolute file= paths are refused (default: current directory)", ".")
    .option("-q, --quiet", "Suppress status messages")
    .option("--update-source", "Add file metadata to anonymous code blocks")
    .option("--ignore-anonymous", "Skip blocks without file metadata")
    .option("--force", "Overwrite existing files whose blocks have no region=")
    .option("--json", "Print one versioned JSON result instead of text")
    .action(async (file: string | undefined, options: ExtractCliOptions) => {
      await perform("extract", options.json, async () => {
        if (options.updateSource && options.ignoreAnonymous) {
          throw new CommandError("invalid_usage", "Cannot use --update-source and --ignore-anonymous together");
        }

        const { errors, ...result } = await extract({
          source: await readInput(file),
          filter: parseFilterOptions(options),
          outputDir: options.dir,
          updateSource: options.updateSource,
          ignoreAnonymous: options.ignoreAnonymous,
          force: options.force,
        });
        const { updatedSource, ...targets } = result;

        // A file is updated in place; markdown from stdin goes back out on
        // stdout, or into the JSON result where stdout is taken.
        if (updatedSource !== undefined && file) {
          await writeFile(file, updatedSource, "utf-8");
        }

        return {
          result: updatedSource === undefined ? targets : file ? { ...targets, written: file } : result,
          errors,
          // A refusal to write must be distinguishable from success by CI and
          // by scripts, so it fails the process with its own code.
          failureExitCode: 2,
          human: () => {
            if (!options.quiet) {
              writeLines(stderr, formatExtract(result, options));
            }

            if (updatedSource !== undefined) {
              if (!file) {
                stdout.write(updatedSource);
              }
              else if (!options.quiet) {
                stderr.write(styleText("green", `✓ Updated ${file} with file metadata\n`));
              }
            }

            // Reported even under --quiet, so a refusal is never silent.
            if (errors.length > 0) {
              stderr.write(styleText("yellow", `⚠ Skipped ${errors.length} file(s); nothing was written for them\n`));
            }
          },
        };
      });
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
    .option("-n, --name <name>", "Select the block with this name= metadata")
    .option("-k, --keep", "Keep temporary directory after execution")
    .option("-d, --dir <dir>", "Working directory for command execution (default: temp directory)")
    .option("--json", "Print one versioned JSON result instead of text")
    .action(async (command: string, file: string | undefined, options: FilterCliOptions & { keep?: boolean; dir?: string; }) => {
      await perform("run", options.json, async () => {
        const { errors, ...result } = await run({
          source: await readInput(file),
          command,
          filter: parseFilterOptions(options),
          keep: options.keep,
          dir: options.dir,
          // Human progress streams as each block finishes; JSON waits for the end.
          onBlock: options.json ? undefined : (block, index, total) => writeLines(stdout, formatRunBlock(block, index, total)),
        });

        return {
          result,
          errors,
          human: () => {
            if (result.blocks.length === 0) {
              stdout.write(styleText("yellow", "No code blocks found to run.") + "\n");
            }
            else if (options.keep) {
              stdout.write(styleText("cyan", `Working directory: ${result.workingDir}`) + "\n");
            }
          },
        };
      });
    });

  // Update command
  program
    .command("update")
    .description("Update markdown code blocks from source files or via transformer")
    .argument("[file]", "Markdown file to read (default: stdin)")
    .option("-l, --lang <lang>", "Filter by language")
    .option("-f, --file <file>", "Filter by file metadata")
    .option("-m, --meta <key=value...>", "Filter by custom metadata")
    .option("-n, --name <name>", "Select the block with this name= metadata")
    .option("-t, --transform <path>", "Path to transformer function file (must export default)")
    .option("-q, --quiet", "Suppress status messages")
    .option("--stdout", "Write output to stdout instead of updating file in-place")
    .option("--json", "Print one versioned JSON result instead of text")
    .action(async (file: string | undefined, options: FilterCliOptions & { transform?: string; quiet?: boolean; stdout?: boolean; }) => {
      await perform("update", options.json, async () => {
        const source = await readInput(file);
        const transformer = options.transform ? await loadTransformer(options.transform) : undefined;

        // file= paths resolve against the markdown file's directory, or the current directory for stdin
        const basePath = file ? dirname(resolve(file)) : process.cwd();
        const outcome = await update({ source, filter: parseFilterOptions(options), transformer, basePath });
        const inPlace = file !== undefined && !options.stdout;

        if (inPlace) {
          await writeFile(file, outcome.source, "utf-8");
        }

        return {
          result: inPlace ? { blocks: outcome.blocks, written: file } : { blocks: outcome.blocks, source: outcome.source },
          errors: outcome.errors,
          human: () => {
            writeLines(stderr, formatUpdate(outcome, options));

            if (!inPlace) {
              stdout.write(outcome.source);
            }
          },
        };
      });
    });

  // Dump command
  program
    .command("dump")
    .description("Create a tar archive of code blocks")
    .argument("[file]", "Markdown file to read (default: stdin)")
    .option("-l, --lang <lang>", "Filter by language")
    .option("-f, --file <file>", "Filter by file metadata")
    .option("-m, --meta <key=value...>", "Filter by custom metadata")
    .option("-n, --name <name>", "Select the block with this name= metadata")
    .option("-q, --quiet", "Suppress status messages")
    .option("-o, --out <file>", "Output file (default: stdout; required with --json)")
    .option("--json", "Print one versioned JSON result instead of text; the archive goes to --out")
    .action(async (file: string | undefined, options: FilterCliOptions & { quiet?: boolean; out?: string; }) => {
      await perform("dump", options.json, async () => {
        // Checked first: with --json the archive cannot share stdout with the result.
        if (options.json && !options.out) {
          throw new CommandError("invalid_usage", "dump --json needs --out <file> for the archive");
        }

        const { files, archive } = await dump({ source: await readInput(file), filter: parseFilterOptions(options) });

        if (options.out) {
          await writeFile(options.out, archive);
        }

        return {
          result: { out: options.out ?? null, files },
          errors: [],
          human: () => {
            if (!options.quiet) {
              writeLines(stderr, formatDump({ files, archive }));
            }

            if (!options.out) {
              stdout.write(archive);
            }
            else if (!options.quiet) {
              stderr.write(`Dumped archive to ${options.out}\n`);
            }
          },
        };
      });
    });

  try {
    await program.parseAsync(args, { from: "user" });
  }
  catch (error: unknown) {
    if (!(error instanceof CommanderError)) {
      throw error;
    }

    // --help and --version end parsing with exit code 0.
    if (error.exitCode !== 0 && jsonRequested) {
      writeEnvelope(commandName, null, [{ code: "invalid_usage", message: error.message.replace(/^error: /, "") }]);
    }

    process.exitCode = error.exitCode;
  }
}
