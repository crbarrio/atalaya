/** SQLite has no native map type, so the full label set travels as JSON text. */
export function parseLabels(value: string | null): Record<string, string> {
  if (!value) return {};
  try {
    return JSON.parse(value) as Record<string, string>;
  } catch {
    return {};
  }
}
