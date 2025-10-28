/**
 * Outline extraction - removes content between region markers while preserving structure
 */

export interface OutlineResult {
  content: string;
  found: boolean;
}

/**
 * Remove content between #region and #endregion markers while preserving the markers themselves
 *
 * Region markers must:
 * - Start with TWO special characters (e.g., //, ##, --, /*)
 * - Include "#region" followed by a space and name
 * - End with TWO special characters and "#endregion"
 *
 * @param source - Source code content
 * @returns Object with processed content and whether regions were found
 * @throws Error if region start found without matching endregion
 */
export function outline(source: string): OutlineResult {
  // Special characters that can be used in comments
  const specialChars = String.raw`[!"#$%&'()*+,\-./:;<=>?@[\\\]^_{|}~]`;

  // Pattern for region start: two special chars + "region" + space + name
  // Captures the whole line including newlines
  const regionStartPattern = new RegExp(
    String.raw`^[ \t]*${specialChars}{2}\s*#?region\s+\w+.*$`,
    'gm'
  );

  // Pattern for region end: two special chars + "endregion"
  const regionEndPattern = new RegExp(
    String.raw`^[ \t]*${specialChars}{2}\s*#?endregion.*$`,
    'gm'
  );

  // Find all region markers with their positions
  const regionStarts: Array<{ index: number; endIndex: number; line: string }> = [];
  const regionEnds: Array<{ index: number; endIndex: number; line: string }> = [];

  let match;
  while ((match = regionStartPattern.exec(source)) !== null) {
    regionStarts.push({
      index: match.index,
      endIndex: match.index + match[0].length,
      line: match[0]
    });
  }

  while ((match = regionEndPattern.exec(source)) !== null) {
    regionEnds.push({
      index: match.index,
      endIndex: match.index + match[0].length,
      line: match[0]
    });
  }

  // No regions found
  if (regionStarts.length === 0) {
    return { content: source, found: false };
  }

  // Check for missing endregion markers
  if (regionStarts.length !== regionEnds.length) {
    throw new Error(
      `Mismatched region markers: found ${regionStarts.length} #region but ${regionEnds.length} #endregion`
    );
  }

  // Verify proper nesting (each start must be before its corresponding end)
  for (let i = 0; i < regionStarts.length; i++) {
    if (regionStarts[i].index >= regionEnds[i].index) {
      throw new Error(
        `Invalid region nesting: #endregion found before #region at position ${regionEnds[i].index}`
      );
    }
  }

  // Build result by copying ranges and preserving markers
  let result = '';
  let lastPos = 0;

  for (let i = 0; i < regionStarts.length; i++) {
    const startMarker = regionStarts[i];
    const endMarker = regionEnds[i];

    // Copy content before region start marker (including any newline before it)
    result += source.substring(lastPos, startMarker.index);

    // Add the region start marker line
    result += startMarker.line;

    // Add newline if the start marker line was followed by a newline
    if (startMarker.endIndex < source.length && source[startMarker.endIndex] === '\n') {
      result += '\n';
    }
    else if (startMarker.endIndex + 1 < source.length && source.substring(startMarker.endIndex, startMarker.endIndex + 2) === '\r\n') {
      result += '\r\n';
    }

    // Add the region end marker line
    result += endMarker.line;

    // Add newline if the end marker line was followed by a newline
    const endLineEnd = endMarker.endIndex;
    if (endLineEnd < source.length && source[endLineEnd] === '\n') {
      result += '\n';
    }
    else if (endLineEnd + 1 < source.length && source.substring(endLineEnd, endLineEnd + 2) === '\r\n') {
      result += '\r\n';
    }

    // Move past the end marker and its newline
    lastPos = endLineEnd;
    if (lastPos < source.length && source[lastPos] === '\n') {
      lastPos++;
    }
    else if (lastPos + 1 < source.length && source.substring(lastPos, lastPos + 2) === '\r\n') {
      lastPos += 2;
    }
  }

  // Copy remaining content after last region
  result += source.substring(lastPos);

  return { content: result, found: true };
}
