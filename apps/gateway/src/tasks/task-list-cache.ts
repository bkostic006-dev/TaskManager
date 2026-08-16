import { Injectable, SetMetadata } from '@nestjs/common';

/**
 * Marks the one handler whose responses may be cached.
 *
 * Read off the handler rather than matched against a path. The gate was
 * originally `request.path === '/tasks'`, which quietly disagreed with the
 * router: Express matches case-insensitively and non-strictly, so `/tasks/`,
 * `/TASKS` and `/Tasks` all reach `list()` and returned real data while never
 * being byte-equal to `/tasks`. That failed closed — no key, no cache, no
 * `X-Cache` header — so it was a silent miss rather than a leak, but a string
 * doing both "is this cacheable" and "what did the router decide" has already
 * been wrong once. Found by an adversarial review of this stage.
 */
export const CACHEABLE_LIST = 'cacheable-list';
export const CacheableList = (): MethodDecorator => SetMetadata(CACHEABLE_LIST, true);

/**
 * How long a cached page of tasks may be served.
 *
 * Short on purpose. The generation counter below makes the cache coherent for
 * *this* process, so the TTL is not what protects a user from their own writes
 * — it is what bounds the damage if there is ever a second gateway replica,
 * whose counter this one knows nothing about. Five seconds is long enough to
 * absorb the bursts the cache exists for (a double-invoked effect, a
 * double-click, flipping a filter off and straight back on) and short enough
 * that a divergence nobody noticed cannot outlive a page view.
 */
export const TASK_LIST_CACHE_TTL_MS = 5_000;

/**
 * Builds the cache key for a page of tasks, and knows when a user's keys are
 * no longer good.
 *
 * **Why the key is safe.** The obvious key — the one `CacheInterceptor` uses if
 * you let it — is the request URL, and `GET /tasks?page=1&pageSize=8` is
 * byte-identical for every user of this system. The identity lives in the
 * `Authorization` header, which that key never sees, so the first user to load
 * page 1 would fill the cache and the second would be served the first one's
 * rows. Every tenancy control in this codebase — the `userId`-first repository
 * methods, the `updateMany` predicates narrowed on `{ id, userId }`, the
 * `404`-never-`403` rule — is undone by that one default.
 *
 * So `userId` is the *first* component of the key, it comes from the verified
 * access token and from nowhere the client can influence, and it is
 * percent-encoded so it cannot run into the next component. Two users on the
 * identical query string get different keys, which is asserted in
 * `test/task-cache.e2e-spec.ts` — and that test was mutation-checked by
 * removing `userId` from the key and confirming it fails.
 *
 * **Why the query string is sorted.** `?page=2&status=all` and
 * `?status=all&page=2` are the same question. Sorting makes them the same key;
 * without it they are two entries, which is a miss rather than a bug, but a
 * needless one.
 *
 * **Why there is a generation counter.** Without it a user who creates a task
 * would not see it: the dashboard invalidates its own query and refetches
 * immediately, and that refetch would be answered from the cache for the rest
 * of the TTL — a shipped feature regressing for a bonus mark. Bumping a number
 * that is part of the key retires every entry that user had, without scanning
 * the store or holding a key index. It is one integer per user who has written
 * in this process's lifetime and it is never evicted; that is a few dozen bytes
 * each, and moving the whole cache to Redis is the answer if it ever is not.
 */
@Injectable()
export class TaskListCache {
  private readonly generations = new Map<string, number>();

  /** The key a page of this user's tasks is stored under. */
  key(userId: string, url: string): string {
    const generation = this.generations.get(userId) ?? 0;
    return `tasks:list:${encodeURIComponent(userId)}:${generation}:${normalize(url)}`;
  }

  /**
   * Retires every key this user currently has, by moving them to a generation
   * nothing is stored under. Called after any write of theirs succeeds; the
   * orphaned entries expire on their own.
   */
  invalidate(userId: string): void {
    this.generations.set(userId, (this.generations.get(userId) ?? 0) + 1);
  }
}

/**
 * `path?a=1&b=2`, with the query sorted and an absent query left absent.
 *
 * Splits on the **first** `?` and keeps everything after it, which is what
 * Express's own parser does. `url.split('?')` kept only the first segment and
 * discarded the rest, so `/tasks?search=birthday?anything` was keyed as
 * `/tasks?search=birthday` while the handler answered a different question —
 * a cache serving an answer to a question nobody asked, in both directions.
 * Contained to one user, because `userId` prefixes the key, and unreachable
 * from the shipped client, which percent-encodes `?` to `%3F`. Found by an
 * adversarial review of this stage.
 */
function normalize(url: string): string {
  const start = url.indexOf('?');
  if (start < 0) {
    return url;
  }

  const params = new URLSearchParams(url.slice(start + 1));
  params.sort();
  return `${url.slice(0, start)}?${params.toString()}`;
}
