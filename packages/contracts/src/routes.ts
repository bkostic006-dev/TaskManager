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

/**
 * The auth service's own surface, reachable only from the gateway across the
 * `internal: true` network.
 *
 * Deliberately not the same object as {@link AUTH_ROUTES} even where the paths
 * coincide, because the contracts differ: nothing here reads or writes a
 * cookie, `refresh` and `logout` take the opaque token in the body, and the
 * caller has already been authenticated — `userById` is reached only after the
 * gateway verified a JWT, which is why it takes an id instead of a token.
 */
export const AUTH_INTERNAL_ROUTES = {
  base: '/auth',
  signup: '/auth/signup',
  login: '/auth/login',
  refresh: '/auth/refresh',
  logout: '/auth/logout',
  userById: (id: string) => `/auth/users/${encodeId(id)}`,
} as const;

export const TASK_ROUTES = {
  base: '/tasks',
  byId: (id: string) => `/tasks/${encodeId(id)}`,
  complete: (id: string) => `/tasks/${encodeId(id)}/complete`,
  uncomplete: (id: string) => `/tasks/${encodeId(id)}/uncomplete`,
} as const;

/**
 * Escapes an id before it becomes part of a URL path.
 *
 * Every builder above takes a value that reached us from outside — a path
 * parameter, or the `sub` of a token — and splices it into a URL the gateway
 * then requests over the internal network. Raw, a `/` or a `?` in that value
 * would change which route the service sees rather than which record it looks
 * up, which is path traversal against our own services. These ids are uuids in
 * every path the code takes today, so this encodes nothing in practice; it is
 * here so that staying true is not a precondition for the URL being correct.
 */
function encodeId(id: string): string {
  return encodeURIComponent(id);
}

/** Every service exposes this for compose healthchecks and nothing else. */
export const HEALTH_ROUTE = '/health';

/**
 * Name of the httpOnly cookie carrying the opaque refresh token.
 *
 * Scoped to `/auth` so it is never sent on task requests. The value is a
 * 256-bit random string — the database stores only its SHA-256 hash.
 */
export const REFRESH_COOKIE = 'refresh_token';
