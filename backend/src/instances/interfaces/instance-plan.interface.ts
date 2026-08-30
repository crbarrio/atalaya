/**
 * The shape `stack add --json` returns — the contract with the `stack` repo,
 * written down once, same as `StackInventory` and `VariablesReport`.
 *
 * The same object comes back from `--dry-run`, with `planned` instead of
 * `written`. That symmetry is the point: what the panel shows before creating
 * an instance is what the server itself worked out, not a guess made here.
 *
 * Nothing secret is in it. `stack add` generates the database password, writes
 * it into the secrets file and never prints it — reading it back means reading
 * a 600 file on the server, with the permissions that implies.
 */
export interface InstancePlan {
  instance: string;
  app: string;
  client: string;
  domains: string[];
  /** `mysql`, `postgres`, or empty when the application uses no database. */
  engine: string;
  database: string;
  dbUser: string;
  /** Path on the server, for the operator to recognise. */
  secretsFile: string;
  reusedSecrets: boolean;
  /**
   * Declared in apps.json, left commented out in the secrets file because
   * nothing could work them out. `stack deploy` refuses while any remain — so
   * this is the list the variables editor has to clear before the first deploy.
   */
  pendingVariables: string[];
  /** True for a preview, which wrote nothing. */
  planned: boolean;
}

/** What the operator is asking to declare. */
export interface CreateInstanceRequest {
  instance: string;
  app: string;
  domains: string[];
  client?: string;
  database?: string;
  /**
   * Keep an existing secrets file instead of refusing. How an instance retired
   * without `--with-data` comes back: that file names a database user with a
   * password, and a fresh one would only guarantee they disagree.
   */
  reuseSecrets?: boolean;
}
