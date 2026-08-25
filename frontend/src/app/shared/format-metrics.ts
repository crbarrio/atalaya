export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

export function formatLoad(load: { load1: number | null; load5: number | null; cpuCount: number | null } | undefined): string | null {
  if (!load || load.load1 === null || load.load5 === null) return null;
  return `${load.load1.toFixed(2)} / ${load.load5.toFixed(2)}` + (load.cpuCount ? ` (${load.cpuCount} cores)` : '');
}
