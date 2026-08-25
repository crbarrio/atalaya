/** Null when either side is missing — a bar with nothing to draw, not a bar at 0%. */
export function usagePercent(
  usage: { usedBytes: number | null; totalBytes: number | null } | undefined,
): number | null {
  if (!usage || usage.usedBytes === null || usage.totalBytes === null || usage.totalBytes === 0) {
    return null;
  }
  return (usage.usedBytes / usage.totalBytes) * 100;
}
