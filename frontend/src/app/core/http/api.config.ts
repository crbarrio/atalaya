/**
 * Base URL of the API.
 *
 * In production both halves are served from the same origin behind
 * `tailscale serve`, so a relative path is correct and there is no cross-origin
 * request to configure. In development the Angular dev server proxies /api to
 * the backend (see proxy.conf.json).
 */
export const API_BASE = '/api';
