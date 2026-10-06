#!/usr/bin/env node
/**
 * The check-sync action: fail when Markdown code blocks and the files they
 * link to disagree, in either direction, without writing anything.
 *
 *   files → Markdown: `mdcode update --check`, does each block show its file?
 *   Markdown → files: `mdcode extract --check --force`, would extract change a file?
 *
 * Inputs arrive as environment variables (see action.yml). Exit 0 when both
 * directions are in sync, 1 when anything drifted or could not be read, 2 when
 * the action itself was misconfigured or mdcode could not run.
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { glob } from "node:fs/promises";
import { dirname, join, posix } from "node:path";

const DIRECTIONS = {
  update: { label: "files → Markdown (update)", fix: "mdcode update --apply" },
  extract: { label: "Markdown → files (extract)", fix: "mdcode extract --force" },
};

const env = name => (process.env[name] ?? "").trim();
const flag = name => /^(true|1|yes)$/i.test(env(name));

class ConfigError extends Error {}

/** The command that runs mdcode: the input, else the release this action belongs to, from npm. */
function mdcodeCommand() {
  if (env("MDCODE_COMMAND")) {
    return env("MDCODE_COMMAND");
  }

  const manifest = join(import.meta.dirname, "..", "..", "..", "packages", "mdcode", "package.json");
  const { name, version } = JSON.parse(readFileSync(manifest, "utf-8"));
  return `npx --yes ${name}@${version}`;
}

/** The directions to check, from a space- or comma-separated list. */
function directions() {
  const asked = env("DIRECTIONS").split(/[\s,]+/).filter(Boolean);
  const unknown = asked.filter(direction => !(direction in DIRECTIONS));

  if (asked.length === 0 || unknown.length > 0) {
    throw new ConfigError(`directions must list update, extract or both; got ${JSON.stringify(env("DIRECTIONS"))}`);
  }

  return [ ...new Set(asked) ];
}

/** The documents, one path or glob per line, so paths may contain spaces. */
async function documents() {
  const found = [];

  for (const line of env("DOCUMENTS").split(/\r?\n/).map(entry => entry.trim()).filter(Boolean)) {
    if (!/[*?[{]/.test(line)) {
      if (!existsSync(line)) {
        throw new ConfigError(`document ${line} does not exist`);
      }
      found.push(line);
      continue;
    }

    const matches = [];
    for await (const match of glob(line)) {
      matches.push(match.split("\\").join("/"));
    }

    if (matches.length === 0) {
      throw new ConfigError(`documents pattern ${line} matched no files`);
    }
    found.push(...matches.sort());
  }

  return [ ...new Set(found) ];
}

/** Run mdcode with these arguments and return its JSON envelope. */
function mdcode(command, args) {
  // bash passes every argument through "$@" untouched, so paths with spaces stay whole.
  // --norc: bash reads ~/.bashrc when it guesses it runs over ssh, which can print or change PATH.
  const run = spawnSync("bash", [ "--noprofile", "--norc", "-c", `${command} "$@"`, "mdcode", ...args ], { encoding: "utf-8", maxBuffer: 256 * 1024 * 1024 });

  try {
    return JSON.parse(run.stdout);
  }
  catch {
    throw new ConfigError(`mdcode did not produce a JSON result (exit ${run.status ?? run.signal}):\n${run.stderr || run.stdout || run.error?.message || ""}`.trimEnd());
  }
}

/** The mdcode runs for one direction: one for update, one per document directory for extract. */
function runs(direction, docs) {
  const common = [ "--json", ...(flag("PROJECT") ? [ "--project" ] : []), ...(env("CONFIG") ? [ "--config", env("CONFIG") ] : []) ];

  if (direction === "update") {
    return [[ "update", "--check", "--continue-on-error", ...common, ...(env("BASE") ? [ "--base", env("BASE") ] : []), ...docs ]];
  }

  // --force compares existing whole files instead of reporting them skipped; --check writes nothing.
  const extract = [ "extract", "--check", "--force", ...(flag("IGNORE_ANONYMOUS") ? [ "--ignore-anonymous" ] : []), ...common ];
  // Both directions resolve file= against one root: dir, else update's base. A
  // configuration supplies its own outputRoot.
  const root = env("DIR") || env("BASE");
  const configured = flag("PROJECT") || env("CONFIG") !== "";

  if (root || configured || docs.length === 0) {
    return [[ ...extract, ...(root ? [ "--dir", root ] : []), ...docs ]];
  }

  // Like update without --base, resolve each document's file= against its own directory.
  const byDir = Map.groupBy(docs, doc => dirname(doc));
  return [ ...byDir ].map(([ dir, group ]) => [ ...extract, "--dir", dir, ...group ]);
}

/** Escape text for a workflow command's message or property value. */
function escape(text, property = false) {
  const escaped = String(text).replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
  return property ? escaped.replaceAll(":", "%3A").replaceAll(",", "%2C") : escaped;
}

const cell = text => String(text ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");

async function main() {
  const command = mdcodeCommand();
  const asked = directions();
  const project = flag("PROJECT") || env("CONFIG") !== "";
  const docs = await documents();

  if (docs.length === 0 && !project) {
    throw new ConfigError("documents is empty; list Markdown files or globs, one per line, or set project: true");
  }

  const problems = [];

  for (const direction of asked) {
    for (const args of runs(direction, docs)) {
      const envelope = mdcode(command, args);

      if (envelope.result === null && envelope.errors.some(({ code }) => code === "invalid_usage")) {
        const message = envelope.errors.map(({ message }) => message).join("; ");
        const hint = direction === "extract" && /--check/.test(message) ? " This mdcode has no extract --check; pin the action to a release that does." : "";
        throw new ConfigError(`mdcode ${args[0]} rejected its arguments: ${message}.${hint}`);
      }

      problems.push(...envelope.errors.map(error => ({ direction, ...error })));
    }
  }

  // The same drift seen from both sides is one problem.
  const merged = [];
  for (const problem of problems) {
    const twin = merged.find(other => other.direction !== problem.direction && other.code === "out_of_sync" && problem.code === "out_of_sync"
      && other.document === problem.document && other.line === problem.line);

    if (twin) {
      twin.direction = "both";
      twin.messages.push(problem.message);
      continue;
    }
    merged.push({ ...problem, messages: [ problem.message ] });
  }

  report(merged, asked, docs);
  return merged.length === 0 ? 0 : 1;
}

function report(problems, asked, docs) {
  const workdir = env("WORKING_DIRECTORY") || ".";
  const where = asked.map(direction => DIRECTIONS[direction].label).join(" and ");

  for (const problem of problems) {
    const label = problem.direction === "both" ? "both directions" : DIRECTIONS[problem.direction].label;
    const block = problem.name ? ` (${problem.name})` : "";
    const message = `${label}: ${problem.messages.join("; ")}${block}`;
    const file = problem.document === undefined ? undefined : posix.normalize(posix.join(workdir, problem.document));
    const properties = [
      ...(file ? [ `file=${escape(file, true)}` ] : []),
      ...(problem.line ? [ `line=${problem.line}` ] : []),
      `title=${escape(`mdcode ${problem.code}`, true)}`,
    ];

    console.log(`::error ${properties.join(",")}::${escape(message)}`);
  }

  const summary = [];

  if (problems.length === 0) {
    const scope = docs.length === 0 ? "the configured documents" : `${docs.length} document(s)`;
    console.log(`✓ ${scope} in sync: ${where}.`);
    summary.push("## mdcode: in sync", "", `Checked ${scope}: ${where}.`);
  }
  else {
    console.log(`✗ ${problems.length} problem(s) between Markdown code blocks and their files.`);
    summary.push(
      "## mdcode: out of sync",
      "",
      `${problems.length} problem(s). If the file is right, run \`${DIRECTIONS.update.fix} <document>\`; if the block is right, run \`${DIRECTIONS.extract.fix} <document>\`. Fix read errors in the block's \`file=\` or \`region=\`.`,
      "",
      "| Direction | Document | Line | Block | File | Problem |",
      "| --- | --- | --- | --- | --- | --- |",
      ...problems.map(problem => `| ${problem.direction === "both" ? "both" : problem.direction} | ${cell(problem.document)} | ${problem.line ?? ""} | ${cell(problem.name)} | ${cell(problem.path)} | ${cell(`${problem.code}: ${problem.messages.join("; ")}`)} |`),
    );
  }

  if (env("GITHUB_STEP_SUMMARY")) {
    appendFileSync(env("GITHUB_STEP_SUMMARY"), summary.join("\n") + "\n");
  }

  if (env("GITHUB_OUTPUT")) {
    appendFileSync(env("GITHUB_OUTPUT"), `problems=${problems.length}\n`);
  }
}

try {
  process.exitCode = await main();
}
catch (error) {
  if (!(error instanceof ConfigError)) {
    throw error;
  }
  console.log(`::error title=mdcode check-sync::${escape(error.message)}`);
  process.exitCode = 2;
}
