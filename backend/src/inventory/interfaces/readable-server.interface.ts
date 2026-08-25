/** A server, as far as reading it over SSH is concerned. */
export interface ReadableServer {
  name: string;
  host: string;
  sshPort: number;
  sshUser: string;
  sshKeyPath: string | null;
  stackPath: string;
}
