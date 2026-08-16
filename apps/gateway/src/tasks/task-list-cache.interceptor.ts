import { ExecutionContext, Inject, Injectable, type CallHandler } from '@nestjs/common';
import { CACHE_MANAGER, CacheInterceptor } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import type { AuthenticatedRequest } from '../common/jwt-auth.guard';
import { SAFE_METHODS } from '../common/safe-methods';
import { CACHEABLE_LIST, TaskListCache } from './task-list-cache';

/**
 * The gateway's only cache, on the gateway's only hot read.
 *
 * **Catches** every request to `TasksController`. **Emits** the cached
 * `TaskListResponse` for a repeat `GET /tasks` inside the TTL — with
 * `X-Cache: HIT`, which the base class sets — and passes everything else
 * straight through, bumping the caller's cache generation after a write of
 * theirs succeeds.
 *
 * Three decisions, in the order they matter:
 *
 * 1. **`trackBy` is overridden, and that is the whole point of this class.**
 *    The inherited implementation keys on the request URL, which carries no
 *    identity — see {@link TaskListCache} for what that costs and why folding
 *    the token's `userId` in fixes it.
 * 2. **`GET /tasks` only.** `undefined` from `trackBy` means "do not cache", so
 *    task detail, the writes, `/auth/me` and everything else are untouched.
 *    `/auth/me` in particular is deliberately not cached: it is cheap, it is
 *    the call a client makes to find out whether its session is still good, and
 *    a stale answer to that question is a security-shaped bug rather than a
 *    slow page.
 * 3. **Writes invalidate, safe methods do not.** The test is
 *    {@link SAFE_METHODS}, not `method === 'GET'`: Express routes `HEAD` to the
 *    `GET` handler, so asking only about `GET` made a `HEAD /tasks` fall into
 *    the write branch and retire every page the caller had cached. Any browser
 *    prefetch or uptime probe turned the cache off, and a client could defeat it
 *    deliberately. Found by an adversarial review of this stage. `tap` runs on
 *    success only, so a failed write still leaves the cache alone — it changed
 *    nothing.
 *
 * @throws Nothing. A cache-manager failure is swallowed by the base class and
 * the request is served from upstream, which is the correct trade: a cache is
 * an optimisation and must not be able to fail a request.
 */
@Injectable()
export class TaskListCacheInterceptor extends CacheInterceptor {
  constructor(
    @Inject(CACHE_MANAGER) cacheManager: Cache,
    reflector: Reflector,
    private readonly keys: TaskListCache,
  ) {
    super(cacheManager, reflector);
  }

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const handled = await super.intercept(context, next);

    if (SAFE_METHODS.has(request.method)) {
      return handled;
    }

    const userId = request.user?.userId;
    return userId ? handled.pipe(tap(() => this.keys.invalidate(userId))) : handled;
  }

  protected trackBy(context: ExecutionContext): string | undefined {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    // `request.user` is set by the global JwtAuthGuard, which runs before every
    // interceptor and rejects anything it cannot verify. Its absence therefore
    // means the route was somehow not guarded — so refuse to build a key rather
    // than build one that is not scoped to anybody.
    // The marker is read off the handler, not compared against a path string.
    // Express routes case-insensitively and non-strictly, so `/tasks/`, `/TASKS`
    // and `/Tasks` all reach `list()` while none is byte-equal to `/tasks` — the
    // old check failed closed on all three, silently not caching a route it was
    // meant to cache. A marker cannot drift from the routing table.
    const cacheable = this.reflector.get<boolean>(CACHEABLE_LIST, context.getHandler());
    const userId = request.user?.userId;
    if (cacheable !== true || !userId || request.method !== 'GET') {
      return undefined;
    }

    return this.keys.key(userId, request.originalUrl);
  }
}
