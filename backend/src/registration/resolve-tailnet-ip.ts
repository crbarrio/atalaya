import { lookup } from 'node:dns/promises';

import { isTailscaleAddress } from './detect-tailnet-ip';

/**
 * A machine's tailnet IP from its bare name, over MagicDNS. Registration can
 * ask this because being on the tailnet is already a prerequisite of the
 * setup artifact — the machine exists there before atalaya first hears of it.
 *
 * The bare name resolves because tailscaled installs the tailnet's domain as
 * a DNS search suffix on every member, this machine included (in production
 * the container inherits the host's resolver via `network_mode: host`). The
 * CGNAT range check is what makes the answer trustworthy: a name that
 * happens to resolve somewhere else — LAN, public DNS — is rejected rather
 * than silently registered pointing outside the tailnet.
 */
export async function resolveTailnetIp(name: string): Promise<string | null> {
  try {
    const { address } = await lookup(name, { family: 4 });
    return isTailscaleAddress(address) ? address : null;
  } catch {
    return null;
  }
}
