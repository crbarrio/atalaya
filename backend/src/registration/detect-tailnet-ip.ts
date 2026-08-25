import { networkInterfaces } from 'node:os';

/**
 * atalaya's own tailnet IP, for `--atalaya-from` — the address the generated
 * artifact will trust an SSH connection from. Tailscale assigns addresses
 * from the CGNAT range 100.64.0.0/10, which is enough to pick it out of the
 * host's interfaces without shelling out to the `tailscale` CLI. Works the
 * same way in both places this runs: `homeserver`'s own address in
 * production (`network_mode: host` shares its interfaces), the workstation's
 * in development.
 */
export function detectTailnetIp(): string | null {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && isTailscaleAddress(address.address)) {
        return address.address;
      }
    }
  }
  return null;
}

export function isTailscaleAddress(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  return a === 100 && b >= 64 && b <= 127;
}
