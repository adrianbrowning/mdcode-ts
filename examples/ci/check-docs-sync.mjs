#!/usr/bin/env node
// Check that Markdown code blocks match the files they reference, without
// changing anything. Copy this file into your repository and run:
//
//   node check-docs-sync.mjs README.md docs/guide.md
//
// Needs Node 22+ and mdcode-ts 0.1.0+ with its `mdcode` on PATH: npm scripts
// and `npx -p mdcode-ts` both provide one.
//
// Exit codes:
//   0  every document is in sync
//   1  at least one document is out of sync
//   2  at least one document could not be checked (unreadable file=, missing
//      document, mdcode not installed, bad arguments)
import { spawnSync } from "node:child_process";

const IN_SYNC = 0;
const DRIFT = 1;
const FAILURE = 2;

const documents = process.argv.slice(2);

if (documents.length === 0) {
  console.error("Usage: node check-docs-sync.mjs <markdown-file>...");
  process.exit(FAILURE);
}

// In GitHub Actions, also annotate the offending lines in the job summary and PR diff.
const annotate = process.env.GITHUB_ACTIONS === "true";
const escapeData = text => String(text).replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
const escapeProperty = text => escapeData(text).replaceAll(":", "%3A").replaceAll(",", "%2C");

/** Ask mdcode whether one document is in sync; returns its errors, or a reason it could not say. */
function check(document) {
  const run = spawnSync("mdcode", [ "update", "--check", "--json", "--continue-on-error", document ], {
    encoding: "utf8",
    maxBuffer: Infinity,
  });

  if (run.error) {
    return { failure: `could not run mdcode: ${run.error.message}. Install mdcode-ts, or run this script through npx -p mdcode-ts.` };
  }

  let envelope;

  try {
    envelope = JSON.parse(run.stdout);
  }
  catch {
    return { failure: `mdcode exited ${run.status} without a JSON result: ${(run.stderr || run.stdout).trim()}` };
  }

  if (envelope.version !== 1 || !Array.isArray(envelope.errors)) {
    return { failure: `unsupported mdcode JSON result (version ${envelope.version}); this script expects version 1` };
  }

  if (run.status !== 0 && envelope.errors.length === 0) {
    return { failure: `mdcode exited ${run.status} without reporting an error` };
  }

  return { errors: envelope.errors };
}

function describe({ line, name, code, message }) {
  const where = line === undefined ? "" : `line ${line}${name ? ` (${name})` : ""}: `;
  return `${where}${code === "out_of_sync" ? "" : `${code}: `}${message}`;
}

let drifted = 0;
let failed = 0;

for (const document of documents) {
  const { failure, errors = [] } = check(document);
  const problems = failure ? [ { code: "unexpected_error", message: failure } ] : errors;
  const couldNotCheck = failure !== undefined || errors.some(error => error.code !== "out_of_sync");

  if (problems.length === 0) {
    console.log(`✓ ${document}`);
    continue;
  }

  if (couldNotCheck) {
    failed++;
    console.error(`! ${document}: could not be checked`);
  }
  else {
    drifted++;
    console.error(`✗ ${document}: out of sync`);
  }

  for (const problem of problems) {
    console.error(`    ${describe(problem)}`);

    if (annotate) {
      const title = problem.code === "out_of_sync" ? "Out of sync" : "Could not check";
      const line = problem.line === undefined ? "" : `,line=${problem.line}`;
      console.log(`::error file=${escapeProperty(document)}${line},title=${title}::${escapeData(problem.message)}`);
    }
  }

  if (!couldNotCheck) {
    console.error(`    Review with: mdcode update --diff ${document}`);
    console.error(`    Fix with:    mdcode update --apply ${document}`);
  }
}

const total = documents.length;

// exitCode rather than exit(), so piped output is flushed before the process ends.
if (failed > 0) {
  console.error(`\n${failed} of ${total} document(s) could not be checked${drifted > 0 ? `, ${drifted} out of sync` : ""}.`);
  process.exitCode = FAILURE;
}
else if (drifted > 0) {
  console.error(`\n${drifted} of ${total} document(s) out of sync.`);
  process.exitCode = DRIFT;
}
else {
  console.log(`\n${total} document(s) in sync.`);
  process.exitCode = IN_SYNC;
}
