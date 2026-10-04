/* eslint-disable @typescript-eslint/no-floating-promises */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";

import { escapesArchiveRoot, resolveContained, UnsafePathError } from "./paths.ts";

const dirs: Array<string> = [];

after(async () => {
  await Promise.all(dirs.map(async dir => rm(dir, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "mdcode-paths-"));
  dirs.push(dir);
  return dir;
}

describe("resolveContained", () => {
  test("accepts names that merely start with dots, and paths that do not exist yet", async () => {
    const base = await tempDir();

    assert.equal(await resolveContained("..config/a.ts", base), join(base, "..config/a.ts"));
    assert.equal(await resolveContained("new/dir/a.ts", base), join(base, "new/dir/a.ts"));
  });

  test("accepts a base that does not exist yet, as long as the path stays inside it", async () => {
    const base = join(await tempDir(), "not/yet");

    assert.equal(await resolveContained("a.ts", base), join(base, "a.ts"));
    await assert.rejects(resolveContained("../a.ts", base), UnsafePathError);
  });

  test("refuses a sibling directory whose name extends the base's", async () => {
    const root = await tempDir();
    await mkdir(join(root, "docs"));
    await mkdir(join(root, "docs-private"));

    await assert.rejects(resolveContained("../docs-private/a.ts", join(root, "docs")), UnsafePathError);
  });

  test("accepts a base reached through a symlink", async () => {
    const root = await tempDir();
    await mkdir(join(root, "real"));
    await symlink(join(root, "real"), join(root, "alias"));

    assert.equal(await resolveContained("a.ts", join(root, "alias")), join(root, "alias/a.ts"));
  });

  test("refuses a dangling symlink, or one inside a missing chain, that points outside", async () => {
    const base = await tempDir();
    await symlink(join(base, "../nowhere/a.ts"), join(base, "dangling.ts"));
    await symlink(join(base, "../nowhere"), join(base, "dangling-dir"));

    await assert.rejects(resolveContained("dangling.ts", base), UnsafePathError);
    await assert.rejects(resolveContained("dangling-dir/new/a.ts", base), UnsafePathError);
  });

  test("accepts a dangling symlink that points inside", async () => {
    const base = await tempDir();
    await symlink("later.ts", join(base, "soon.ts"));

    assert.equal(await resolveContained("soon.ts", base), join(base, "soon.ts"));
  });
});

describe("escapesArchiveRoot", () => {
  for (const name of [ "/etc/passwd", "C:\\x", "\\\\server\\share", "../x", "a/../../x", "a\\..\\..\\x" ]) {
    test(`refuses ${name}`, () => {
      assert.equal(escapesArchiveRoot(name), true);
    });
  }

  for (const name of [ "a.ts", "./a.ts", "a/../b.ts", "..a/b.ts", "a/b/../../c" ]) {
    test(`accepts ${name}`, () => {
      assert.equal(escapesArchiveRoot(name), false);
    });
  }
});
