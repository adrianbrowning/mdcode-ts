/**
 * Watch documents and the files their blocks read, and report drift after each
 * burst of changes. Without apply nothing is written; with it, a document is
 * written only when every block's file= and region= could be read, as for
 * `update --apply --continue-on-error`.
 */
import type { FSWatcher } from "node:fs";
import { watch as fsWatch } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, sep } from "node:path";
import { styleText } from "node:util";

import { parse } from "../parser.ts";
import { isMissing, resolveContained } from "../paths.ts";
import type { ResultError } from "../result.ts";
import { describeError, errorsFrom } from "../result.ts";
import type { FilterOptions } from "../types.ts";
import type { UpdatedBlock } from "./update.ts";
import { describeChange, update } from "./update.ts";

/** One Markdown document to keep in sync. */
export interface WatchDocument {
  /** Path to read and, with apply, write. */
  file: string;
  /** How results name the document. */
  label: string;
  /** Directory its file= paths resolve against and must stay inside. */
  basePath: string;
}

/** What to watch, worked out again before every pass so a configuration change takes effect. */
export interface WatchTarget {
  documents: Array<WatchDocument>;
  filter?: FilterOptions;
  /** Further files whose change starts a pass, such as the configuration file. */
  extra?: Array<string>;
}

/** What one pass found for one document. */
export interface WatchedDocument {
  document: string;
  /** Blocks whose code differs from what their file= or transform gives. */
  changed: Array<UpdatedBlock>;
  errors: Array<ResultError>;
  /** With apply: whether the document was rewritten in this pass. */
  written: boolean;
}

export type WatchEvent =
  /** Files are watched; the first pass's report follows. */
  | { type: "ready"; documents: number; sources: number; }
  /** A pass finished. `documents` lists every document, in order. */
  | { type: "pass"; documents: Array<WatchedDocument>; }
  /** The target could not be worked out, or the watcher failed; the previous files stay watched. */
  | { type: "error"; errors: Array<ResultError>; };

/**
 * Start watching `paths` and call `onChange` with the path of whatever changed.
 * The default uses fs.watch on each path's directory; tests supply their own.
 */
export type WatchFiles = (
  paths: ReadonlySet<string>,
  onChange: (path: string) => void,
  onError: (error: unknown) => void
) => { close: () => void; };

export interface WatchOptions {
  /** Called before every pass. A rejection on the first call rejects watch(). */
  resolve: () => Promise<WatchTarget>;
  /** Write documents whose blocks drifted. Default false. */
  apply?: boolean;
  /** Quiet time after the last change before a pass starts, in milliseconds. Default 100. */
  debounceMs?: number;
  onEvent: (event: WatchEvent) => void;
  watchFiles?: WatchFiles;
}

export interface WatchHandle {
  /** Stop watching and wait for a running pass to finish. */
  close: () => Promise<void>;
}

/**
 * Run one pass, then another after each burst of changes, until closed.
 * @throws whatever the first resolve() throws, before anything is watched
 */
export async function watch(options: WatchOptions): Promise<WatchHandle> {
  const { resolve, apply = false, debounceMs = 100, onEvent, watchFiles = watchDirectories } = options;
  // What apply wrote, so the change events of its own writes do not start another pass.
  const ownWrites = new Map<string, string>();
  let watched = new Set<string>();
  let watcher: { close: () => void; } | undefined;
  let timer: NodeJS.Timeout | undefined;
  let running: Promise<void> | undefined;
  let again = false;
  let closed = false;

  const fail = (error: unknown): void => onEvent({ type: "error", errors: errorsFrom(error) });

  const changed = (path: string): void => {
    isOwnWrite(path, ownWrites)
      .then(own => {
        if (!own) schedule();
        return undefined;
      })
      .catch(fail);
  };

  const schedule = (): void => {
    if (closed) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (running) {
        again = true;
        return;
      }
      running = runPass().finally(() => {
        running = undefined;
        if (again) {
          again = false;
          schedule();
        }
      });
    }, debounceMs);
  };

  const rewatch = (paths: Set<string>): void => {
    if (closed || sameSet(paths, watched)) return;
    watcher?.close();
    watched = paths;
    watcher = watchFiles(paths, changed, fail);
  };

  // Every failure is reported and the watch carries on; a later change starts the next pass.
  const runPass = async (): Promise<void> => {
    try {
      const target = await resolve();
      const { documents, sources } = await reconcile(target, apply, ownWrites);

      rewatch(new Set([ ...target.documents.map(document => document.file), ...sources, ...target.extra ?? [] ]));
      onEvent({ type: "pass", documents });
    }
    catch (error: unknown) {
      fail(error);
    }
  };

  const first = await resolve();
  const { documents, sources } = await reconcile(first, apply, ownWrites);

  rewatch(new Set([ ...first.documents.map(document => document.file), ...sources, ...first.extra ?? [] ]));
  onEvent({ type: "ready", documents: first.documents.length, sources: sources.size });
  onEvent({ type: "pass", documents });

  return {
    close: async () => {
      closed = true;
      clearTimeout(timer);
      watcher?.close();
      await running;
    },
  };
}

/**
 * Text lines for one watch event, as `mdcode watch` prints them. A pass names
 * only the documents that drifted, failed or were written; when none did, it
 * says everything is in sync.
 */
export function formatWatch(event: WatchEvent, apply: boolean): Array<string> {
  if (event.type === "ready") {
    return [ `Watching ${event.documents} document(s) and ${event.sources} source file(s)${apply ? ", writing changes" : ""}. Press Ctrl+C to stop.` ];
  }

  if (event.type === "error") {
    return event.errors.map(error => styleText("red", `Error: ${describeError(error)}; still watching`));
  }

  const lines: Array<string> = [];

  for (const { document, changed, errors, written } of event.documents) {
    for (const error of errors) {
      lines.push(styleText("red", `${document}: ✗ ${describeError(error)} (${error.code})`));
    }

    if (written) {
      lines.push(styleText("green", `${document}: ✓ Updated ${changed.length} block(s)`));
      continue;
    }

    for (const block of changed) {
      lines.push(styleText("yellow", `${document}: ✗ Out of sync: ${describeChange(block)}`));
    }

    if (apply && changed.length > 0) {
      lines.push(styleText("yellow", `${document}: not written, because a block's file= or region= failed`));
    }
  }

  if (lines.length === 0) {
    lines.push(styleText("green", `✓ ${event.documents.length} document(s) in sync`));
  }

  return lines;
}

/** Work out every document's drift, write it with apply, and collect the files its blocks read. */
async function reconcile(target: WatchTarget, apply: boolean, ownWrites: Map<string, string>): Promise<{ documents: Array<WatchedDocument>; sources: Set<string>; }> {
  const documents: Array<WatchedDocument> = [];
  const sources = new Set<string>();

  for (const document of target.documents) {
    const result: WatchedDocument = { document: document.label, changed: [], errors: [], written: false };
    documents.push(result);

    let source: string;

    try {
      source = await readFile(document.file, "utf-8");
      // Watched even when a read fails, so fixing the file starts a pass.
      for (const path of await sourcesOf(source, target.filter, document.basePath)) sources.add(path);

      const outcome = await update({ source, filter: target.filter, basePath: document.basePath, continueOnError: true });

      result.changed = outcome.blocks.filter(block => block.changed);
      result.errors = outcome.errors;

      // As update --apply --continue-on-error: a failed file= or region= leaves the document alone.
      if (apply && result.changed.length > 0 && !outcome.errors.some(error => error.code !== "transform_failed")) {
        ownWrites.set(document.file, outcome.source);
        await writeFile(document.file, outcome.source, "utf-8");
        result.written = true;
      }
    }
    catch (error: unknown) {
      result.errors = errorsFrom(error);
    }
  }

  return { documents, sources };
}

/** The absolute paths of the files a document's selected blocks read; unsafe ones are left out. */
async function sourcesOf(source: string, filter: FilterOptions | undefined, basePath: string): Promise<Array<string>> {
  const paths: Array<string> = [];

  for (const block of parse({ source, filter })) {
    if (block.meta.file === undefined) continue;

    try {
      paths.push(await resolveContained(block.meta.file, basePath));
    }
    catch {
      // update reports it; a path that leaves the base is not watched either.
    }
  }

  return paths;
}

/** Whether `path` still holds exactly what apply last wrote to it. */
async function isOwnWrite(path: string, ownWrites: Map<string, string>): Promise<boolean> {
  const written = ownWrites.get(path);

  if (written === undefined) return false;

  const current = await readFile(path, "utf-8").catch(() => undefined);

  if (current === written) return true;

  ownWrites.delete(path);
  return false;
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [ ...a ].every(item => b.has(item));
}

/**
 * Watch each path through its directory, which survives editors that save by
 * replacing the file. A path whose directory does not exist yet is watched
 * through its nearest existing ancestor, so creating it starts a pass.
 */
const watchDirectories: WatchFiles = (paths, onChange, onError) => {
  const byDirectory = new Map<string, Array<string>>();
  const watchers: Array<FSWatcher> = [];
  let closed = false;

  const start = async (): Promise<void> => {
    for (const path of paths) {
      const directory = await existingAncestor(dirname(path));
      byDirectory.set(directory, [ ...byDirectory.get(directory) ?? [], path ]);
    }

    for (const [ directory, inside ] of byDirectory) {
      if (closed) return;

      const watcher = fsWatch(directory, (_event, name) => {
        // Some platforms omit the name; then anything in the directory may have changed.
        const changedPath = name === null ? undefined : join(directory, name.toString());
        const hit = changedPath === undefined
          ? inside[0]
          : inside.find(path => path === changedPath || path.startsWith(changedPath + sep));

        if (hit !== undefined) onChange(hit);
      });

      watcher.on("error", onError);
      watchers.push(watcher);
    }
  };

  start().catch(onError);

  return {
    close: () => {
      closed = true;
      for (const watcher of watchers) watcher.close();
    },
  };
};

async function existingAncestor(directory: string): Promise<string> {
  for (let current = directory; ; current = dirname(current)) {
    try {
      if ((await stat(current)).isDirectory()) return current;
    }
    catch (error: unknown) {
      if (!isMissing(error)) throw error;
    }

    if (dirname(current) === current) return current;
  }
}
