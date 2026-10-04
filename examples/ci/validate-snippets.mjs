#!/usr/bin/env node
// Validate the Markdown code blocks marked runnable=true. Copy this file into
// your repository and run:
//
//   node validate-snippets.mjs [options] <markdown-file>... -- <command> [arg...]
//
// For each document, the runnable=true blocks are extracted into a fresh
// workspace, then <command> runs with that workspace as its working directory:
//
//   -- node --test              once per document, against the whole workspace
//   -- node {file}              once per extracted file; {file} is its path in the workspace
//
// <command> comes only from this command line, never from the Markdown, and
// runs without a shell. The blocks themselves are untrusted input: a command
// that executes them runs their code with your permissions.
//
// Options:
//   --tmp-dir <dir>  create the workspace inside <dir> (default: the OS temp
//                    directory). Point it inside your project but outside
//                    node_modules, for example at a gitignored .mdcode-tmp,
//                    when snippets import your dependencies.
//   --keep           leave the workspace in place and print where it is
//
// Needs Node 22+ and mdcode-ts 0.1.0+ with its `mdcode` on PATH.
//
// Exit codes:
//   0  every runnable block passed
//   1  <command> failed for at least one document or block
//   2  at least one document could not be validated (extract failed, no
//      runnable=true blocks anywhere, <command> or mdcode not found, bad arguments)
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { constants, tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";

const PASSED = 0;
const FAILED = 1;
const FAILURE = 2;
const USAGE = "Usage: node validate-snippets.mjs [--tmp-dir <dir>] [--keep] <markdown-file>... -- <command> [arg...]";

// In GitHub Actions, also annotate the failing blocks in the job summary and PR diff.
const annotate = process.env.GITHUB_ACTIONS === "true";
const escapeData = text => String(text).replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
const escapeProperty = text => escapeData(text).replaceAll(":", "%3A").replaceAll(",", "%2C");

function parseArguments(argv) {
  const separator = argv.indexOf("--");
  const command = separator === -1 ? [] : argv.slice(separator + 1);
  const options = { documents: [], tmpDir: tmpdir(), keep: false, command };
  const before = separator === -1 ? argv : argv.slice(0, separator);

  for (let i = 0; i < before.length; i++) {
    const arg = before[i];

    if (arg === "--keep") {
      options.keep = true;
    }
    else if (arg === "--tmp-dir") {
      if (before[i + 1] === undefined) {
        return { error: "--tmp-dir needs a directory" };
      }
      options.tmpDir = resolve(before[++i]);
    }
    else if (arg.startsWith("--")) {
      return { error: `unknown option ${arg}` };
    }
    else {
      options.documents.push(arg);
    }
  }

  if (options.documents.length === 0 || command.length === 0) {
    return { error: "give at least one Markdown file and a command after --" };
  }

  return options;
}

/** Extract one document's runnable blocks into workspace; returns the files written, or why it could not. */
function extractRunnable(document, workspace) {
  const run = spawnSync("mdcode", [ "extract", "--meta", "runnable=true", "--dir", workspace, "--json", document ], {
    encoding: "utf8",
    maxBuffer: Infinity,
  });

  if (run.error) {
    return { problems: [ `could not run mdcode: ${run.error.message}. Install mdcode-ts 0.1.0 or later.` ] };
  }

  let envelope;

  try {
    envelope = JSON.parse(run.stdout);
  }
  catch {
    return { problems: [ `mdcode exited ${run.status} without a JSON result: ${(run.stderr || run.stdout).trim()}` ] };
  }

  if (envelope.version !== 1 || !Array.isArray(envelope.errors)) {
    return { problems: [ `unsupported mdcode JSON result (version ${envelope.version}); this script expects version 1` ] };
  }

  if (!envelope.ok || envelope.errors.length > 0) {
    const problems = envelope.errors.map(({ line, code, message }) => `${line === undefined ? "" : `line ${line}: `}${code}: ${message}`);
    return { problems: problems.length > 0 ? problems : [ `mdcode exited ${run.status} without reporting an error` ] };
  }

  const files = envelope.result.targets.map(target => ({
    path: relative(workspace, target.path),
    blocks: target.blocks,
  }));

  return { files };
}

const where = ({ line, name }) => `line ${line}${name ? ` (${name})` : ""}`;
const show = argv => argv.join(" ");

let child;

/** Run argv in cwd with inherited stdio; resolves to how it ended. */
function execute(argv, cwd) {
  return new Promise(done => {
    child = spawn(argv[0], argv.slice(1), { cwd, stdio: "inherit" });
    child.once("error", error => done({ error }));
    child.once("close", (code, signal) => done({ code, signal }));
  }).finally(() => {
    child = undefined;
  });
}

const outcome = ({ error, code, signal }) => error ? `could not start: ${error.message}` : signal ? `was killed by ${signal}` : `exited ${code}`;

async function validate(options, root) {
  const perFile = options.command.some(arg => arg.includes("{file}"));
  let selected = 0;
  let failed = 0;
  let broken = 0;

  for (const [ index, document ] of options.documents.entries()) {
    // One workspace per document, so two documents writing the same file= cannot collide.
    const workspace = join(root, `${index + 1}-${basename(document).replace(/[^\w.-]/g, "_")}`);
    mkdirSync(workspace);

    const { problems, files } = extractRunnable(document, workspace);

    if (problems) {
      broken++;
      console.error(`! ${document}: could not be validated`);

      for (const problem of problems) {
        console.error(`    ${problem}`);

        if (annotate) {
          console.log(`::error file=${escapeProperty(document)},title=Could not validate::${escapeData(problem)}`);
        }
      }
      continue;
    }

    const blocks = files.reduce((count, file) => count + file.blocks.length, 0);
    selected += blocks;

    if (blocks === 0) {
      console.log(`- ${document}: no runnable=true blocks`);
      continue;
    }

    console.log(`${document}: ${blocks} runnable block(s)`);

    for (const file of files) {
      console.log(`    ${file.path}  ← ${file.blocks.map(where).join(", ")}`);
    }

    if (!perFile) {
      const ended = await execute(options.command, workspace);

      if (ended.code === 0) {
        console.log(`✓ ${document}`);
        continue;
      }

      const message = `\`${show(options.command)}\` ${outcome(ended)}`;

      if (ended.error) {
        broken++;
        console.error(`! ${document}: ${message}`);
        continue;
      }

      failed++;
      console.error(`✗ ${document}: ${message}`);

      for (const file of files) {
        console.error(`    ${file.path}  ← ${file.blocks.map(where).join(", ")}`);
      }

      if (annotate) {
        const line = files[0].blocks[0].line;
        console.log(`::error file=${escapeProperty(document)},line=${line},title=Snippet validation failed::${escapeData(message)}`);
      }
      continue;
    }

    for (const file of files) {
      const argv = options.command.map(arg => arg.replaceAll("{file}", file.path));
      const ended = await execute(argv, workspace);
      const label = `${document} ${file.blocks.map(where).join(", ")}: ${file.path}`;

      if (ended.code === 0) {
        console.log(`✓ ${label}`);
        continue;
      }

      const message = `\`${show(argv)}\` ${outcome(ended)}`;

      if (ended.error) {
        broken++;
        console.error(`! ${label}: ${message}`);
        continue;
      }

      failed++;
      console.error(`✗ ${label}: ${message}`);

      if (annotate) {
        for (const block of file.blocks) {
          console.log(`::error file=${escapeProperty(document)},line=${block.line},title=Snippet failed::${escapeData(`${file.path}: ${message}`)}`);
        }
      }
    }
  }

  if (broken === 0 && selected === 0) {
    console.error("\nNo runnable=true blocks to validate. Mark a code fence runnable=true, for example ```js runnable=true");
    return FAILURE;
  }

  if (broken > 0) {
    console.error(`\n${broken} document(s) or block(s) could not be validated${failed > 0 ? `, ${failed} failed` : ""}.`);
    return FAILURE;
  }

  if (failed > 0) {
    console.error(`\n${failed} validation(s) failed.`);
    return FAILED;
  }

  console.log(`\n${selected} runnable block(s) passed.`);
  return PASSED;
}

const options = parseArguments(process.argv.slice(2));

if (options.error) {
  console.error(`${options.error}\n${USAGE}`);
  process.exit(FAILURE);
}

mkdirSync(options.tmpDir, { recursive: true });
// The only directory this script ever removes is the one it creates here.
const root = mkdtempSync(join(options.tmpDir, "mdcode-snippets-"));

const cleanUp = () => {
  if (options.keep) {
    console.log(`Workspace kept at ${root}`);
  }
  else {
    rmSync(root, { recursive: true, force: true });
  }
};

// A cancelled CI job still removes the workspace.
for (const signal of [ "SIGINT", "SIGTERM" ]) {
  process.once(signal, () => {
    child?.kill(signal);
    cleanUp();
    process.exit(128 + constants.signals[signal]);
  });
}

try {
  process.exitCode = await validate(options, root);
}
catch (error) {
  console.error(`! could not validate: ${error.message}`);
  process.exitCode = FAILURE;
}
finally {
  cleanUp();
}
