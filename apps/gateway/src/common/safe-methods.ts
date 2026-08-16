/**
 * The HTTP methods that change nothing on the server.
 *
 * Shared rather than restated because two places already need the same answer
 * and disagreeing about it has cost a defect: `CookieOriginGuard` uses it to
 * decide what is worth refusing cross-origin, and `TaskListCacheInterceptor`
 * uses it to decide what is worth invalidating a cache for. That interceptor
 * originally asked `method === 'GET'` and treated everything else as a write —
 * but Express routes `HEAD` to the `GET` handler, so a `HEAD /tasks` succeeded
 * and then retired every cached page the caller had. Any browser prefetch or
 * uptime probe silently turned the cache off.
 *
 * `OPTIONS` is here for the same reason it is in CORS: a preflight asks a
 * question, it does not perform the request.
 */
export const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);
