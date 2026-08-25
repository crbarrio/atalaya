/** Enough of a server to address its cAdvisor over the tailnet. */
export interface LivenessTarget {
  tailnetIp: string;
  cadvisorPort: number;
}

export interface InstanceLiveness {
  name: string;
  state: 'running' | 'stopped';
  /** Container names cAdvisor has scraped recently for this instance. */
  liveContainers: string[];
}
