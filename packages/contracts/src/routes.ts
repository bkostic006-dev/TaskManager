/**
 * Public gateway routes, named once so the web client and the gateway's
 * controllers cannot drift apart.
 *
 * Only the gateway is publicly reachable; the service base URLs below are
 * resolved from environment variables on the internal docker network.
 */
export const AUTH_ROUTES = {
  base: '/auth',
  signup: '/auth/signup',
  login: '/auth/login',
  refresh: '/auth/refresh',
  logout: '/auth/logout',
  me: '/auth/me',
} as const;

export const TASK_ROUTES = {
  base: '/tasks',
  byId: (id: string) => `/tasks/${id}`,
  complete: (id: string) => `/tasks/${id}/complete`,
  uncomplete: (id: string) => `/tasks/${id}/uncomplete`,
} as const;

/** Every service exposes this for compose healthchecks and nothing else. */
export const HEALTH_ROUTE = '/health';

/**
 * Name of the httpOnly cookie carrying the opaque refresh token.
 *
 * Scoped to `/auth` so it is never sent on task requests. The value is a
 * 256-bit random string — the database stores only its SHA-256 hash.
 */
export const REFRESH_COOKIE = 'refresh_token';
