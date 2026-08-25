
export function healthTone(health: string): 'default' | 'success' | 'warning' | 'danger' {
  switch (health) {
    case 'ok':
      return 'success';
    case 'stale':
      return 'warning';
    case 'unreachable':
      return 'danger';
    default:
      return 'default';
  }
}

export function healthBorderClass(health: string): string {
  const map: Record<string, string> = {
    ok: 'border-l-secondary',
    stale: 'border-l-tertiary',
    unreachable: 'border-l-error',
  };
  return map[health] ?? 'border-l-outline-variant';
}
