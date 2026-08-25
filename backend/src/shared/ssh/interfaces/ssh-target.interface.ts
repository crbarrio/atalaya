/** What `SshService` needs to reach a machine. Never the whole server row. */
export interface SshTarget {
  name: string;
  host: string;
  port: number;
  user: string;
  /** Falls back to SSH_KEY_PATH when absent. */
  keyPath?: string | null;
  /** Absolute path to `stack`, since an SSH exec has no working directory. */
  stackPath: string;
}
