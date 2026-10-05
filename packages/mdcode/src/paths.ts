/**
 * Guarded resolution for paths taken from block metadata. Markdown may come
 * from someone the caller does not trust, so a `file=` must never reach outside
 * the directory the caller chose: not by being absolute, not through `..`, and
 * not through a symlink.
 */
import { readlink, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, posix, relative, resolve, sep, win32 } from "node:path";

/** A metadata path that would leave its allowed base. */
export class UnsafePathError extends Error {
  /** The path as written in the metadata. */
  readonly path: string;

  constructor(path: string, message: string) {
    super(message);
    this.name = "UnsafePathError";
    this.path = path;
  }
}

/**
 * Resolve a metadata path against `base` and confirm it stays inside it, after
 * following every symlink that already exists along the way. The target itself
 * need not exist yet.
 * @throws {UnsafePathError} when the path is empty, absolute or leads outside `base`
 */
export async function resolveContained(path: string, base: string): Promise<string> {
  if (path === "") {
    throw new UnsafePathError(path, `an empty path names ${resolve(base)} itself; name a file inside it`);
  }

  if (isAbsolute(path) || win32.isAbsolute(path)) {
    throw new UnsafePathError(path, `absolute path ${path} is refused; write it relative to ${resolve(base)}`);
  }

  const root = resolve(base);
  const target = resolve(root, path);

  if (!isInside(target, root)) {
    throw new UnsafePathError(path, `${path} resolves to ${target}, outside the allowed base ${root}`);
  }

  const realRoot = await canonicalPath(root);
  const realTarget = await canonicalPath(target);

  if (!isInside(realTarget, realRoot)) {
    throw new UnsafePathError(path, `${path} leads through a symlink to ${realTarget}, outside the allowed base ${root}`);
  }

  return target;
}

/**
 * Whether an archive entry name would land outside the directory it is
 * unpacked into: absolute, or climbing above it with `..`. Both separators are
 * checked, because some extractors honour backslashes.
 */
export function escapesArchiveRoot(name: string): boolean {
  if (posix.isAbsolute(name) || win32.isAbsolute(name)) {
    return true;
  }

  let depth = 0;

  for (const part of name.split(/[\\/]+/)) {
    if (part === "..") {
      depth--;
      if (depth < 0) return true;
    }
    else if (part !== "" && part !== ".") {
      depth++;
    }
  }

  return false;
}

/**
 * The realpath of a path's nearest existing ancestor, the path itself
 * included, plus whatever does not exist yet. Aliased spellings of one location
 * collapse to the same result without the location having to exist. A dangling
 * symlink is followed to where its target would be, since writing through it
 * would create the file there.
 */
export async function canonicalPath(path: string): Promise<string> {
  let pending = resolve(path);
  let existing = pending;
  let hops = 0;

  for (;;) {
    try {
      return join(await realpath(existing), pending.slice(existing.length));
    }
    catch (error: unknown) {
      if (!isMissing(error)) {
        throw error;
      }

      const link = await readlink(existing).catch(() => undefined);

      if (link !== undefined) {
        if (++hops > 40) {
          throw new Error(`too many symbolic links resolving ${path}`);
        }
        pending = join(resolve(dirname(existing), link), pending.slice(existing.length));
        existing = pending;
        continue;
      }

      const parent = dirname(existing);
      if (parent === existing) {
        return pending;
      }
      existing = parent;
    }
  }
}

function isInside(path: string, root: string): boolean {
  const rel = relative(root, path);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/** Whether a filesystem error means the path, or one of its parents, does not exist. */
export function isMissing(error: unknown): boolean {
  return error !== null && typeof error === "object" && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR");
}
