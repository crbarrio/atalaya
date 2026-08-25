/**
 * What a person supplies to register a new server: the machine's tailnet
 * name, and nothing else. Everything is deduced from it — the tailnet IP by
 * MagicDNS resolution, SSH host = that IP. `tailnetIp` exists only as an
 * escape hatch for a machine whose name will not resolve.
 */
export interface RegisterServerRequest {
  name: string;
  tailnetIp?: string;
  nodePort?: number;
  cadvisorPort?: number;
}
