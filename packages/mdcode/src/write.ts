import { chmod, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

/**
 * Write via a sibling temp file and rename, so an interrupted or out-of-space
 * write cannot leave a file truncated, and a reader, such as a file watcher,
 * never sees it half-written. rename() drops the destination's permissions,
 * so pass `mode` to keep them.
 *
 * Tradeoff: rename() replaces the file rather than rewriting it, so the target
 * gets a new inode. Hard links to the old file keep the old contents, and
 * extended attributes and ACLs are not carried over. Both are accepted because
 * the alternative — truncate and rewrite in place — can leave a source file
 * half-written, which is worse. It also means a symlinked target would be
 * replaced rather than followed, which is why extract's splice path refuses
 * symlinks outright instead of relying on this.
 */
export async function writeAtomic(target: string, content: string, mode?: number): Promise<void> {
  const temp = join(dirname(target), `.${basename(target)}.mdcode-${process.pid}`);

  await writeFile(temp, content, "utf-8");

  if (mode !== undefined) {
    await chmod(temp, mode & 0o7777);
  }

  await rename(temp, target);
}
