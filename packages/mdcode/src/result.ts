/**
 * The machine-readable contract shared by every command: with `--json`, a
 * command prints exactly one `Envelope` on stdout and nothing else.
 */
import { MetadataError } from "./metadata.ts";
import type { Block } from "./types.ts";

/** Bumped only when the JSON contract changes incompatibly. */
export const CONTRACT_VERSION = 1;

export type CommandName = "list" | "extract" | "update" | "run" | "dump";

export type ErrorCode =
  /** A block's info string breaks the metadata grammar, or two blocks share a name. */
  | "invalid_metadata"
  /** Bad flags or flag combinations. */
  | "invalid_usage"
  /** Reading the markdown or writing an output failed. */
  | "io_error"
  /** The `--transform` module could not be loaded or has no default function export. */
  | "invalid_transform"
  /** extract left a target file untouched. */
  | "extract_skipped"
  /** update could not read a block's file= or region. */
  | "read_failed"
  /** update's transformer threw for a block. */
  | "transform_failed"
  /** run's command exited non-zero for a block. */
  | "command_failed"
  /** Anything else. */
  | "unexpected_error";

export interface ResultError {
  code: ErrorCode;
  message: string;
  /** 1-based line of the opening fence of the block concerned. */
  line?: number;
  /** Name of the block concerned, when it has one. */
  name?: string;
  /** File concerned: an extract target, a file= source, the transform module, an output path. */
  path?: string;
}

export interface Envelope<R> {
  version: typeof CONTRACT_VERSION;
  command: CommandName;
  ok: boolean;
  /** Command-specific data; null when the command failed before doing any work. */
  result: R | null;
  errors: Array<ResultError>;
}

/**
 * How a result refers to a block. `name` is the block's stable identifier and
 * is null for unnamed blocks; `line` locates the block in this version of the
 * document only.
 */
export interface BlockRef {
  name: string | null;
  /** 1-based line of the opening fence. */
  line: number;
}

/** Point at a block parsed from markdown, for results and errors. */
export function blockRef(block: Block): BlockRef {
  return { name: block.name ?? null, line: block.position?.line ?? 0 };
}

/** Attach a block reference to an error, leaving out a null name. */
export function blockError(block: Block, error: Omit<ResultError, "line" | "name">): ResultError {
  const { name, line } = blockRef(block);
  return { ...error, line, ...(name === null ? {} : { name }) };
}

/** An error that maps onto one contract error code. */
export class CommandError extends Error {
  readonly code: ErrorCode;
  readonly path: string | undefined;

  constructor(code: ErrorCode, message: string, path?: string) {
    super(message);
    this.name = "CommandError";
    this.code = code;
    this.path = path;
  }
}

/** Translate a thrown value into contract errors. */
export function errorsFrom(error: unknown): Array<ResultError> {
  if (error instanceof MetadataError) {
    return error.problems.map(({ line, message }) => ({ code: "invalid_metadata", message, line }));
  }

  if (error instanceof CommandError) {
    return [{ code: error.code, message: error.message, ...(error.path === undefined ? {} : { path: error.path }) }];
  }

  if (error instanceof Error) {
    const { code, path } = error as NodeJS.ErrnoException;
    const io = typeof code === "string" && code.startsWith("E");
    return [{ code: io ? "io_error" : "unexpected_error", message: error.message, ...(path === undefined ? {} : { path }) }];
  }

  return [{ code: "unexpected_error", message: String(error) }];
}
