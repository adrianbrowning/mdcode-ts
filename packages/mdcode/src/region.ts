/**
 * Region extraction and manipulation utilities
 * Handles #region/#endregion markers in source files
 */

export type RegionReadResult = {
  content: string;
  found: boolean;
};

export type RegionReplaceResult = {
  content: string;
  found: boolean;
  /** False when the start marker was found but never closed. `content` is then the untouched source. */
  closed: boolean;
};

export type RegionOutlineResult = {
  content: string;
  hasRegions: boolean;
};

/** One region's replacement body, plus the language whose markers delimit it. */
export type RegionEdit = {
  code: string;
  lang?: string;
};

/**
 * Outcome of splicing one or more regions in a single pass.
 *
 * `ok` is false when the source cannot be spliced safely — an unclosed region
 * would truncate the file, a duplicated name is ambiguous, and overlapping
 * regions have no well-defined result. In all three cases `content` is the
 * original source, unchanged.
 */
export type RegionSpliceResult = {
  content: string;
  ok: boolean;
  /** Regions whose body was replaced. */
  spliced: Array<string>;
  /** Requested regions with no start marker in the source. */
  unmatched: Array<string>;
  /** Regions whose start marker was never closed. */
  unclosed: Array<string>;
  /** Regions whose start marker appears more than once. */
  duplicated: Array<string>;
  /** Regions whose extent overlaps another region's. */
  overlapping: Array<string>;
};

/** A comment style: the opening prefix, plus the closer a block comment needs. */
export type CommentStyle = {
  open: string;
  close: string;
};

/** Non-empty list; the first entry is canonical for writing new markers. */
type CommentStyles = readonly [CommentStyle, ...Array<CommentStyle>];

const LINE_SLASH: CommentStyle = { open: "//", close: "" };
const BLOCK_SLASH: CommentStyle = { open: "/*", close: " */" };
const HASH: CommentStyle = { open: "#", close: "" };
const DASH: CommentStyle = { open: "--", close: "" };
const SEMI: CommentStyle = { open: ";", close: "" };
const HTML: CommentStyle = { open: "<!--", close: " -->" };

const C_FAMILY: CommentStyles = [ LINE_SLASH, BLOCK_SLASH ];
const HASH_ONLY: CommentStyles = [ HASH ];
const DASH_ONLY: CommentStyles = [ DASH ];
const SEMI_ONLY: CommentStyles = [ SEMI ];
const HTML_ONLY: CommentStyles = [ HTML ];
const BLOCK_ONLY: CommentStyles = [ BLOCK_SLASH ];

/**
 * Comment styles per language. Kept in step with `getExtensionForLang` in
 * commands/extract.ts: a language that can be extracted must also be able to
 * carry a region marker in its own syntax.
 */
const LANG_COMMENT_STYLES: Readonly<Record<string, CommentStyles>> = {
  // C family
  js: C_FAMILY,
  javascript: C_FAMILY,
  jsx: C_FAMILY,
  mjs: C_FAMILY,
  cjs: C_FAMILY,
  ts: C_FAMILY,
  typescript: C_FAMILY,
  tsx: C_FAMILY,
  java: C_FAMILY,
  c: C_FAMILY,
  h: C_FAMILY,
  cpp: C_FAMILY,
  "c++": C_FAMILY,
  cs: C_FAMILY,
  "c#": C_FAMILY,
  csharp: C_FAMILY,
  go: C_FAMILY,
  rust: C_FAMILY,
  rs: C_FAMILY,
  swift: C_FAMILY,
  kotlin: C_FAMILY,
  kt: C_FAMILY,
  scala: C_FAMILY,
  dart: C_FAMILY,
  php: C_FAMILY,
  json: C_FAMILY,
  jsonc: C_FAMILY,

  // Hash comments
  py: HASH_ONLY,
  python: HASH_ONLY,
  rb: HASH_ONLY,
  ruby: HASH_ONLY,
  sh: HASH_ONLY,
  bash: HASH_ONLY,
  zsh: HASH_ONLY,
  ksh: HASH_ONLY,
  fish: HASH_ONLY,
  shell: HASH_ONLY,
  perl: HASH_ONLY,
  pl: HASH_ONLY,
  r: HASH_ONLY,
  yaml: HASH_ONLY,
  yml: HASH_ONLY,
  toml: HASH_ONLY,
  ini: HASH_ONLY,
  conf: HASH_ONLY,
  dockerfile: HASH_ONLY,
  makefile: HASH_ONLY,
  make: HASH_ONLY,
  elixir: HASH_ONLY,
  ex: HASH_ONLY,
  exs: HASH_ONLY,
  txt: HASH_ONLY,
  text: HASH_ONLY,

  // Double-dash comments
  sql: DASH_ONLY,
  lua: DASH_ONLY,
  hs: DASH_ONLY,
  haskell: DASH_ONLY,
  elm: DASH_ONLY,
  ada: DASH_ONLY,

  // Semicolon comments
  lisp: SEMI_ONLY,
  clj: SEMI_ONLY,
  clojure: SEMI_ONLY,
  scm: SEMI_ONLY,
  asm: SEMI_ONLY,

  // Block-comment-only
  css: BLOCK_ONLY,
  scss: BLOCK_ONLY,
  sass: BLOCK_ONLY,
  less: BLOCK_ONLY,

  // Markup
  html: HTML_ONLY,
  xml: HTML_ONLY,
  svg: HTML_ONLY,
  vue: HTML_ONLY,
  svelte: HTML_ONLY,
  md: HTML_ONLY,
  markdown: HTML_ONLY,
};

/** Region names are interpolated into comment markers, so keep them inert. */
const VALID_REGION_NAME = /^[\w.:-]+$/;

/**
 * Get the comment style(s) recognised for a given language.
 * The first entry is canonical — used when writing new markers; the rest are
 * additional prefixes accepted when matching existing markers.
 */
export function getCommentStyle(lang: string): CommentStyles {
  return LANG_COMMENT_STYLES[lang.toLowerCase()] ?? C_FAMILY;
}

/**
 * True when `name` is safe to interpolate into a comment marker.
 * Rejects anything that could terminate a block or markup comment early, or
 * span lines.
 */
export function isValidRegionName(name: string): boolean {
  return VALID_REGION_NAME.test(name);
}

type RawLine = {
  /** Line text without its end-of-line sequence. */
  text: string;
  /** The line's own end-of-line sequence, or "" for a final line without one. */
  eol: string;
};

type Marker = {
  kind: "region" | "endregion";
  name?: string;
};

/**
 * Split into lines that each retain their own line ending, so a mixed or CRLF
 * file round-trips byte-for-byte.
 */
function splitLines(source: string): Array<RawLine> {
  return source.split(/(?<=\n)/).map(raw => {
    const eol = /\r?\n$/.exec(raw)?.[0] ?? "";

    return { text: eol ? raw.slice(0, -eol.length) : raw, eol };
  });
}

/**
 * Build the marker pattern for one language.
 *
 * A marker is accepted anywhere on the line as long as it terminates the line,
 * so both `  // #region x` and `} // #endregion x` match, as do JSDoc-style
 * openers. The name charset matches VALID_REGION_NAME, so a block-comment
 * terminator is never captured as the name, and names are compared exactly, so
 * `join` never matches `join-sql`.
 */
function markerScanner(lang?: string): RegExp {
  const opens = getCommentStyle(lang ?? "")
    .map(style => escapeRegex(style.open))
    .join("|");

  return new RegExp(`(?:${opens})[\\s*]*#(region|endregion)(?:\\s+([\\w.:-]+))?\\s*(?:\\*/|-->)?\\s*$`);
}

function markerAt(text: string, scanner: RegExp): Marker | undefined {
  const match = scanner.exec(text);

  return match ? { kind: match[1] as "region" | "endregion", name: match[2] } : undefined;
}

/**
 * Read a specific region from source code.
 * Joins all occurrences of the same-named region; nested regions are part of
 * the enclosing region's content and are returned verbatim.
 *
 * An unterminated region has no well-defined content, so it reads as not found
 * rather than as everything up to end-of-file.
 */
export function read(source: string, regionName: string, lang?: string): RegionReadResult {
  const scanner = markerScanner(lang);
  const content: Array<string> = [];
  const nesting: Array<string | undefined> = [];
  let inRegion = false;
  let found = false;

  for (const line of splitLines(source)) {
    const marker = markerAt(line.text, scanner);

    if (!inRegion) {
      if (marker?.kind === "region" && marker.name === regionName) {
        inRegion = true;
        nesting.length = 0;
        found = true;
      }
      continue;
    }

    if (marker?.kind === "endregion" && nesting.length === 0 && (marker.name === undefined || marker.name === regionName)) {
      inRegion = false;
      continue;
    }

    if (marker?.kind === "region") {
      nesting.push(marker.name);
    }
    else if (marker?.kind === "endregion" && (marker.name === undefined || marker.name === nesting.at(-1))) {
      nesting.pop();
    }

    content.push(line.text);
  }

  if (inRegion) {
    return { content: "", found: false };
  }

  return { content: content.join("\n"), found };
}

/**
 * Generate an outline showing only region markers.
 *
 * Every marker line is kept — including nested ones — and only non-marker lines
 * inside a region are removed, so the marker structure of the file survives
 * whatever depth it is written at.
 */
export function outline(source: string, lang?: string): RegionOutlineResult {
  const scanner = markerScanner(lang);
  const result: Array<string> = [];
  let depth = 0;
  let hasRegions = false;

  for (const line of splitLines(source)) {
    const marker = markerAt(line.text, scanner);

    if (marker?.kind === "region") {
      depth++;
      hasRegions = true;
    }
    else if (marker?.kind === "endregion") {
      depth = Math.max(0, depth - 1);
    }
    else if (depth > 0) {
      continue;
    }

    result.push(line.text + line.eol);
  }

  return { content: result.join(""), hasRegions };
}

/** The extent of one region in the source, as line indices of its markers. */
type RegionSpan = {
  name: string;
  start: number;
  end: number;
  code: string;
};

/**
 * Replace the bodies of one or more regions.
 *
 * Each region is located with its own block's comment syntax, so one language's
 * marker never opens a region belonging to another. Extents are discovered once
 * per distinct language and then applied in a single pass, so cost scales with
 * the number of languages involved, not the number of regions.
 *
 * The inserted body is re-indented to its start marker and takes that marker's
 * line ending, so an indented or CRLF file stays consistent.
 *
 * Refuses (returns `ok: false` and the original source) when a region's start
 * marker is never closed — splicing would otherwise drop everything from the
 * marker to end-of-file — when a name appears more than once, or when two
 * regions overlap.
 */
export function spliceRegions(source: string, edits: ReadonlyMap<string, RegionEdit>): RegionSpliceResult {
  const lines = splitLines(source);
  const namesByLang = new Map<string, Array<string>>();

  for (const [ name, edit ] of edits) {
    const key = edit.lang ?? "";
    const existing = namesByLang.get(key);

    if (existing) {
      existing.push(name);
    }
    else {
      namesByLang.set(key, [ name ]);
    }
  }

  const spans: Array<RegionSpan> = [];
  const started = new Set<string>();
  const duplicated = new Set<string>();
  const unclosed = new Set<string>();
  const overlapping = new Set<string>();

  for (const [ lang, names ] of namesByLang) {
    const scanner = markerScanner(lang);
    const wanted = new Set(names);
    const nesting: Array<string | undefined> = [];
    let open: { name: string; start: number; } | undefined;

    for (const [ index, line ] of lines.entries()) {
      const marker = markerAt(line.text, scanner);
      if (marker === undefined) continue;

      if (open === undefined) {
        if (marker.kind === "region" && marker.name !== undefined && wanted.has(marker.name)) {
          if (started.has(marker.name)) {
            duplicated.add(marker.name);
          }
          started.add(marker.name);
          open = { name: marker.name, start: index };
          nesting.length = 0;
        }
        continue;
      }

      // Only the region's own terminator closes it, and only once everything
      // opened inside it has closed. A closer naming neither the innermost open
      // region nor nothing leaves the nesting malformed, so the region never
      // closes and the whole splice is refused.
      if (marker.kind === "endregion" && nesting.length === 0 && (marker.name === undefined || marker.name === open.name)) {
        spans.push({ name: open.name, start: open.start, end: index, code: edits.get(open.name)!.code });
        open = undefined;
        continue;
      }

      if (marker.kind === "region") {
        // A region nested inside one of the same name has no unambiguous
        // terminator; refuse rather than guess which marker closes which.
        if (marker.name === open.name) {
          duplicated.add(open.name);
        }
        // Two requested regions cannot nest: splicing one would discard the
        // other's markers along with the body being replaced. The inner one was
        // still located, so it counts as started and is never "unmatched".
        else if (marker.name !== undefined && wanted.has(marker.name)) {
          started.add(marker.name);
          overlapping.add(open.name);
          overlapping.add(marker.name);
        }
        nesting.push(marker.name);
      }
      else if (nesting.length > 0 && (marker.name === undefined || marker.name === nesting.at(-1))) {
        nesting.pop();
      }
    }

    if (open !== undefined) {
      unclosed.add(open.name);
    }
  }

  const ordered = [ ...spans ].sort((a, b) => a.start - b.start);

  for (const [ index, span ] of ordered.entries()) {
    const previous = index === 0 ? undefined : ordered[index - 1];

    if (previous !== undefined && span.start <= previous.end) {
      overlapping.add(previous.name);
      overlapping.add(span.name);
    }
  }

  const ok = unclosed.size === 0 && duplicated.size === 0 && overlapping.size === 0;
  const result: RegionSpliceResult = {
    content: source,
    ok,
    spliced: ok ? ordered.map(span => span.name) : [],
    unmatched: [ ...edits.keys() ].filter(name => !started.has(name)),
    unclosed: [ ...unclosed ],
    duplicated: [ ...duplicated ],
    overlapping: [ ...overlapping ],
  };

  if (!ok) {
    return result;
  }

  const spanByStart = new Map(ordered.map(span => [ span.start, span ]));
  const out: Array<string> = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    out.push(line.text + line.eol);

    const span = spanByStart.get(index);
    if (span === undefined) continue;

    const eol = line.eol || "\n";
    const indent = /^[ \t]*/.exec(line.text)?.[0] ?? "";

    for (const bodyLine of span.code.replace(/\r?\n$/, "").split(/\r?\n/)) {
      if (bodyLine === "" && span.code === "") continue;
      out.push((bodyLine === "" ? "" : indent + bodyLine) + eol);
    }

    // Skip the old body; the next iteration emits the closing marker.
    index = span.end - 1;
  }

  return { ...result, content: out.join("") };
}

/**
 * Replace content within a single region, preserving the markers and
 * surrounding code. Thin wrapper over `spliceRegions`.
 */
export function replace(source: string, regionName: string, newContent: string, lang?: string): RegionReplaceResult {
  const result = spliceRegions(source, new Map([[ regionName, { code: newContent, lang }]]));

  return {
    content: result.content,
    found: !result.unmatched.includes(regionName),
    closed: result.unclosed.length === 0,
  };
}

/**
 * Render a region marker line using the language's canonical comment style,
 * terminating block and markup comments so the marker stays valid syntax.
 */
export function regionMarker(lang: string, kind: "region" | "endregion", name: string): string {
  if (!isValidRegionName(name)) {
    throw new Error(`Invalid region name ${JSON.stringify(name)}: expected only letters, digits, _ . : or -`);
  }
  const style = getCommentStyle(lang)[0];

  return `${style.open} #${kind} ${name}${style.close}`;
}

/**
 * Wrap `code` in a region envelope for `lang`, newline-terminated.
 * This is the shape every writer needs; `regionMarker` builds one line of it.
 */
export function wrapRegion(lang: string, name: string, code: string): string {
  return `${regionMarker(lang, "region", name)}\n${code}\n${regionMarker(lang, "endregion", name)}\n`;
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
