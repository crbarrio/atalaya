/** Identity as resolved by the backend guard. */
export interface Session {
  login: string;
  /** `tailscale` in production; `development` when standing in for the header. */
  source: 'tailscale' | 'development';
}
