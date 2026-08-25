/** Outcome of reading one server. A failure is a result, not an exception. */
export interface RefreshResult {
  server: string;
  ok: boolean;
  instances?: number;
  error?: string;
}
