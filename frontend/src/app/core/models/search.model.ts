export interface ServerResult {
  name: string;
}

/** One instance on one server — the same instance name on two servers is two results, on purpose. */
export interface InstanceResult {
  server: string;
  name: string;
  app: string | null;
  client: string | null;
}

export interface SearchResults {
  servers: ServerResult[];
  instances: InstanceResult[];
}
