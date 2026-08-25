import { StackContainer, VolumeSummary } from '../../inventory/interfaces/stack-inventory.interface';

/** One instance, as the API returns it. */
export interface InstanceView {
  name: string;
  app: string | null;
  client: string | null;
  enabled: boolean;
  version: string | null;
  deployedAt: Date | null;
  previousVersion: string | null;
  previousAt: Date | null;
  state: string | null;
  /** Null when not observable, which is not an empty list. */
  containers: StackContainer[] | null;
  /** Null when no backup has run yet for this instance, not an empty list. */
  volumes: VolumeSummary[] | null;
  database: { engine: string | null; name: string | null } | null;
  domains: string[];
  fetchedAt: Date;
}
