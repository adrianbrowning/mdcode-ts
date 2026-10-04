/**
 * The project configuration, mdcode.config.json: which Markdown documents a
 * repository keeps in sync, the roots their paths resolve against, and default
 * block filters. It is plain JSON and never executed.
 */
import { readFile, glob, stat } from "node:fs/promises";
import { dirname, isAbsolute, resolve, win32 } from "node:path";

import { isRecord } from "./guards.ts";
import { resolveContained, UnsafePathError } from "./paths.ts";
import { CommandError } from "./result.ts";
import type { FilterOptions } from "./types.ts";

/** The file `--project` looks for in the current directory. */
export const CONFIG_FILE = "mdcode.config.json";

/** A loaded configuration. Every path in it is absolute. */
export interface ProjectConfig {
  /** The configuration file. */
  path: string;
  /** The Markdown documents its `documents` entries matched, in entry order, without duplicates. */
  documents: Array<string>;
  /** Where update resolves `file=` paths. */
  sourceRoot?: string;
  /** Where extract writes `file=` paths. */
  outputRoot?: string;
  /** Default block filters; `name` is never set, because block names are per document. */
  filter?: FilterOptions;
}

const FIELDS = [ "documents", "sourceRoot", "outputRoot", "filter" ];
const FILTER_FIELDS = [ "lang", "file", "meta" ];

/**
 * Read, validate and resolve a configuration file. Paths in it are relative to
 * its own directory and must stay inside it.
 * @throws {CommandError} invalid_config for a missing, malformed or invalid file; unsafe_path for a path that leaves its directory
 */
export async function loadConfig(path: string): Promise<ProjectConfig> {
  const configPath = resolve(path);
  const dir = dirname(configPath);
  const invalid = (message: string): CommandError => new CommandError("invalid_config", `${path}: ${message}`, path);

  let text: string;

  try {
    text = await readFile(configPath, "utf-8");
  }
  catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException).code;
    throw invalid(code === "ENOENT" ? `not found at ${configPath}; create it, or point --config at another file` : (error as Error).message);
  }

  let raw: unknown;

  try {
    raw = JSON.parse(text);
  }
  catch (error: unknown) {
    throw invalid(`not valid JSON: ${(error as Error).message}`);
  }

  if (!isRecord(raw)) {
    throw invalid(`must be a JSON object with any of ${FIELDS.join(", ")}`);
  }

  checkFields(raw, FIELDS, "", invalid);

  const config: ProjectConfig = { path: configPath, documents: [] };

  if (raw.documents !== undefined) {
    if (!Array.isArray(raw.documents) || raw.documents.length === 0 || !raw.documents.every(isNonEmptyString)) {
      throw invalid("documents must be a non-empty array of Markdown paths or globs, e.g. [\"README.md\", \"docs/**/*.md\"]");
    }

    config.documents = await expandDocuments(raw.documents, dir, path, invalid);
  }

  for (const field of [ "sourceRoot", "outputRoot" ] as const) {
    const value = raw[field];

    if (value === undefined) {
      continue;
    }

    if (!isNonEmptyString(value)) {
      throw invalid(`${field} must be a directory path relative to ${dir}`);
    }

    config[field] = await contained(value, dir, path, field);
  }

  if (raw.filter !== undefined) {
    config.filter = parseFilter(raw.filter, invalid);
  }

  return config;
}

/** Expand document entries, each of which must match at least one file inside dir. */
async function expandDocuments(
  entries: Array<string>,
  dir: string,
  path: string,
  invalid: (message: string) => CommandError,
): Promise<Array<string>> {
  const documents = new Set<string>();

  for (const [ index, entry ] of entries.entries()) {
    const field = `documents[${index}]`;

    // Checked before matching: a glob can name files outside dir without any one path being written out.
    if (isAbsolute(entry) || win32.isAbsolute(entry) || entry.split(/[\\/]/).includes("..")) {
      throw new CommandError("unsafe_path", `${path}: ${field} ${JSON.stringify(entry)} must stay inside ${dir}; write it relative to the configuration file, without ..`, path);
    }

    const matches: Array<string> = [];

    for await (const match of glob(entry, { cwd: dir })) {
      const absolute = await contained(match, dir, path, field);

      if ((await stat(absolute)).isFile()) {
        matches.push(absolute);
      }
    }

    if (matches.length === 0) {
      throw invalid(`${field} ${JSON.stringify(entry)} matched no files in ${dir}`);
    }

    // Sorted, so the order does not depend on the file system.
    for (const match of matches.sort()) {
      documents.add(match);
    }
  }

  return [ ...documents ];
}

function parseFilter(value: unknown, invalid: (message: string) => CommandError): FilterOptions {
  if (!isRecord(value)) {
    throw invalid(`filter must be an object with any of ${FILTER_FIELDS.join(", ")}`);
  }

  if ("name" in value) {
    throw invalid("filter.name is not supported: block names belong to one document; pass --name on the command line");
  }

  checkFields(value, FILTER_FIELDS, "filter.", invalid);

  const filter: FilterOptions = {};

  for (const field of [ "lang", "file" ] as const) {
    const fieldValue = value[field];

    if (fieldValue === undefined) {
      continue;
    }

    if (!isNonEmptyString(fieldValue)) {
      throw invalid(`filter.${field} must be a non-empty string`);
    }

    filter[field] = fieldValue;
  }

  if (value.meta !== undefined) {
    if (!isRecord(value.meta) || !Object.values(value.meta).every(isNonEmptyString)) {
      throw invalid("filter.meta must be an object of metadata keys to string values, e.g. {\"runnable\": \"true\"}");
    }

    filter.meta = { ...value.meta as Record<string, string> };
  }

  return filter;
}

/** Resolve a configuration path inside dir, reporting a path that leaves it as unsafe_path. */
async function contained(value: string, dir: string, path: string, field: string): Promise<string> {
  try {
    return await resolveContained(value, dir);
  }
  catch (error: unknown) {
    if (error instanceof UnsafePathError) {
      throw new CommandError("unsafe_path", `${path}: ${field}: ${error.message}`, path);
    }
    throw error;
  }
}

function checkFields(
  value: Record<string, unknown>,
  allowed: Array<string>,
  prefix: string,
  invalid: (message: string) => CommandError,
): void {
  const unknown = Object.keys(value).filter(key => !allowed.includes(key));

  if (unknown.length > 0) {
    throw invalid(`unknown field ${unknown.map(key => JSON.stringify(prefix + key)).join(", ")}; expected ${allowed.map(key => prefix + key).join(", ")}`);
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
