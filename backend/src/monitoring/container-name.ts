/**
 * `generate.py` names every instance's compose project `app-<instance>`, so
 * its containers are `app-<instance>-<service>-<n>`. A prefix match on
 * `app-<instance>-` is not enough — `acme` is itself a prefix of
 * `acme-test`, so its containers would be claimed too. Service names
 * never contain a dash, so the segment before the trailing `-<n>` is always
 * the service, and whatever is left after `app-` is the instance name.
 *
 * Shared between liveness (which containers are running) and memory (how
 * much each instance uses): both start from the same cAdvisor container
 * name and need the same, exact split.
 */
export function instanceOfContainer(containerName: string): string | null {
  const match = /^app-(.+)-[^-]+-\d+$/.exec(containerName);
  return match ? match[1] : null;
}

/**
 * The engine (traefik, mysql, postgres, and the two DB managers) is one
 * compose project per server, `name: stack` in stack/docker-compose.yml, so
 * its containers are `stack-<service>-<n>` — shared infrastructure, not tied
 * to any instance or client.
 */
export function engineServiceOfContainer(containerName: string): string | null {
  const match = /^stack-([^-]+)-\d+$/.exec(containerName);
  return match ? match[1] : null;
}
