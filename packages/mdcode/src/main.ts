#!/usr/bin/env node
/* eslint-disable node/shebang */
import { Execute } from "./cli.ts";

// exitCode rather than process.exit(), which could drop output still buffered for a pipe.
try {
  process.exitCode = await Execute(process.argv.slice(2), process.stdout, process.stderr);
}
catch (error: unknown) {
  console.error(error);
  process.exitCode = 1;
}
