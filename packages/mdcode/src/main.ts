import { Execute } from "./cli.ts";

Execute(process.argv.slice(2), process.stdout, process.stderr).catch(e=> console.error(e));
