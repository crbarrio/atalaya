/**
 * The shape `stack catalogue` returns — the contract with the `stack` repo,
 * written down once, same as `StackInventory` and `StackVersions`.
 *
 * Variable names only. Values live in `secrets/`, which is 700 and stays out
 * of reach; names are what makes "which variables is this missing" answerable
 * without exposing anything.
 */
export interface StackCatalogue {
  version: number;
  /** Where images are published, e.g. `ghcr.io/<owner>`. */
  registry: string;
  apps: CatalogueApp[];
}

export interface CatalogueApp {
  name: string;
  description: string | null;
  /** `owner/repo` on GitHub. Null when the catalogue does not say. */
  repo: string | null;
  /** `mysql`, `postgres`, or null when the app needs no database. */
  database: string | null;
  healthcheck: { path: string; expect: number[] } | null;
  /** Declared but not enforced: the app degrades without these by design. */
  optional: string[];
  services: CatalogueService[];
}

export interface CatalogueService {
  name: string;
  image: string;
  port: number | null;
  /** The one service traffic reaches from outside. Exactly one per app. */
  proxy: boolean;
  usesDatabase: boolean;
  /** `source:/path/in/container`, as declared. */
  volumes: string[];
  /** Required variable names. A deploy refuses if any is missing or empty. */
  env: string[];
}

/** One app, plus where it actually runs. The catalogue alone does not know. */
export interface CatalogueAppView extends CatalogueApp {
  deployments: CatalogueDeployment[];
}

export interface CatalogueDeployment {
  server: string;
  instance: string;
  client: string | null;
  version: string | null;
  state: string | null;
}
