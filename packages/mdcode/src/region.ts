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
};

export type RegionOutlineResult = {
  content: string;
  hasRegions: boolean;
};

/**
 * Build the start/end marker patterns for a region.
 * Without `lang`, the C-family prefixes (`//` and `/*`) are accepted.
 */
function markerPatterns(regionName: string, lang?: string): { start: RegExp; end: RegExp; } {
  const styles = (lang ? getCommentStyle(lang) : [ "//", "/*" ]).map(escapeRegex)
    .join("|");
  const name = escapeRegex(regionName);
  const tail = "(?:\\s|\\*/|-->|$)";

  return {
    start: new RegExp(`^\\s*(?:${styles})\\s*#region\\s+${name}${tail}`),
    end: new RegExp(`^\\s*(?:${styles})\\s*#endregion${tail}`),
  };
}

/**
 * Read a specific region from source code.
 * Joins all occurrences of the same-named region.
 * Pass `lang` to use language-specific comment styles; defaults to // and /* *\/.
 */
export function read(source: string, regionName: string, lang?: string): RegionReadResult {
  const lines = source.split("\n");
  let inRegion = false;
  const regionContent: Array<string> = [];
  let found = false;

  const { start: startPattern, end: endPattern } = markerPatterns(regionName, lang);

  for (const line of lines) {
    if (!inRegion) {
      if (startPattern.test(line)) {
        inRegion = true;
        found = true;
      }
    }
    else {
      if (endPattern.test(line)) {
        inRegion = false;
      }
      else {
        regionContent.push(line);
      }
    }
  }

  return {
    content: regionContent.join("\n"),
    found,
  };
}

/**
 * Generate an outline showing only region markers
 * Removes all content between #region and #endregion markers
 */
export function outline(source: string): RegionOutlineResult {
  const lines = source.split("\n");
  const result: Array<string> = [];
  let inRegion = false;
  let hasRegions = false;

  // Match both // #region and /* #region */
  const startPattern = /^\s*(?:\/\/|\/\*)\s*#region\b/;
  const endPattern = /^\s*(?:\/\/|\/\*)\s*#endregion\b/;

  for (const line of lines) {
    if (!inRegion) {
      result.push(line);
      if (startPattern.test(line)) {
        inRegion = true;
        hasRegions = true;
      }
    }
    else {
      if (endPattern.test(line)) {
        result.push(line);
        inRegion = false;
      }
      // Skip all lines inside regions
    }
  }

  return {
    content: result.join("\n"),
    hasRegions,
  };
}

/**
 * Replace content within a specific region
 * Preserves the region markers and surrounding code
 * Pass `lang` to use language-specific comment styles; defaults to // and /* *\/.
 */
export function replace(source: string, regionName: string, newContent: string, lang?: string): RegionReplaceResult {
  const lines = source.split("\n");
  const result: Array<string> = [];
  let inRegion = false;
  let found = false;

  const { start: startPattern, end: endPattern } = markerPatterns(regionName, lang);

  for (const line of lines) {
    if (!inRegion) {
      result.push(line);
      if (startPattern.test(line)) {
        inRegion = true;
        found = true;
        // Insert new content after the region start marker
        // Remove trailing newline from newContent if it exists, since we'll add it via join
        const contentToInsert = newContent.endsWith("\n") ? newContent.slice(0, -1) : newContent;
        if (contentToInsert) {
          result.push(contentToInsert);
        }
      }
    }
    else {
      if (endPattern.test(line)) {
        result.push(line);
        inRegion = false;
      }
      // Skip old content inside region
    }
  }

  return {
    content: result.join("\n"),
    found,
  };
}

/**
 * Get comment prefix(es) recognised for a given language.
 * The first entry is the canonical prefix used when writing new markers;
 * the rest are additional prefixes accepted when matching existing markers.
 */
export function getCommentStyle(lang: string): Array<string> {
  const styles: Record<string, Array<string>> = {
    js: [ "//", "/*" ],
    javascript: [ "//", "/*" ],
    ts: [ "//", "/*" ],
    typescript: [ "//", "/*" ],
    java: [ "//", "/*" ],
    c: [ "//", "/*" ],
    cpp: [ "//", "/*" ],
    "c++": [ "//", "/*" ],
    cs: [ "//", "/*" ],
    "c#": [ "//", "/*" ],
    go: [ "//", "/*" ],
    rust: [ "//", "/*" ],
    swift: [ "//", "/*" ],
    kotlin: [ "//", "/*" ],
    php: [ "//", "/*" ],
    py: [ "#" ],
    python: [ "#" ],
    rb: [ "#" ],
    ruby: [ "#" ],
    sh: [ "#" ],
    bash: [ "#" ],
    yaml: [ "#" ],
    yml: [ "#" ],
    html: [ "<!--" ],
    xml: [ "<!--" ],
  };

  return styles[lang.toLowerCase()] || [ "//", "/*" ];
}

/**
 * Render a region marker line using the language's canonical comment style,
 * closing block comments (`/* *\/`, `<!-- -->`) so the marker stays valid syntax.
 */
export function regionMarker(lang: string, kind: "region" | "endregion", name: string): string {
  const prefix = getCommentStyle(lang)[0]!;
  const closers: Record<string, string> = { "/*": " */", "<!--": " -->" };

  return `${prefix} #${kind} ${name}${closers[prefix] ?? ""}`;
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
