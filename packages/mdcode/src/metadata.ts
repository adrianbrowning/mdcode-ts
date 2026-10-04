/**
 * Info-string metadata grammar: `lang key=value key="quoted value" ...`.
 *
 * - The first word is the language.
 * - `key=value` takes the value up to the next whitespace, verbatim.
 * - `key="value"` takes the value up to the closing quote. Inside the quotes,
 *   `\"` is a quote and `\\` is a backslash; any other backslash is an error.
 * - Words without `=`, or starting with `=`, are ignored.
 * - A key may appear once per info string.
 */

/** A metadata problem, located by line in the markdown document. */
export interface MetadataProblem {
  /** 1-based line of the code block's opening fence. */
  line: number;
  message: string;
}

/** Thrown when code block metadata in a document is malformed or ambiguous. */
export class MetadataError extends Error {
  readonly problems: ReadonlyArray<MetadataProblem>;

  constructor(problems: ReadonlyArray<MetadataProblem>) {
    super([ "Invalid code block metadata:", ...problems.map(({ line, message }) => `  line ${line}: ${message}`) ].join("\n"));
    this.name = "MetadataError";
    this.problems = problems;
  }
}

export interface ParsedInfo {
  lang: string;
  meta: Record<string, string>;
  /** Grammar violations in this info string; empty when it parsed cleanly. */
  problems: Array<string>;
}

const WHITESPACE = /\s/;

export function parseInfoString(info: string): ParsedInfo {
  const meta: Record<string, string> = {};
  const problems: Array<string> = [];
  let i = 0;

  const isSpace = (at: number): boolean => at < info.length && WHITESPACE.test(info[at]!);
  const skipSpace = (): void => {
    while (isSpace(i)) i++;
  };
  const readWord = (): string => {
    const start = i;
    while (i < info.length && !isSpace(i)) i++;
    return info.slice(start, i);
  };

  /** Read a value starting at its opening quote; undefined if it never closes. */
  const readQuoted = (key: string): string | undefined => {
    let value = "";

    for (i++; i < info.length;) {
      const char = info[i++]!;

      if (char === "\"") {
        if (i < info.length && !isSpace(i)) {
          problems.push(`text after the closing quote of ${JSON.stringify(key)}; separate metadata with spaces`);
          readWord();
        }
        return value;
      }

      if (char !== "\\") {
        value += char;
        continue;
      }

      const escaped = info[i++];

      if (escaped === "\"" || escaped === "\\") {
        value += escaped;
      }
      else if (escaped !== undefined) {
        problems.push(`invalid escape \\${escaped} in the value of ${JSON.stringify(key)}; inside quotes only \\" and \\\\ are escapes`);
      }
    }

    problems.push(`unterminated quoted value for ${JSON.stringify(key)}; add the closing "`);
    return undefined;
  };

  skipSpace();
  const lang = readWord();

  for (skipSpace(); i < info.length; skipSpace()) {
    const keyStart = i;
    while (i < info.length && !isSpace(i) && info[i] !== "=") i++;
    const key = info.slice(keyStart, i);

    if (key === "" || info[i] !== "=") {
      readWord();
      continue;
    }

    i++;
    const value = info[i] === "\"" ? readQuoted(key) : readWord();

    if (Object.hasOwn(meta, key)) {
      problems.push(`duplicate key ${JSON.stringify(key)}; each key may appear once per code block`);
    }
    else if (value !== undefined) {
      meta[key] = value;
    }
  }

  return { lang, meta, problems };
}

/** Write a metadata value so that `parseInfoString` reads it back unchanged. */
export function formatMetaValue(value: string): string {
  return WHITESPACE.test(value) || value.startsWith("\"")
    ? `"${value.replace(/["\\]/g, "\\$&")}"`
    : value;
}
