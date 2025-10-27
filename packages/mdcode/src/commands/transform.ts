import * as readline from "node:readline";
import { styleText } from "node:util";

import { walk } from "../parser.js";
import type { Block, FilterOptions, TransformerFunction } from "../types.js";

export interface TransformOptions {
  source: string;
  filter?: FilterOptions;
  transformer?: TransformerFunction;
}

/**
 * Interactively transform code blocks with user input
 */
export async function transform(options: TransformOptions): Promise<string> {
  const { source, filter, transformer } = options;

  let skipAll = false;

  const result = await walk({
    source,
    filter,
    walker: async (block: Block) => {
      if (skipAll) {
        return block;
      }

      // Display the block
      console.log("\n" + styleText([ "bold", "cyan" ], "─".repeat(60)));
      console.log(styleText([ "bold", "cyan" ], `Code Block: ${block.lang || "(no language)"}`));

      if (Object.keys(block.meta).length > 0) {
        const metaStr = Object.entries(block.meta)
          .map(([ key, value ]) => `${styleText("green", key)}=${value}`)
          .join(" ");
        console.log(styleText("white", `Metadata: ${metaStr}`));
      }

      console.log(styleText([ "bold", "cyan" ], "─".repeat(60)));
      console.log(styleText("gray", block.code));
      console.log(styleText([ "bold", "cyan" ], "─".repeat(60)) + "\n");

      // If a transformer function is provided, use it
      if (transformer) {
        const transformedCode = await transformer(
          block.lang,
          { file: block.meta.file, region: block.meta.region },
          block.code
        );
        return { ...block, code: transformedCode };
      }

      // Otherwise, prompt the user
      const action = await prompt("Transform this block? (y/n/edit/skip-all): ");

      switch (action.toLowerCase().trim()) {
        case "y":
        case "yes": {
          console.log(styleText("yellow", "Enter the transformed code (type \"<<<END>>>\" on a new line to finish):"));
          const transformedCode = await readMultiline();
          return { ...block, code: transformedCode };
        }

        case "edit":
        case "e": {
          console.log(styleText("yellow", "Current code:"));
          console.log(block.code);
          console.log(styleText("yellow", "\nEnter the new code (type \"<<<END>>>\" on a new line to finish):"));
          const transformedCode = await readMultiline();
          return { ...block, code: transformedCode };
        }

        case "skip-all":
        case "sa": {
          skipAll = true;
          console.log(styleText("yellow", "Skipping all remaining blocks."));
          return block;
        }

        case "n":
        case "no":
        default: {
          console.log(styleText("gray", "Skipped."));
          return block;
        }
      }
    },
  });

  return result.source;
}

/**
 * Prompt the user for a single line of input
 */
async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Read multiline input from the user
 * User should type "<<<END>>>" on a new line to finish
 */
async function readMultiline(): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "",
  });

  const lines: Array<string> = [];

  return new Promise(resolve => {
    rl.on("line", line => {
      if (line.trim() === "<<<END>>>") {
        rl.close();
        resolve(lines.join("\n"));
      }
      else {
        lines.push(line);
      }
    });

    rl.on("close", () => {
      if (!lines[lines.length - 1]?.includes("<<<END>>>")) {
        resolve(lines.join("\n"));
      }
    });
  });
}

/**
 * Non-interactive transformation using a provided transformer function
 * @param source - The markdown source
 * @param transformer - Function that transforms code blocks
 * @param filter - Optional filter to apply
 * @returns The transformed markdown
 */
export async function transformWithFunction(
  source: string,
  transformer: TransformerFunction,
  filter?: FilterOptions
): Promise<string> {
  return transform({ source, filter, transformer });
}
