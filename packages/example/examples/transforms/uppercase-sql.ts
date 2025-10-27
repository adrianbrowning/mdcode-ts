import {defineTransform} from "@mdcode-ts/mdcode";

/**
 * Example transformer that converts SQL code blocks to uppercase
 */
export default defineTransform((tag, _meta, code) => {
  // Only transform SQL blocks
  if (tag === "sql" || tag === "SQL") {
    return code.toUpperCase();
  }

  // Return unchanged for other languages
  return code;
});
