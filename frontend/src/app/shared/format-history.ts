/** "14:32" under a day, "Aug 20" beyond it — matches how far back the chart actually goes. */
export function formatHistoryLabel(epochSeconds: number, hoursSpan: number): string {
  const date = new Date(epochSeconds * 1000);
  return hoursSpan <= 48
    ? date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function peakOf(points: { v: number }[] | undefined): number | null {
  if (!points || points.length === 0) return null;
  return Math.max(...points.map((p) => p.v));
}
