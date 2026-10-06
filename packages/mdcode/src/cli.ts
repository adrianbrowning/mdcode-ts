import { readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { stdin } from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { styleText } from "node:util";

import { Command, CommanderError, Option } from "commander";
import { createTwoFilesPatch, FILE_HEADERS_ONLY } from "diff";

import { dump, formatDump } from "./commands/dump.ts";
import type { ExtractResult } from "./commands/extract.ts";
import { extract, formatExtract } from "./commands/extract.ts";
import { formatList, list } from "./commands/list.ts";
import { formatRunBlock, run } from "./commands/run.ts";
import type { UpdateResult } from "./commands/update.ts";
import { describeChange, formatUpdate, update } from "./commands/update.ts";
import type { ValidatedDocument, ValidateOperation, ValidateOptions } from "./commands/validate.ts";
import { sharedTargetErrors, validate } from "./commands/validate.ts";
import type { WatchEvent, WatchTarget } from "./commands/watch.ts";
import { formatWatch, watch } from "./commands/watch.ts";
import type { ProjectConfig } from "./config.ts";
import { CONFIG_FILE, loadConfig } from "./config.ts";
import type { CommandName, Envelope, ResultError } from "./result.ts";
import { BlockFailure, COMMAND_NAMES, CommandError, CONTRACT_VERSION, describeError, errorsFrom } from "./result.ts";
import type { FilterOptions, TransformerFunction } from "./types.ts";

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
  name?: Array<string>;
  file?: string;
  meta?: Array<string>;
  json?: boolean;
};

/** Collect a repeatable option, such as --name, into an array. */
function collect(value: string, previous: Array<string> | undefined): Array<string> {
  return [ ...previous ?? [], value ];
}

const NAME_FLAG_HELP = "Select the block with this name= metadata; repeat to select several";
const META_FLAG_HELP = "Select blocks with this key=value metadata; repeat to require several";
const DOCUMENTS_HELP = "Markdown files to read (default: the configuration's documents with --project or --config, otherwise stdin)";
const PROJECT_HELP = `Load ${CONFIG_FILE} from the current directory for default documents, roots and filters`;
const CONFIG_HELP = "Load this configuration file instead; implies --project";

/** Flags that select a project configuration. */
type ProjectCliOptions = { project?: boolean; config?: string; };

/** One Markdown document a command works on; file and label are unset for stdin. */
type Document = { file?: string; label: string | null; };

/** Load the configuration --config names, or the one --project finds in the current directory. */
async function loadProject(options: ProjectCliOptions): Promise<ProjectConfig | undefined> {
  const path = options.config ?? (options.project ? CONFIG_FILE : undefined);
  return path === undefined ? undefined : loadConfig(path);
}

/** The documents to read: those named on the command line, else the configuration's, else stdin. */
function selectDocuments(files: Array<string>, config: ProjectConfig | undefined): Array<Document> {
  if (files.length > 0) {
    return files.map(file => ({ file, label: file }));
  }

  if (config === undefined) {
    return [{ label: null }];
  }

  if (config.documents.length === 0) {
    const path = relative(process.cwd(), config.path);
    throw new CommandError("invalid_config", `${path} lists no documents; add "documents" or pass a Markdown file`, path);
  }

  return config.documents.map(file => ({ file, label: relative(process.cwd(), file) }));
}

/** A configuration's default filters, with each filter flag given on the command line replacing its counterpart. */
function mergeFilters(defaults: FilterOptions | undefined, flags: FilterOptions | undefined): FilterOptions | undefined {
  const merged = { ...defaults, ...flags };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

/** Mark errors with the document they came from; stdin has no name to give. */
function inDocument(document: Document, errors: Array<ResultError>): Array<ResultError> {
  return document.label === null ? errors : errors.map(error => ({ document: document.label!, ...error }));
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A failure as lines of text: one per block a BlockFailure names, else its message. */
function errorLines(error: unknown): Array<string> {
  return error instanceof BlockFailure ? error.errors.map(describeError) : [ messageOf(error) ];
}

/** Where update resolves a document's file= paths: --base, else sourceRoot, else the markdown's directory, or the current directory for stdin. */
function updateBase(base: string | undefined, config: ProjectConfig | undefined, document: Document): string {
  return base ? resolve(base) : config?.sourceRoot ?? (document.file ? dirname(resolve(document.file)) : process.cwd());
}

/** Where extract writes: --dir, else outputRoot, else the current directory. */
function extractDir(dir: string | undefined, config: ProjectConfig | undefined): string {
  return dir ?? config?.outputRoot ?? ".";
}

/**
 * validate() every document for one operation, reporting every problem rather
 * than stopping at the first. For extract with several documents, blocks in
 * different documents that write one file are checked against each other too.
 */
async function validateDocuments(
  documents: Array<Document>,
  operation: ValidateOperation,
  options: Pick<ValidateOptions, "filter" | "strict" | "ignoreAnonymous"> & { base: (document: Document) => string; }
): Promise<{ results: Array<ValidatedDocument>; errors: Array<ResultError>; lines: Array<string>; }> {
  const { base, ...shared } = options;
  const several = documents.length > 1;
  const at = (label: string | null | undefined, text: string): string => several ? `${label}: ${text}` : text;
  const results: Array<ValidatedDocument> = [];
  const errors: Array<ResultError> = [];
  const lines: Array<string> = [];
  const report = (error: ResultError): void => {
    lines.push(styleText("red", at(error.document, `✗ ${describeError(error)} (${error.code})`)));
  };

  for (const document of documents) {
    try {
      const checked = await validate({ ...shared, source: await readInput(document.file), operation, base: base(document) });
      const found = inDocument(document, checked.errors);

      results.push({ document: document.label, blocks: checked.blocks });
      errors.push(...found);
      found.forEach(report);
    }
    catch (error: unknown) {
      errors.push(...inDocument(document, errorsFrom(error)));
      lines.push(...errorLines(error).map(line => `Error: ${at(document.label, line)}`));
    }
  }

  if (operation === "extract" && several) {
    for (const error of await sharedTargetErrors(results)) {
      const block = results.find(({ document }) => document === (error.document ?? null))?.blocks.find(({ line }) => line === error.line);

      if (block) {
        block.valid = false;
      }
      errors.push(error);
      report(error);
    }
  }

  return { results, errors, lines };
}

/** What `mdcode update` does with the updated markdown; only apply writes it. */
const UPDATE_MODES = [ "plan", "apply", "diff", "check", "stdout" ] as const;

type UpdateCliOptions = FilterCliOptions & ProjectCliOptions & Partial<Record<typeof UPDATE_MODES[number], boolean>> & {
  transform?: string;
  quiet?: boolean;
  base?: string;
  continueOnError?: boolean;
};

/** What update did to one document, as it appears in the result's documents. */
type UpdatedDocument = Pick<UpdateResult, "blocks"> & {
  document: string | null;
  /** --apply: the file written, or null when nothing changed. */
  written?: string | null;
  /** --diff */
  diff?: string;
  /** --stdout */
  source?: string;
};

/** Flags accepted by `mdcode extract`, so a renamed flag is a compile error. */
type ExtractCliOptions = FilterCliOptions & ProjectCliOptions & {
  dir?: string;
  quiet?: boolean;
  updateSource?: boolean;
  ignoreAnonymous?: boolean;
  force?: boolean;
  check?: boolean;
};

/** What extract did for one document, as it appears in the result's documents. */
type ExtractedDocument = Omit<ExtractResult, "errors"> & {
  document: string | null;
  /** --update-source: the Markdown file rewritten with file= metadata. */
  written?: string;
};

const VALIDATE_OPERATIONS: ReadonlyArray<ValidateOperation> = [ "extract", "update" ];

/** Flags accepted by `mdcode validate`. */
type ValidateCliOptions = FilterCliOptions & ProjectCliOptions & {
  for: ValidateOperation;
  strict?: boolean;
  base?: string;
  dir?: string;
  ignoreAnonymous?: boolean;
};

/**
 * Parse filter options from command-line flags
 */
function parseFilterOptions(options: FilterCliOptions): FilterOptions | undefined {
  const filter: FilterOptions = {};

  if (options.lang) {
    filter.lang = options.lang;
  }

  if (options.name && options.name.length > 0) {
    filter.name = options.name;
  }

  if (options.file) {
    filter.file = options.file;
  }

  if (options.meta) {
    // Each --meta is one key=value pair; the value may itself contain =
    filter.meta = {};
    for (const pair of options.meta) {
      const at = pair.indexOf("=");
      const key = pair.slice(0, at);
      const value = pair.slice(at + 1);
      if (at > 0 && value) {
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
 * @returns the process exit code: 0 on success, 1 on any error, 2 when extract skipped a target
 */
export async function Execute(
  args: Array<string>,
  stdout: NodeJS.WriteStream,
  stderr: NodeJS.WriteStream
): Promise<number> {
  // Set by the command that runs; parsing errors set it too.
  let exitCode = 0;
  // Default behavior: if no subcommand is provided, run list on README.md
  const hasCommand = COMMAND_NAMES.includes(args[0] as CommandName);

  if (!hasCommand && args.length === 0) {
    // No arguments at all - run list README.md
    args = [ "list", "README.md" ];
  }
  else if (!hasCommand && !args[0]?.startsWith("-")) {
    // First arg is not a command and not a flag - could be a file
    // Insert 'list' command before it
    args = [ "list", ...args ];
  }

  const commandName = COMMAND_NAMES.find(name => name === args[0]);
  // Known before parsing, so that even a flag error can be reported as JSON.
  const jsonRequested = commandName !== undefined && args.includes("--json");

  const writeEnvelope = (command: CommandName, result: unknown, errors: Array<ResultError>): void => {
    const envelope: Envelope<unknown> = { version: CONTRACT_VERSION, command, ok: errors.length === 0, result, errors };
    stdout.write(JSON.stringify(envelope) + "\n");
  };

  /**
   * Run one command and present its outcome. Nothing is printed until the work
   * is done, so --json output is exactly one envelope.
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
        writeLines(stderr, errorLines(error).map(line => `Error: ${line}`));
      }
      exitCode = 1;
      return;
    }

    if (json) {
      writeEnvelope(command, outcome.result, outcome.errors);
    }
    else {
      outcome.human();
    }

    if (outcome.errors.length > 0) {
      exitCode = outcome.failureExitCode ?? 1;
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
    .option("-m, --meta <key=value>", META_FLAG_HELP, collect)
    .option("-n, --name <name>", NAME_FLAG_HELP, collect)
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
    .argument("[files...]", DOCUMENTS_HELP)
    .option("-l, --lang <lang>", "Filter by language")
    .option("-f, --file <file>", "Filter by file metadata")
    .option("-m, --meta <key=value>", META_FLAG_HELP, collect)
    .option("-n, --name <name>", NAME_FLAG_HELP, collect)
    .option("-d, --dir <dir>", "Directory file= paths resolve against and must stay inside; absolute paths and paths leading out, including through symlinks, are refused (default: the configuration's outputRoot, else the current directory)")
    .option("-q, --quiet", "Suppress status messages")
    .option("--update-source", "Add file metadata to anonymous code blocks")
    .option("--ignore-anonymous", "Skip blocks without file metadata")
    .option("--force", "Overwrite existing files whose blocks have no region=")
    .option("--check", "Exit 1 when a file differs from what extract would write, without writing")
    .option("--project", PROJECT_HELP)
    .option("--config <path>", CONFIG_HELP)
    .option("--json", "Print one versioned JSON result instead of text")
    .action(async (files: Array<string>, options: ExtractCliOptions) => {
      await perform("extract", options.json, async () => {
        if (options.updateSource && options.ignoreAnonymous) {
          throw new CommandError("invalid_usage", "Cannot use --update-source and --ignore-anonymous together");
        }

        if (options.check && options.updateSource) {
          throw new CommandError("invalid_usage", "Cannot use --check and --update-source together: --check writes nothing");
        }

        const config = await loadProject(options);
        const documents = selectDocuments(files, config);
        const filter = mergeFilters(config?.filter, parseFilterOptions(options));
        const outputDir = extractDir(options.dir, config);
        const several = documents.length > 1;

        // Plan every document before writing to any, so that one refusal, or two
        // documents writing one file, leaves every document's targets untouched.
        // One document plans for itself inside extract().
        if (several) {
          const planned = await validateDocuments(documents, "extract", { filter, base: () => outputDir, ignoreAnonymous: options.ignoreAnonymous });

          if (planned.errors.length > 0) {
            return {
              result: null,
              errors: planned.errors,
              human: () => writeLines(stderr, [
                ...planned.errors.map(error => `Error: ${error.document}: ${describeError(error)}`),
                styleText("yellow", options.check ? `Nothing was checked for any of the ${documents.length} documents.` : `Nothing was written for any of the ${documents.length} documents.`),
              ]),
            };
          }
        }

        const results: Array<ExtractedDocument> = [];
        const errors: Array<ResultError> = [];
        const reports: Array<() => void> = [];

        for (const document of documents) {
          // With several documents, each line says which one it is about.
          const at = (text: string): string => several ? `${document.label}: ${text}` : text;
          let extracted: ExtractResult;

          try {
            extracted = await extract({
              source: await readInput(document.file),
              filter,
              outputDir,
              updateSource: options.updateSource,
              ignoreAnonymous: options.ignoreAnonymous,
              force: options.force,
              check: options.check,
            });
          }
          catch (error: unknown) {
            errors.push(...inDocument(document, errorsFrom(error)));
            reports.push(() => writeLines(stderr, errorLines(error).map(line => `Error: ${at(line)}`)));

            // Extract writes as it goes, so later documents are not started. --check writes nothing.
            if (options.check) {
              continue;
            }
            break;
          }

          const { errors: skipped, ...result } = extracted;
          const { updatedSource, ...targets } = result;

          // A file is updated in place; markdown from stdin goes back out on
          // stdout, or into the JSON result where stdout is taken.
          if (updatedSource !== undefined && document.file) {
            await writeFile(document.file, updatedSource, "utf-8");
          }

          results.push({
            document: document.label,
            ...updatedSource === undefined ? targets : document.label === null ? result : { ...targets, written: document.label },
          });
          errors.push(...inDocument(document, skipped));
          reports.push(() => {
            const drift = skipped.filter(error => error.code === "out_of_sync");
            const refused = skipped.filter(error => error.code === "extract_skipped");

            if (!options.quiet) {
              writeLines(stderr, formatExtract(result, options).filter((_, index) => !options.check || result.targets[index]!.action === "unchanged" || result.targets[index]!.action === "skipped").map(at));
            }

            if (updatedSource !== undefined) {
              if (document.label === null) {
                stdout.write(updatedSource);
              }
              else if (!options.quiet) {
                stderr.write(styleText("green", `✓ Updated ${document.label} with file metadata\n`));
              }
            }

            // Reported even under --quiet, so a failing check always says why.
            if (options.check) {
              writeLines(stderr, drift.map(error => styleText("red", at(`✗ Out of sync: ${describeError(error)}`))));

              if (drift.length > 0) {
                stderr.write(styleText("yellow", at(`${drift.length} block(s) out of sync with their files. Run mdcode extract to write them, or mdcode update to bring the blocks up to date instead.`)) + "\n");
              }
            }

            // Reported even under --quiet, so a refusal is never silent.
            if (refused.length > 0) {
              stderr.write(styleText("yellow", at(`⚠ Skipped ${refused.length} file(s); nothing was written for them`)) + "\n");
            }
          });
        }

        return {
          // null when no document got as far as a result, as for any failure before work.
          result: results.length === 0 ? null : { documents: results },
          errors,
          // A refusal to write must be distinguishable from success by CI and
          // by scripts, so it fails the process with its own code.
          failureExitCode: errors.every(error => error.code === "extract_skipped") ? 2 : 1,
          human: () => {
            for (const report of reports) {
              report();
            }
          },
        };
      });
    });

  // Run command
  program
    .command("run")
    .description("Run a shell command on each code block. Needs --allow-shell")
    .argument("<command>", "Command to run through the shell (use {file} as placeholder)")
    .argument("[file]", "Markdown file to read (default: stdin)")
    .option("-l, --lang <lang>", "Filter by language")
    .option("-f, --file <file>", "Filter by file metadata")
    .option("-m, --meta <key=value>", META_FLAG_HELP, collect)
    .option("-n, --name <name>", NAME_FLAG_HELP, collect)
    .option("-k, --keep", "Keep temporary directory after execution")
    .option("-d, --dir <dir>", "Working directory for command execution (default: temp directory)")
    .option("--allow-shell", "Confirm that <command> may run through the shell once per selected block")
    .option("--json", "Print one versioned JSON result instead of text")
    .action(async (command: string, file: string | undefined, options: FilterCliOptions & { keep?: boolean; dir?: string; allowShell?: boolean; }) => {
      await perform("run", options.json, async () => {
        if (!options.allowShell) {
          throw new CommandError("invalid_usage", "run executes <command> through the shell for every selected block; pass --allow-shell to confirm");
        }

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
    .description("Update markdown code blocks from source files or via transformer. Prints a plan; only --apply writes the markdown")
    .argument("[files...]", DOCUMENTS_HELP)
    .option("-l, --lang <lang>", "Filter by language")
    .option("-f, --file <file>", "Filter by file metadata")
    .option("-m, --meta <key=value>", META_FLAG_HELP, collect)
    .option("-n, --name <name>", NAME_FLAG_HELP, collect)
    .option("-t, --transform <path>", "Path to transformer function file (must export default)")
    .option("-q, --quiet", "Suppress status messages")
    .option("--base <dir>", "Directory file= paths resolve against and must stay inside (default: the configuration's sourceRoot, else the markdown file's directory, or the current directory for stdin)")
    .option("--continue-on-error", "Report failed documents, reads and transforms and keep going, instead of stopping at the first")
    .option("--plan", "List the blocks that would change, without writing (default)")
    .option("--apply", "Write the changes to the markdown files in place")
    .option("--diff", "Print a unified diff of the changes, without writing")
    .option("--check", "Exit 1 when a selected block is out of sync, without writing")
    .option("--stdout", "Print the updated markdown of one document, without writing")
    .option("--project", PROJECT_HELP)
    .option("--config <path>", CONFIG_HELP)
    .option("--json", "Print one versioned JSON result instead of text")
    .action(async (files: Array<string>, options: UpdateCliOptions) => {
      await perform("update", options.json, async () => {
        const modes = UPDATE_MODES.filter(mode => options[mode]);

        if (modes.length > 1) {
          throw new CommandError("invalid_usage", `Use only one of ${modes.map(mode => `--${mode}`).join(", ")}`);
        }

        const mode = modes[0] ?? "plan";
        const config = await loadProject(options);
        const documents = selectDocuments(files, config);

        if (mode === "apply" && documents.some(document => document.file === undefined)) {
          throw new CommandError("invalid_usage", "--apply needs a markdown file to write; use --stdout to print the updated markdown");
        }

        if (mode === "stdout" && documents.length > 1) {
          throw new CommandError("invalid_usage", `--stdout prints one document, but ${documents.length} are selected; pass a single Markdown file`);
        }

        const transformer = options.transform ? await loadTransformer(options.transform) : undefined;
        const filter = mergeFilters(config?.filter, parseFilterOptions(options));

        // Every document is worked out before any is written, so a misspelt --name writes nothing.
        const worked: Array<{ document: Document; source: string; outcome: UpdateResult; } | { document: Document; error: unknown; }> = [];

        for (const document of documents) {
          try {
            const source = await readInput(document.file);
            // file= paths resolve against, and must stay inside, the base
            const basePath = updateBase(options.base, config, document);
            worked.push({ document, source, outcome: await update({ source, filter, transformer, basePath, continueOnError: options.continueOnError }) });
          }
          catch (error: unknown) {
            worked.push({ document, error });

            if (!options.continueOnError) {
              break;
            }
          }
        }

        // A misspelt name would otherwise select nothing, so every mode would be a
        // silent no-op and --check would pass. It cannot be told when a document failed.
        const missing = worked.some(item => "error" in item)
          ? []
          : (options.name ?? []).filter(name => !worked.some(item => "outcome" in item && item.outcome.blocks.some(block => block.name === name)));

        if (missing.length > 0) {
          throw new CommandError("invalid_usage", `No selected block is named ${missing.map(name => JSON.stringify(name)).join(", ")}`);
        }

        const several = documents.length > 1;
        // Without --continue-on-error, --apply writes every document or none of them.
        const abandoned = mode === "apply" && !options.continueOnError && worked.some(item => "error" in item);
        const results: Array<UpdatedDocument> = [];
        const errors: Array<ResultError> = [];
        const reports: Array<() => void> = [];
        const status = (line: string): void => {
          if (!options.quiet) stderr.write(line + "\n");
        };

        for (const item of worked) {
          const { document } = item;
          // With several documents, each line says which one it is about.
          const at = (text: string): string => several ? `${document.label}: ${text}` : text;

          if ("error" in item) {
            errors.push(...inDocument(document, errorsFrom(item.error)));
            reports.push(() => writeLines(stderr, errorLines(item.error).map(line => `Error: ${at(line)}`)));
            continue;
          }

          // Worked out, but not written and so not reported: another document failed.
          if (abandoned) {
            continue;
          }

          const { source, outcome } = item;
          const { blocks } = outcome;
          const changed = blocks.filter(block => block.changed);
          const progress = (): void => writeLines(stderr, formatUpdate(outcome, options).map(at));

          errors.push(...inDocument(document, outcome.errors));

          if (mode === "apply") {
            // A block whose file= or region= broke a mapping rule leaves the whole document
            // unwritten, even with --continue-on-error; only a failed transform lets the rest land.
            const refused = outcome.errors.some(error => error.code !== "transform_failed");
            // An unchanged file is left untouched, so its modification time says nothing changed.
            const written = changed.length > 0 && !refused ? document.label : null;

            if (written !== null) {
              await writeFile(document.file!, outcome.source, "utf-8");
            }

            results.push({ document: document.label, blocks, written });
            reports.push(() => {
              progress();

              if (refused) {
                // Reported even under --quiet, so a refusal is never silent.
                stderr.write(styleText("yellow", at("Not written: a block's file= or region= failed. Run mdcode validate to list every problem.")) + "\n");
                return;
              }

              status(written === null
                ? styleText("yellow", at("No blocks were updated."))
                : styleText([ "bold", "green" ], `\nUpdated ${changed.length} block(s) in ${written}.`));
            });
          }
          else if (mode === "diff") {
            const label = document.label ?? "stdin";
            const diff = changed.length === 0
              ? ""
              : createTwoFilesPatch(label, label, source, outcome.source, undefined, undefined, { headerOptions: FILE_HEADERS_ONLY });

            results.push({ document: document.label, blocks, diff });
            reports.push(() => {
              progress();
              stdout.write(diff);

              if (changed.length === 0) {
                status(styleText("yellow", at("No blocks would change.")));
              }
            });
          }
          else if (mode === "check") {
            // A block whose read or transform failed has an unknown state, reported by
            // that failure; only blocks that were fully worked out can be out of sync.
            const drifted = changed.filter(block => !outcome.errors.some(error => error.line === block.line));
            const drift: Array<ResultError> = drifted.map(block => ({
              code: "out_of_sync",
              message: block.read ? `out of sync with ${block.read.file}` : "out of sync with the transform",
              line: block.line,
              ...(block.name === null ? {} : { name: block.name }),
              ...(block.read ? { path: block.read.file } : {}),
            }));

            results.push({ document: document.label, blocks });
            errors.push(...inDocument(document, drift));
            reports.push(() => {
              progress();

              // Reported even under --quiet, so a failing check always says why.
              writeLines(stderr, drifted.map(block => styleText("red", at(`✗ Out of sync: ${describeChange(block)}`))));

              if (drifted.length > 0) {
                stderr.write(styleText("yellow", at(`${drifted.length} of ${blocks.length} block(s) out of sync. Run with --diff to review the changes, or --apply to write them.`)) + "\n");
              }
              else if (outcome.errors.length === 0) {
                status(styleText("green", at(`✓ ${blocks.length} block(s) in sync.`)));
              }
            });
          }
          else if (mode === "stdout") {
            results.push({ document: document.label, blocks, source: outcome.source });
            reports.push(() => {
              progress();
              status(changed.length === 0
                ? styleText("yellow", "No blocks were updated.")
                : styleText([ "bold", "green" ], `\nUpdated ${changed.length} block(s).`));
              stdout.write(outcome.source);
            });
          }
          else {
            results.push({ document: document.label, blocks });
            reports.push(() => {
              progress();

              if (changed.length === 0) {
                stdout.write(at("No blocks would change.") + "\n");
                return;
              }

              writeLines(stdout, [
                `Would update ${changed.length} block(s)${document.label === null ? "" : ` in ${document.label}`}:`,
                ...changed.map(block => `  ${describeChange(block)}`),
                // With several documents, the hint follows them all, once.
                ...several
                  ? []
                  : [ document.file === undefined
                    ? "Run with --stdout to print the updated markdown, or --diff to review the changes."
                    : "Run with --apply to write the changes, or --diff to review them." ],
              ]);
            });
          }
        }

        if (mode === "plan" && several && results.some(result => result.blocks.some(block => block.changed))) {
          reports.push(() => stdout.write("Run with --apply to write the changes, or --diff to review them.\n"));
        }

        if (abandoned) {
          reports.push(() => stderr.write(styleText("yellow", "Nothing was written. Fix the failing document, or pass --continue-on-error to write the others.") + "\n"));
        }

        return {
          // null when no document got as far as a result, as for any failure before work.
          result: results.length === 0 ? null : { documents: results },
          errors,
          human: () => {
            for (const report of reports) {
              report();
            }
          },
        };
      });
    });

  // Validate command
  program
    .command("validate")
    .description("Check that code blocks map safely onto files for update or extract, without writing anything")
    .argument("[files...]", DOCUMENTS_HELP)
    .addOption(new Option("--for <command>", "The command to check the documents for")
      .choices(VALIDATE_OPERATIONS)
      .default("update"))
    .option("-l, --lang <lang>", "Filter by language")
    .option("-f, --file <file>", "Filter by file metadata")
    .option("-m, --meta <key=value>", META_FLAG_HELP, collect)
    .option("-n, --name <name>", NAME_FLAG_HELP, collect)
    .option("--strict", "Require file= metadata on every selected block")
    .option("--base <dir>", "With --for update: directory file= paths resolve against and must stay inside, as for update")
    .option("-d, --dir <dir>", "With --for extract: directory file= targets resolve against and must stay inside, as for extract")
    .option("--ignore-anonymous", "With --for extract: skip blocks without file metadata, as extract does")
    .option("--project", PROJECT_HELP)
    .option("--config <path>", CONFIG_HELP)
    .option("--json", "Print one versioned JSON result instead of text")
    .action(async (files: Array<string>, options: ValidateCliOptions) => {
      await perform("validate", options.json, async () => {
        const operation = options.for;
        const misplaced = operation === "update"
          ? [ options.dir === undefined ? "" : "--dir", options.ignoreAnonymous ? "--ignore-anonymous" : "" ]
          : [ options.base === undefined ? "" : "--base" ];

        if (misplaced.some(flag => flag !== "")) {
          throw new CommandError("invalid_usage", `${misplaced.filter(flag => flag !== "").join(" and ")} cannot be used with --for ${operation}`);
        }

        const config = await loadProject(options);
        const documents = selectDocuments(files, config);
        const filter = mergeFilters(config?.filter, parseFilterOptions(options));
        // Every document is checked, so one run reports every problem.
        const { results, errors, lines } = await validateDocuments(documents, operation, {
          filter,
          base: document => operation === "extract" ? extractDir(options.dir, config) : updateBase(options.base, config, document),
          strict: options.strict,
          ignoreAnonymous: options.ignoreAnonymous,
        });

        const checkedBlocks = results.reduce((count, result) => count + result.blocks.length, 0);

        return {
          // null when no document got as far as a result, as for any failure before work.
          result: results.length === 0 ? null : { operation, documents: results },
          errors,
          human: () => {
            writeLines(stderr, lines);
            stderr.write(errors.length === 0
              ? styleText("green", `✓ ${checkedBlocks} block(s) ready for ${operation}.`) + "\n"
              : styleText("yellow", `${errors.length} problem(s) found; ${operation} would refuse them.`) + "\n");
          },
        };
      });
    });

  // Watch command
  program
    .command("watch")
    .description("Watch markdown and the files its blocks read, and report drift after each change. Only --apply writes")
    .argument("[files...]", "Markdown files to watch (default: the configuration's documents with --project or --config)")
    .option("-l, --lang <lang>", "Filter by language")
    .option("-f, --file <file>", "Filter by file metadata")
    .option("-m, --meta <key=value>", META_FLAG_HELP, collect)
    .option("-n, --name <name>", NAME_FLAG_HELP, collect)
    .option("--base <dir>", "Directory file= paths resolve against and must stay inside, as for update")
    .option("--apply", "Write drifted blocks into the markdown after each change, as update --apply does")
    .option("--debounce <ms>", "Wait this long after the last change before checking", "100")
    .option("--project", PROJECT_HELP)
    .option("--config <path>", CONFIG_HELP)
    .action(async (files: Array<string>, options: FilterCliOptions & ProjectCliOptions & { base?: string; apply?: boolean; debounce: string; }) => {
      await perform("watch", false, async () => {
        const debounceMs = Number(options.debounce);

        if (!Number.isInteger(debounceMs) || debounceMs < 0) {
          throw new CommandError("invalid_usage", `--debounce takes a whole number of milliseconds, not ${JSON.stringify(options.debounce)}`);
        }

        if (files.length === 0 && options.project === undefined && options.config === undefined) {
          throw new CommandError("invalid_usage", "watch needs Markdown files to watch, or --project or --config to read them from mdcode.config.json");
        }

        const flags = parseFilterOptions(options);
        // Read again before every pass, so editing the configuration takes effect without a restart.
        const resolveTarget = async (): Promise<WatchTarget> => {
          const config = await loadProject(options);
          const documents = selectDocuments(files, config);

          return {
            documents: documents.map(document => ({ file: resolve(document.file!), label: document.label!, basePath: updateBase(options.base, config, document) })),
            filter: mergeFilters(config?.filter, flags),
            extra: config === undefined ? [] : [ config.path ],
          };
        };

        const time = (): string => styleText("gray", `[${new Date().toTimeString()
          .slice(0, 8)}]`);
        const report = (event: WatchEvent): void => writeLines(stdout, formatWatch(event, options.apply === true).map(line => `${time()} ${line}`));
        const handle = await watch({ resolve: resolveTarget, apply: options.apply, debounceMs, onEvent: report });

        // Runs until interrupted; Ctrl+C is the normal way to stop, so it exits 0.
        await new Promise<void>(resolve => {
          process.once("SIGINT", resolve);
          process.once("SIGTERM", resolve);
        });
        await handle.close();
        stdout.write(`${time()} Stopped watching.\n`);

        return { result: null, errors: [], human: () => {} };
      });
    });

  // Dump command
  program
    .command("dump")
    .description("Create a tar archive of code blocks")
    .argument("[file]", "Markdown file to read (default: stdin)")
    .option("-l, --lang <lang>", "Filter by language")
    .option("-f, --file <file>", "Filter by file metadata")
    .option("-m, --meta <key=value>", META_FLAG_HELP, collect)
    .option("-n, --name <name>", NAME_FLAG_HELP, collect)
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

    exitCode = error.exitCode;
  }

  return exitCode;
}
