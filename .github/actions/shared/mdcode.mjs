/**
 * Helpers shared by this repository's consumer GitHub Actions (check-sync,
 * update-readme). Each action's composite step runs its own script, which
 * imports these. GitHub downloads the whole repository at the action's ref,
 * so this file and packages/mdcode/package.json are always beside them.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { glob } from "node:fs/promises";
import { join } from "node:path";

/** An action input, from the environment variable action.yml maps it to. */
export const env = name => (process.env[name] ?? "").trim();

/** A boolean action input. */
export const flag = name => /^(true|1|yes)$/i.test(env(name));

/** The inputs are wrong or mdcode could not run: the action exits 2. */
export class ConfigError extends Error {}

/** The command that runs mdcode: the input, else the release this action belongs to, from npm. */
export function mdcodeCommand() {
  if (env("MDCODE_COMMAND")) {
    return env("MDCODE_COMMAND");
  }

  const manifest = join(import.meta.dirname, "..", "..", "..", "packages", "mdcode", "package.json");
  const { name, version } = JSON.parse(readFileSync(manifest, "utf-8"));
  return `npx --yes ${name}@${version}`;
}

/** The documents input: one path or glob per line, so paths may contain spaces. */
export async function documents() {
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

/** The flags that select a configuration file, from the project and config inputs. */
export function configFlags() {
  return [ ...(flag("PROJECT") ? [ "--project" ] : []), ...(env("CONFIG") ? [ "--config", env("CONFIG") ] : []) ];
}

/** Run mdcode with these arguments and return its JSON envelope. */
export function mdcode(command, args) {
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

/** Escape text for a workflow command's message or property value. */
export function escape(text, property = false) {
  const escaped = String(text).replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
  return property ? escaped.replaceAll(":", "%3A").replaceAll(",", "%2C") : escaped;
}

/** Text for one cell of a Markdown table. */
export const cell = text => String(text ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");

/** Run a script's main(), turning a ConfigError into an annotation and exit code 2. */
export async function runAction(title, main) {
  try {
    process.exitCode = await main();
  }
  catch (error) {
    if (!(error instanceof ConfigError)) {
      throw error;
    }
    console.log(`::error title=${escape(title, true)}::${escape(error.message)}`);
    process.exitCode = 2;
  }
}
