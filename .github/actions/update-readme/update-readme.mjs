#!/usr/bin/env node
/**
 * The update-readme action: treat linked source files as authoritative, run
 * `mdcode update --apply` on the selected Markdown documents, and open or
 * refresh one pull request that holds only those documents' changes.
 *
 * It works in a temporary worktree at the base branch's tip, so the caller's
 * checkout is never touched and the pull request is always the update on top
 * of base-branch. It never pushes to the base branch, never writes a source
 * file (update writes only Markdown, and the commit is checked to hold only
 * the documents update wrote), and pushes again only when the branch's
 * content would change, so reruns are idempotent.
 *
 * Inputs arrive as environment variables (see action.yml). Exit 0 when the
 * pull request is up to date or nothing needed updating, 1 when a block's
 * file= or region= could not be read, 2 when the inputs are wrong or git, gh
 * or mdcode failed.
 */
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";

import { ConfigError, configFlags, documents, env, escape, mdcode, mdcodeCommand, runAction } from "../shared/mdcode.mjs";

/** Run a command, returning its stdout; a failure is a ConfigError naming the command. */
function exec(file, args, options = {}) {
  const run = spawnSync(file, args, { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024, ...options });

  if (run.status !== 0) {
    const shown = file === "git" ? args.filter(arg => !arg.startsWith("http.")).join(" ") : args.join(" ");
    throw new ConfigError(`${file} ${shown} failed (exit ${run.status ?? run.signal}): ${(run.stderr || run.stdout || run.error?.message || "").trim()}`);
  }

  return run.stdout;
}

function remote() {
  const server = (env("GITHUB_SERVER_URL") || "https://github.com").replace(/\/$/, "");
  return { server, url: `${server}/${env("GITHUB_REPOSITORY")}.git` };
}

/** git with the token as the only credential for the remote, replacing any actions/checkout persisted. */
function git(args) {
  const { server } = remote();
  const basic = Buffer.from(`x-access-token:${env("TOKEN")}`).toString("base64");
  return exec("git", [ "-c", `http.${server}/.extraheader=`, "-c", `http.${server}/.extraheader=AUTHORIZATION: basic ${basic}`, ...args ]);
}

function gh(args) {
  const { server } = remote();
  const host = new URL(server).host;
  return exec("gh", args, { env: { ...process.env, GH_TOKEN: env("TOKEN"), ...(host === "github.com" ? {} : { GH_HOST: host }) } });
}

/** The open pull request from branch into base, if there is one. */
function openPullRequest(branch, base) {
  const found = JSON.parse(gh([ "pr", "list", "--repo", env("GITHUB_REPOSITORY"), "--head", branch, "--base", base, "--state", "open", "--json", "number,url" ]));
  return found[0];
}

/** The pull request body: what changed, and how to reproduce it. */
function body(results) {
  const lines = results.flatMap(({ document, blocks }) => blocks
    .filter(block => block.changed)
    .map(block => `| ${document} | ${block.line} | ${block.name ?? ""} | ${block.read?.region ? `${block.read.file} (region ${block.read.region})` : block.read?.file ?? ""} |`));

  return [
    "The code blocks below no longer matched the source files they link to, so `mdcode update --apply` brought them up to date. Only Markdown changed; no source file is touched.",
    "",
    "| Document | Line | Block | Source |",
    "| --- | --- | --- | --- |",
    ...lines,
    "",
    "Created by the mdcode-ts [update-readme](https://github.com/adrianbrowning/mdcode-ts/tree/main/.github/actions/update-readme) action. It refreshes this pull request whenever the blocks drift again.",
  ].join("\n");
}

function output(values) {
  if (env("GITHUB_OUTPUT")) {
    appendFileSync(env("GITHUB_OUTPUT"), Object.entries(values).map(([ key, value ]) => `${key}=${value}\n`).join(""));
  }
}

async function main() {
  const branch = env("BRANCH");
  const base = env("BASE_BRANCH");

  if (!env("GITHUB_REPOSITORY") || !env("TOKEN")) {
    throw new ConfigError("GITHUB_REPOSITORY and token are required");
  }
  if (!branch || !base) {
    throw new ConfigError("branch and base-branch must both be set");
  }
  if (branch === base) {
    throw new ConfigError(`branch and base-branch are both ${base}; the action only ever pushes to a branch of its own`);
  }

  // Work in a clean worktree at the base branch's tip: the pull request is the
  // update on top of base-branch, whatever the caller checked out or changed.
  const { url } = remote();
  const tip = git([ "ls-remote", url, `refs/heads/${base}` ]).split(/\s/)[0];

  if (!tip) {
    throw new ConfigError(`base-branch ${base} does not exist in ${env("GITHUB_REPOSITORY")}`);
  }

  const prefix = exec("git", [ "rev-parse", "--show-prefix" ]).trim();
  const tree = await realpath(await mkdtemp(join(tmpdir(), "mdcode-update-readme-")));
  const top = exec("git", [ "rev-parse", "--show-toplevel" ]).trim();
  git([ "fetch", "--quiet", "--depth=1", url, tip ]);
  exec("git", [ "worktree", "add", "--quiet", "--detach", tree, tip ]);
  const caller = process.cwd();

  try {
    process.chdir(join(tree, prefix));
    return await updateIn({ tree, top, prefix, tip, url, branch, base });
  }
  finally {
    process.chdir(caller);
    exec("git", [ "worktree", "remove", "--force", tree ]);
  }
}

/** Update the documents in the worktree, then open or refresh the pull request. */
async function updateIn({ tree, top, prefix, tip, url, branch, base }) {
  const command = mdcodeCommand();
  const configured = configFlags().length > 0;
  const docs = await documents();

  if (docs.length === 0 && !configured) {
    throw new ConfigError("documents is empty; list Markdown files or globs, one per line, or set project: true");
  }

  // update --apply writes Markdown only, and nothing at all when any block fails.
  const envelope = mdcode(command, [ "update", "--apply", "--json", ...configFlags(), ...(env("BASE") ? [ "--base", env("BASE") ] : []), ...docs ]);

  if (envelope.result === null && envelope.errors.some(({ code }) => code === "invalid_usage")) {
    throw new ConfigError(`mdcode update rejected its arguments: ${envelope.errors.map(({ message }) => message).join("; ")}`);
  }

  if (envelope.errors.length > 0) {
    const workdir = env("WORKING_DIRECTORY") || ".";
    for (const error of envelope.errors) {
      const file = error.document === undefined ? [] : [ `file=${escape(posix.normalize(posix.join(workdir, error.document)), true)}` ];
      // mdcode ran in the worktree; name the caller's checkout instead.
      const message = error.message.replaceAll(tree, top);
      console.log(`::error ${[ ...file, ...(error.line ? [ `line=${error.line}` ] : []), `title=${escape(`mdcode ${error.code}`, true)}` ].join(",")}::${escape(message)}`);
    }
    console.log("✗ No pull request: fix the blocks above, whose file= or region= could not be read.");
    return 1;
  }

  const results = envelope.result?.documents ?? [];
  const written = results.map(({ written }) => written).filter(Boolean);

  if (written.length === 0) {
    const stale = openPullRequest(branch, base);
    if (stale) {
      gh([ "pr", "close", String(stale.number), "--repo", env("GITHUB_REPOSITORY"), "--comment", `The code blocks are in sync with their source files on ${base}, so this pull request is no longer needed.` ]);
      console.log(`Closed #${stale.number}: the blocks are already in sync.`);
    }
    else {
      console.log("✓ Every code block is in sync with its source file; nothing to do.");
    }
    output({ changed: "false" });
    return 0;
  }

  const author = `${env("AUTHOR_NAME")} <${env("AUTHOR_EMAIL")}>`;
  exec("git", [ "add", "--", ...written ]);
  exec("git", [ "-c", `user.name=${env("AUTHOR_NAME")}`, "-c", `user.email=${env("AUTHOR_EMAIL")}`, "commit", "--quiet", "--author", author, "-m", env("COMMIT_MESSAGE") ]);

  // git names committed paths from the repository root; mdcode names them from the working directory.
  const expected = written.map(path => posix.normalize(posix.join(prefix, path)));
  const committed = exec("git", [ "-c", "core.quotePath=false", "diff", "--name-only", "-z", tip, "HEAD" ]).split("\0").filter(Boolean);
  const unexpected = committed.filter(path => !expected.includes(path));
  if (unexpected.length > 0) {
    throw new ConfigError(`the commit would change ${unexpected.join(", ")}, which mdcode did not write; refusing to push`);
  }

  // Idempotent: a branch that already holds this content on this base is left alone.
  const existing = git([ "ls-remote", url, `refs/heads/${branch}` ]).split(/\s/)[0];
  let pushed = true;

  if (existing) {
    git([ "fetch", "--quiet", "--depth=2", url, existing ]);
    pushed = exec("git", [ "rev-parse", `${existing}^{tree}`, `${existing}~1` ]) !== exec("git", [ "rev-parse", "HEAD^{tree}", "HEAD~1" ]);
  }

  if (pushed) {
    git([ "push", "--quiet", "--force", url, `HEAD:refs/heads/${branch}` ]);
  }

  const title = env("TITLE");
  const text = body(results);
  const open = openPullRequest(branch, base);
  let pr = open;

  if (open) {
    gh([ "pr", "edit", String(open.number), "--repo", env("GITHUB_REPOSITORY"), "--title", title, "--body", text ]);
    console.log(`${pushed ? "Refreshed" : "Already up to date:"} #${open.number} ${open.url}`);
  }
  else {
    const created = gh([ "pr", "create", "--repo", env("GITHUB_REPOSITORY"), "--base", base, "--head", branch, "--title", title, "--body", text ]).trim();
    pr = { number: Number(created.split("/").pop()), url: created };
    console.log(`Opened #${pr.number} ${pr.url}`);
  }

  output({ changed: "true", "pull-request-number": pr.number, "pull-request-url": pr.url });
  return 0;
}

await runAction("mdcode update-readme", main);
