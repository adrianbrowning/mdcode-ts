import { Execute } from "./cli.js";

Execute(process.argv.slice(2), process.stdout, process.stderr).catch(e=> console.error(e));
