/**
 * The shape `stack inventory` returns.
 *
 * The contract with the `stack` repo, written down once. A change on that side
 * then breaks in one obvious place instead of scattering through the code that
 * consumes it.
 */
export interface StackInventory {
  server: string;
  generated_at: string;
  /** mtime of the manifest that was read: how fresh the answer is. */
  manifest_at: string | null;
  /** False when the reading account cannot see the docker socket. */
  containers_observable: boolean;
  backup: StackBackup | null;
  instances: StackInstance[];
}

export interface StackBackup {
  status: string;
  /** Local time with no offset, as stack writes it. Kept verbatim. */
  at: string | null;
  mode: string | null;
  detail: string;
}

export interface StackContainer {
  name: string;
  state: string;
}

export interface StackVolume {
  name: string;
  size_bytes: number;
}

/** Camelcased for storage/API — the stack contract above stays snake_case. */
export interface VolumeSummary {
  name: string;
  sizeBytes: number;
}

export interface StackInstance {
  name: string;
  app: string | null;
  client: string | null;
  enabled: boolean;
  domains: string[];
  database: { engine: string | null; name: string | null } | null;
  version: string | null;
  deployed_at: string | null;
  previous_version: string | null;
  previous_at: string | null;
  /** running | stopped | not deployed | unknown | disabled… */
  state: string;
  /** Null when not observable, which is not the same as an empty list. */
  containers: StackContainer[] | null;
  /** Null when no backup has run yet for this instance, not the same as []. */
  volumes: StackVolume[] | null;
}
