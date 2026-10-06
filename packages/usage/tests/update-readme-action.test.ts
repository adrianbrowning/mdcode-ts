/* eslint-disable @typescript-eslint/no-floating-promises */
/**
 * The update-readme GitHub Action's script (.github/actions/update-readme),
 * run the way action.yml runs it, against a local bare repository standing in
 * for GitHub and a stand-in `gh` that records its calls.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { delimiter, dirname, join } from "node:path";
import { after, describe, it } from "node:test";

import { cleanupTempDir, CLI_PATH, createTempDir } from "./test-utils.ts";

const SCRIPT = join(import.meta.dirname, "..", "..", "..", ".github", "actions", "update-readme", "update-readme.mjs");
const BRANCH = "mdcode/update-docs";

const dirs: Array<string> = [];

after(async () => {
  await Promise.all(dirs.map(cleanupTempDir));
});

const fence = (info: string, code: string): string => `\`\`\`${info}\n${code}\n\`\`\`\n`;

/** A stand-in gh: records each call, and keeps open pull requests in a JSON file. */
const FAKE_GH = `#!${process.execPath}
const { appendFileSync, existsSync, readFileSync, writeFileSync } = require("node:fs");
const args = process.argv.slice(2);
const state = process.env.FAKE_GH_STATE;
const prs = existsSync(state) ? JSON.parse(readFileSync(state, "utf-8")) : [];
appendFileSync(process.env.FAKE_GH_LOG, JSON.stringify({ args, token: process.env.GH_TOKEN }) + "\\n");
const value = flag => args[args.indexOf(flag) + 1];
if (args[1] === "list") {
  console.log(JSON.stringify(prs.filter(pr => pr.head === value("--head") && pr.base === value("--base"))));
}
else if (args[1] === "create") {
  const number = prs.length + 1;
  prs.push({ number, url: "https://github.com/owner/repo/pull/" + number, head: value("--head"), base: value("--base"), title: value("--title"), body: value("--body") });
  writeFileSync(state, JSON.stringify(prs));
  console.log(prs.at(-1).url);
}
else if (args[1] === "edit") {
  Object.assign(prs.find(pr => pr.number === Number(args[2])), { title: value("--title"), body: value("--body") });
  writeFileSync(state, JSON.stringify(prs));
}
else if (args[1] === "close") {
  writeFileSync(state, JSON.stringify(prs.filter(pr => pr.number !== Number(args[2]))));
}
`;

type Repo = { dir: string; work: string; remote: string; bin: string; };

/** A bare "GitHub" repository with main holding these files, and a clone of it checked out at main. */
async function repository(files: Record<string, string>): Promise<Repo> {
  const dir = await createTempDir();
  dirs.push(dir);
  const remote = join(dir, "server", "owner", "repo.git");
  const work = join(dir, "work");
  const bin = join(dir, "bin");

  await mkdir(remote, { recursive: true });
  await mkdir(bin);
  await writeFile(join(bin, "gh"), FAKE_GH, "utf-8");
  await chmod(join(bin, "gh"), 0o755);
  execFileSync("git", [ "init", "--quiet", "--bare", "--initial-branch=main", remote ]);
  execFileSync("git", [ "clone", "--quiet", remote, work ], { stdio: "ignore" });
  await commit({ dir, work, remote, bin }, files, "initial");

  return { dir, work, remote, bin };
}

function git(repo: Repo, ...args: Array<string>): string {
  return execFileSync("git", [ "-c", "user.name=Test", "-c", "user.email=test@example.com", ...args ], { cwd: repo.work, encoding: "utf-8" }).trim();
}

/** Commit these files to main and push it, as a developer would. */
async function commit(repo: Repo, files: Record<string, string>, message: string): Promise<void> {
  for (const [ path, content ] of Object.entries(files)) {
    await mkdir(dirname(join(repo.work, path)), { recursive: true });
    await writeFile(join(repo.work, path), content, "utf-8");
  }
  git(repo, "add", "--all");
  git(repo, "commit", "--quiet", "-m", message);
  git(repo, "push", "--quiet", "origin", "HEAD:refs/heads/main");
}

/** The commit a branch of the remote points at, or "" when it does not exist. */
function remoteBranch(repo: Repo, branch: string): string {
  return execFileSync("git", [ "ls-remote", repo.remote, `refs/heads/${branch}` ], { encoding: "utf-8" }).split(/\s/)[0]!;
}

function show(repo: Repo, ref: string, path: string): string {
  return execFileSync("git", [ "--git-dir", repo.remote, "show", `${ref}:${path}` ], { encoding: "utf-8" });
}

function changedFiles(repo: Repo, from: string, to: string): Array<string> {
  return execFileSync("git", [ "--git-dir", repo.remote, "diff", "--name-only", from, to ], { encoding: "utf-8" }).trim()
    .split("\n")
    .filter(Boolean);
}

type GhCall = { args: Array<string>; token: string; };

async function ghCalls(repo: Repo): Promise<Array<GhCall>> {
  const log = await readFile(join(repo.dir, "gh.log"), "utf-8").catch(() => "");
  return log.trim().split("\n")
    .filter(Boolean)
    .map(line => JSON.parse(line) as GhCall);
}

async function openPrs(repo: Repo): Promise<Array<{ number: number; title: string; body: string; }>> {
  return JSON.parse(await readFile(join(repo.dir, "gh.json"), "utf-8").catch(() => "[]")) as Array<{ number: number; title: string; body: string; }>;
}

type ActionRun = { code: number | null; stdout: string; outputs: Record<string, string>; };

async function action(repo: Repo, inputs: Record<string, string> = {}): Promise<ActionRun> {
  const outputs = join(repo.dir, `outputs-${Date.now()}-${Math.random()}.txt`);
  const run = spawnSync(process.execPath, [ SCRIPT ], {
    cwd: repo.work,
    encoding: "utf-8",
    env: {
      PATH: [ repo.bin, dirname(process.execPath), "/usr/bin", "/bin" ].join(delimiter),
      HOME: repo.dir,
      GITHUB_SERVER_URL: `file://${join(repo.dir, "server")}`,
      GITHUB_REPOSITORY: "owner/repo",
      GITHUB_OUTPUT: outputs,
      FAKE_GH_STATE: join(repo.dir, "gh.json"),
      FAKE_GH_LOG: join(repo.dir, "gh.log"),
      DOCUMENTS: "README.md\nmy docs/*.md",
      BRANCH,
      BASE_BRANCH: "main",
      TITLE: "docs: update code blocks",
      COMMIT_MESSAGE: "docs: update code blocks",
      AUTHOR_NAME: "github-actions[bot]",
      AUTHOR_EMAIL: "bot@example.com",
      TOKEN: "test-token",
      MDCODE_COMMAND: `"${process.execPath}" "${CLI_PATH}"`,
      ...inputs,
    },
  });
  const raw = await readFile(outputs, "utf-8").catch(() => "");

  return {
    code: run.status,
    stdout: run.stdout + run.stderr,
    outputs: Object.fromEntries(raw.trim().split("\n")
      .filter(Boolean)
      .map(line => line.split(/=(.*)/s).slice(0, 2) as [ string, string ])),
  };
}

const GREET = "// #region greet\nexport const greet = (name: string): string => `Hello, ${name}!`;\n// #endregion\n";
const SYNCED = {
  "src/greet.ts": GREET,
  "my docs/hello world.ts": "export const hello = 1;\n",
  "README.md": fence("ts file=src/greet.ts region=greet name=greet", "export const greet = (name: string): string => `Hello, ${name}!`;"),
  "my docs/guide.md": fence("ts file=\"hello world.ts\" name=hello", "export const hello = 1;"),
};
const STALE = { "src/greet.ts": GREET.replace("Hello", "Hi"), "my docs/hello world.ts": "export const hello = 2;\n" };

describe("update-readme action", () => {
  it("opens a pull request holding only the Markdown, leaving sources and the caller's checkout alone", async () => {
    const repo = await repository(SYNCED);
    await commit(repo, STALE, "change the sources");
    const main = git(repo, "rev-parse", "HEAD");
    // Unrelated work in the caller's checkout must not reach the pull request.
    await writeFile(join(repo.work, "notes.txt"), "scratch\n", "utf-8");
    git(repo, "add", "notes.txt");

    const run = await action(repo);

    assert.equal(run.code, 0, run.stdout);
    const head = remoteBranch(repo, BRANCH);
    assert.deepEqual(changedFiles(repo, main, head), [ "README.md", "my docs/guide.md" ], "only the documents update wrote");
    assert.match(show(repo, head, "README.md"), /`Hi, \$\{name\}!`/);
    assert.equal(show(repo, head, "src/greet.ts"), STALE["src/greet.ts"], "the source is untouched");
    assert.equal(execFileSync("git", [ "--git-dir", repo.remote, "rev-parse", `${head}~1` ], { encoding: "utf-8" }).trim(), main, "the commit sits on main's tip");
    assert.equal(remoteBranch(repo, "main"), main, "main is never pushed to");
    assert.equal(git(repo, "rev-parse", "HEAD"), main);
    assert.equal(git(repo, "status", "--porcelain"), "A  notes.txt", "the caller's checkout is as it was");
    assert.deepEqual(run.outputs, { "changed": "true", "pull-request-number": "1", "pull-request-url": "https://github.com/owner/repo/pull/1" });

    const [ pr ] = await openPrs(repo);
    assert.match(pr!.body, /\| README\.md \| 1 \| greet \| src\/greet\.ts \(region greet\) \|/);
    assert.match(pr!.body, /\| my docs\/guide\.md \| 1 \| hello \| hello world\.ts \|/);
    assert.ok((await ghCalls(repo)).every(({ token }) => token === "test-token"));
  });

  it("is idempotent: a rerun with nothing new pushes nothing and opens no second pull request", async () => {
    const repo = await repository(SYNCED);
    await commit(repo, STALE, "change the sources");

    await action(repo);
    const first = remoteBranch(repo, BRANCH);
    const again = await action(repo);

    assert.equal(again.code, 0, again.stdout);
    assert.match(again.stdout, /Already up to date: #1/);
    assert.equal(remoteBranch(repo, BRANCH), first);
    assert.equal((await openPrs(repo)).length, 1);
    assert.equal((await ghCalls(repo)).filter(({ args }) => args[1] === "create").length, 1);
  });

  it("refreshes the same pull request on top of main's new tip when the sources change again", async () => {
    const repo = await repository(SYNCED);
    await commit(repo, STALE, "change the sources");
    await action(repo);
    const first = remoteBranch(repo, BRANCH);

    await commit(repo, { "src/greet.ts": GREET.replace("Hello", "Hey") }, "change again");
    const main = git(repo, "rev-parse", "HEAD");
    const run = await action(repo);

    const head = remoteBranch(repo, BRANCH);
    assert.equal(run.code, 0, run.stdout);
    assert.match(run.stdout, /Refreshed #1/);
    assert.notEqual(head, first);
    assert.equal(execFileSync("git", [ "--git-dir", repo.remote, "rev-parse", `${head}~1` ], { encoding: "utf-8" }).trim(), main);
    assert.match(show(repo, head, "README.md"), /`Hey, \$\{name\}!`/);
    assert.equal((await openPrs(repo)).length, 1);
  });

  it("uses the base branch's tip even when the checkout is behind it", async () => {
    const repo = await repository(SYNCED);
    const behind = git(repo, "rev-parse", "HEAD");
    await commit(repo, STALE, "change the sources");
    const main = git(repo, "rev-parse", "HEAD");
    git(repo, "checkout", "--quiet", behind);

    const run = await action(repo);

    assert.equal(run.code, 0, run.stdout);
    assert.equal(execFileSync("git", [ "--git-dir", repo.remote, "rev-parse", `${remoteBranch(repo, BRANCH)}~1` ], { encoding: "utf-8" }).trim(), main);
  });

  it("does nothing on a checkout whose blocks are already in sync", async () => {
    const repo = await repository(SYNCED);

    const run = await action(repo);

    assert.equal(run.code, 0, run.stdout);
    assert.match(run.stdout, /✓ Every code block is in sync with its source file; nothing to do\./);
    assert.deepEqual(run.outputs, { changed: "false" });
    assert.equal(remoteBranch(repo, BRANCH), "");
    assert.deepEqual((await ghCalls(repo)).map(({ args }) => args[1]), [ "list" ], "it only looks for a pull request to close");
  });

  it("closes its pull request once main is in sync, and pushes nothing", async () => {
    const repo = await repository(SYNCED);
    await commit(repo, STALE, "change the sources");
    await action(repo);
    const branch = remoteBranch(repo, BRANCH);

    // Someone merges the update by hand.
    git(repo, "fetch", "--quiet", "origin", BRANCH);
    git(repo, "merge", "--quiet", "--ff-only", "FETCH_HEAD");
    git(repo, "push", "--quiet", "origin", "HEAD:refs/heads/main");
    const run = await action(repo);

    assert.equal(run.code, 0, run.stdout);
    assert.match(run.stdout, /Closed #1: the blocks are already in sync\./);
    assert.deepEqual(run.outputs, { changed: "false" });
    assert.deepEqual(await openPrs(repo), []);
    assert.equal(remoteBranch(repo, BRANCH), branch, "nothing is pushed");
  });

  it("opens no pull request when a block's file= cannot be read", async () => {
    const repo = await repository({ ...SYNCED, "README.md": `${SYNCED["README.md"]}\n${fence("ts file=src/missing.ts", "x")}` });
    await commit(repo, STALE, "change the sources");

    const run = await action(repo);

    assert.equal(run.code, 1);
    assert.match(run.stdout, /^::error file=README\.md,line=5,title=mdcode read_failed::src\/missing\.ts does not exist in \/.*\/work; /m);
    assert.equal(remoteBranch(repo, BRANCH), "");
    assert.deepEqual(await ghCalls(repo), []);
  });

  it("refuses to use the base branch as its own branch", async () => {
    const repo = await repository(SYNCED);

    const run = await action(repo, { BRANCH: "main" });

    assert.equal(run.code, 2);
    assert.match(run.stdout, /^::error title=mdcode update-readme::branch and base-branch are both main/m);
  });
});
