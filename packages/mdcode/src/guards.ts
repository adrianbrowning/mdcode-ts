/** Type guards for data parsed from JSON, such as mdcode.config.json. */

/** Whether a value is a JSON object: not null, not an array. Its fields are still unknown. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
