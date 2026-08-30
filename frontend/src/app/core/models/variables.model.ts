/**
 * Mirrors the backend's `VariablesReport` (backend/src/variables/interfaces).
 *
 * There is no field for a value here, and there is none there either. What the
 * screen can show is which variables exist and which are set — never what any
 * of them says.
 */
export interface VariablesReport {
  instance: string;
  app: string | null;
  file: string;
  exists: boolean;
  /** Octal, e.g. `600`. Anything else and `stack deploy` refuses. */
  mode: string | null;
  modifiedAt: number | null;
  variables: EnvVariable[];
}

export interface EnvVariable {
  name: string;
  kind: 'required' | 'optional' | 'undeclared';
  set: boolean;
}

export interface VariablesChange {
  set?: Record<string, string>;
  unset?: string[];
}

export interface VariablesWriteResult {
  file: string;
  created: boolean;
  changed: string[];
  unset: string[];
}
