/**
 * The shape `stack versions --json` returns — the contract with the `stack`
 * repo, written down once, same as `StackInventory`.
 */
export interface StackVersions {
  instance: string;
  /** What is deployed right now. Null when it never has been. */
  running: string | null;
  /** The branch this server follows, from its `.env`. */
  branch: string | null;
  /**
   * What a bare `deploy` would pick. The one field a caller cannot work out
   * for itself, and what makes "deploying would change nothing" sayable.
   */
  chosen: string | null;
  services: StackVersionedService[];
}

export interface StackVersionedService {
  image: string;
  /** Newest first, as `stack` sorts them. */
  versions: StackVersion[];
}

export interface StackVersion {
  tag: string;
  /** In the registry. False means it only exists as a local image here. */
  published: boolean;
  /** Human-readable size when downloaded on the server, null when it is not. */
  size: string | null;
}
