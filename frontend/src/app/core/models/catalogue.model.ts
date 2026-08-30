/** Mirrors the backend's catalogue interfaces (`stack catalogue`). */
export interface CatalogueResponse {
  /** Which server the catalogue was read from; `(stale)` when none answered. */
  source: string;
  registry: string;
  apps: CatalogueApp[];
}

export interface CatalogueApp {
  name: string;
  description: string | null;
  repo: string | null;
  database: string | null;
  healthcheck: { path: string; expect: number[] } | null;
  optional: string[];
  services: CatalogueService[];
  deployments: CatalogueDeployment[];
}

export interface CatalogueService {
  name: string;
  image: string;
  port: number | null;
  proxy: boolean;
  usesDatabase: boolean;
  volumes: string[];
  env: string[];
}

export interface CatalogueDeployment {
  server: string;
  instance: string;
  client: string | null;
  version: string | null;
  state: string | null;
}
