/**
 * The shape `stack secrets <inst> --json` returns — the contract with the
 * `stack` repo, written down once, same as `StackInventory` and `StackVersions`.
 *
 * There is no field for a value, and there must never be one. The report is
 * safe to send to a browser precisely because it carries names and nothing
 * else; adding a length or a hash here would quietly end that.
 */
export interface VariablesReport {
  instance: string;
  /** The catalogue application this instance comes from. */
  app: string | null;
  /** Path on the server, for the operator to recognise — not for atalaya to use. */
  file: string;
  exists: boolean;
  /** Octal, e.g. `600`. `stack deploy` refuses on anything else. */
  mode: string | null;
  /** Seconds. When the variables last changed, which is all we can say about them. */
  modifiedAt: number | null;
  variables: EnvVariable[];
}

export interface EnvVariable {
  name: string;
  /**
   * `required` blocks a deployment while unset. `optional` degrades the
   * application silently. `undeclared` is in the file but in no apps.json —
   * a typo, or what a retired feature left behind.
   */
  kind: 'required' | 'optional' | 'undeclared';
  set: boolean;
}

/** What the operator is asking to change. Values go no further than the SSH stdin. */
export interface VariablesChange {
  set?: Record<string, string>;
  unset?: string[];
}

/** Names only, so this can be logged, audited and returned without care. */
export interface VariablesWriteResult {
  file: string;
  created: boolean;
  changed: string[];
  unset: string[];
}
