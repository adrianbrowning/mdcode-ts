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
 * Read a specific region from source code.
 * Joins all occurrences of the same-named region.
 * Pass `lang` to use language-specific comment styles; defaults to // and /* *\/.
 */
export function read(source: string, regionName: string, lang?: string): RegionReadResult {
  const lines = source.split("\n");
  let inRegion = false;
  const regionContent: Array<string> = [];
  let found = false;

  let startPattern: RegExp;
  let endPattern: RegExp;

  if (lang) {
    const styles = getCommentStyle(lang).map(escapeRegex).join("|");
    startPattern = new RegExp(`^\\s*(?:${styles})\\s*#region\\s+${escapeRegex(regionName)}(?:\\s|$)`);
    endPattern = new RegExp(`^\\s*(?:${styles})\\s*#endregion`);
  }
  else {
    startPattern = new RegExp(`^\\s*(?://|/\\*)\\s*#region\\s+${escapeRegex(regionName)}(?:\\s|\\*/|$)`);
    endPattern = /^\s*(?:\/\/|\/\*)\s*#endregion(?:\s|\*\/|$)/;
  }

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
 */
export function replace(source: string, regionName: string, newContent: string): RegionReplaceResult {
  const lines = source.split("\n");
  const result: Array<string> = [];
  let inRegion = false;
  let found = false;

  // Match both // #region name and /* #region name */
  const startPattern = new RegExp(`^\\s*(?://|/\\*)\\s*#region\\s+${escapeRegex(regionName)}(?:\\s|\\*/|$)`);
  const endPattern = /^\s*(?:\/\/|\/\*)\s*#endregion(?:\s|\*\/|$)/;

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
 * Get comment prefix(es) for a given language
 */
export function getCommentStyle(lang: string): Array<string> {
  const styles: Record<string, Array<string>> = {
    js: [ "//" ],
    javascript: [ "//" ],
    ts: [ "//" ],
    typescript: [ "//" ],
    java: [ "//" ],
    c: [ "//" ],
    cpp: [ "//" ],
    "c++": [ "//" ],
    cs: [ "//" ],
    "c#": [ "//" ],
    go: [ "//" ],
    rust: [ "//" ],
    swift: [ "//" ],
    kotlin: [ "//" ],
    php: [ "//" ],
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

  return styles[lang.toLowerCase()] || [ "//" ];
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
