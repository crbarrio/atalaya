/** Mirrors the backend's `InstancePlan` (`stack add --json`). */
export interface InstancePlan {
  instance: string;
  app: string;
  client: string;
  domains: string[];
  /** `mysql`, `postgres`, or empty when the application uses no database. */
  engine: string;
  database: string;
  dbUser: string;
  secretsFile: string;
  reusedSecrets: boolean;
  /** Still commented out in the secrets file. `stack deploy` refuses while any remain. */
  pendingVariables: string[];
  /** True for a preview, which wrote nothing. */
  planned: boolean;
}

export interface CreateInstanceRequest {
  instance: string;
  app: string;
  domains: string[];
  client?: string;
  database?: string;
  reuseSecrets?: boolean;
}
