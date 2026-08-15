# Tally — build plan

Requirements source of truth: [BRIEF.md](BRIEF.md). Where this document conflicts with the brief, the brief wins.

**Product name:** Tally. **Repo:** `git@github.com:bkostic006-dev/TaskManager.git`.
Reviewers to invite at the end: `MFarrugiaCatena` (matthew.farrugia@catenamedia.com) and ricardo.gomes@catenamedia.com.

## Decisions

| Area       | Choice                                                                                                    | Why                                                                                                                                                   |
| ---------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo   | pnpm workspaces                                                                                           | 4 apps + 1 shared package; Nx is tooling noise at this size                                                                                           |
| Transport  | **HTTP** (`@nestjs/axios` → `HttpService`)                                                                | Brief allows any transport. Status codes propagate natively, healthchecks are real, and `HttpService` returns Observables so the RxJS bonus falls out |
| ORM        | **Prisma 6**                                                                                              | Boring and well documented. Prisma 7's ESM/driver-adapter changes buy nothing here                                                                    |
| Data       | One Postgres container, two databases (`auth_db`, `tasks_db`)                                             | Service boundary without container sprawl. No cross-DB foreign key — `Task.userId` is a plain column                                                  |
| Runtime    | `node:22-slim`                                                                                            | LTS to 2027, widest native-prebuild coverage (argon2). Not alpine                                                                                     |
| Backend    | NestJS 11                                                                                                 | 12 is still a preview                                                                                                                                 |
| Frontend   | Next 15 · React 19 · **Mantine 8** · TanStack Query 5                                                     | Mantine 8 is what `design/tokens.ts` was authored against — it drops in unmodified                                                                    |
| Auth       | Access JWT 15 min (HS256, in memory) + opaque refresh 7 d (httpOnly cookie, SHA-256 hashed), **rotation** | Rotation is the brief's only "must"                                                                                                                   |
| Validation | class-validator + global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`)              | Explicit brief requirement                                                                                                                            |
| Tests      | After each stage, on logic that branches. ~25 total                                                       | The brief never mentions testing; a proportionate suite is a professional-standards signal, not a discipline framework                                |

## Architecture

```
Next.js web :3000
      │  HTTP + credentials (CORS)
      ▼
API Gateway :3001 ── ValidationPipe · JwtAuthGuard · exception filter · logging interceptor · throttler
      │  HTTP over the internal docker network (services publish no ports)
      ├──▶ Auth Service :4001 ──▶ Postgres · auth_db
      └──▶ Task Service :4002 ──▶ Postgres · tasks_db
```

Gateway is the only public backend surface. It verifies the access JWT locally and passes `userId` downstream. Services own their own data and never import from each other — shared types live in `packages/contracts`.

```
apps/web · apps/gateway · apps/auth-service · apps/task-service
packages/contracts        shared types, route constants, error codes, DEMO_USER_ID
design/                   Tally design source — reference, not specification
docs/                     BRIEF.md, PLAN.md
docker-compose.yml · docker-compose.dev.yml · .env.example
```

Service shape: **controller → service (domain logic) → repository (Prisma)**. No hexagonal ceremony; one README line says why.

## Data

```
User(id, email unique, name, passwordHash, createdAt)
RefreshToken(id, userId, tokenHash unique, expiresAt, revokedAt?, replacedById?, createdAt)
Task(id, userId, title, description?, completed, completedAt?, createdAt, updatedAt)
```

No `dueDate` — not in the brief, and cutting it removes a timezone bug class. "Sorting by date" is satisfied by `createdAt`.

## API

| Method               | Route                                 | Success                                  |
| -------------------- | ------------------------------------- | ---------------------------------------- |
| POST                 | `/auth/signup`                        | 201 + refresh cookie                     |
| POST                 | `/auth/login`                         | 200 + `{ accessToken }` + refresh cookie |
| POST                 | `/auth/refresh`                       | 200 + rotated cookie                     |
| POST                 | `/auth/logout`                        | 204                                      |
| GET                  | `/auth/me`                            | 200                                      |
| GET · POST           | `/tasks`                              | 200 · 201                                |
| GET · PATCH · DELETE | `/tasks/:id`                          | 200 · 200 · 204                          |
| PATCH                | `/tasks/:id/complete` · `/uncomplete` | 200                                      |

**Errors:** `400` validation · `401` missing/expired/invalid token · `404` not found _or not yours_ · `409` email taken · `429` throttled · `500` unexpected · `503` upstream service unreachable or timed out. Uniform body `{ statusCode, error, message, details? }` from one global filter.

**List contract**

```
GET /tasks?page=1&pageSize=8&status=all|completed|pending
          &search=milk&sortBy=createdAt|completed|title&sortOrder=asc|desc
→ { data: Task[], meta: { page, pageSize, total, totalPages } }
```

- `page` ≥ 1 · `pageSize` ∈ {8, 16, 24, 48} — **out-of-range is rejected with 400, never silently clamped**
- `search` = case-insensitive contains on title + description
- `sortBy=completed` tie-breaks on `createdAt desc`; every sort ends with `id` so pagination is stable
- Completion is a domain action (`/complete`, `/uncomplete`), not a field edit. Re-completing is idempotent and does not re-stamp `completedAt`
- Every query is scoped by the JWT's `userId`. Another user's task is `404`, never `403`

**Seed:** demo user `dana@northbay.dev / tally-demo-2026` at a fixed `DEMO_USER_ID` from `contracts`, plus 47 tasks (31 pending, 16 done). Password minimum is 10 characters.

## Known traps

These cost real time if discovered late. All six came out of an adversarial review of an earlier plan.

1. **Refresh races.** Parallel 401s and React StrictMode both fire `/auth/refresh` twice. Use a **single-flight promise** on the client, and make rotation a compare-and-swap (`updateMany ... WHERE revokedAt IS NULL`, check the rowcount) — `update()` cannot express it. Reuse of a dead token returns `401`; revoking the whole chain is listed as a future improvement, not built.
2. **Retry only reads.** RxJS `timeout` + `retry` on every call would retry `POST` and create duplicates.
3. **Seed across two databases.** Both seeds reference `DEMO_USER_ID` from `contracts`; the task seed skips if tasks already exist, so a second `up` doesn't double the data.
4. **Login timing oracle.** Verify against a dummy hash when the email is unknown, or response time leaks which emails exist.
5. **Docker.** `prisma generate` in the build stage, `migrate deploy` in the entrypoint. `HOSTNAME=0.0.0.0` for Next standalone. Postgres port unpublished. `NEXT_PUBLIC_API_URL` is baked at build time — the browser needs `localhost:3001`.
6. **Cookies.** Gateway needs exact `origin` + `credentials: true`; axios needs `withCredentials: true`. `SameSite=Lax` works here because `localhost:3000`→`:3001` is same-site; it would need `None; Secure` across real domains.

## Stages

Each stage ends in something runnable and gets reviewed before the next begins.

- [x] **0 · Harness** — `CLAUDE.md`, format hook, `.gitignore`, this plan. — `1d88858`
- [x] **1 · Skeleton that boots** — pnpm workspace, `contracts`, four minimal apps, compose with
      Postgres, healthchecks, and a segmented network. — `24ce9f9` … `89dc08d`
      _Verified:_ cold `down -v && up --wait` → 5/5 healthy in 24s · `:3001/health` and
      `:3000/api/health` correct · both databases created · `web` cannot resolve
      `auth-service`/`task-service` · images 388/388/388/453MB.
- [x] **2 · Data layer** — Prisma schemas, migrations in the entrypoint, seeds. — `242dc84` … `2551267`
      _Verified:_ cold build + `down -v && up --wait` → 5/5 healthy · both migrations applied ·
      demo user id equals `DEMO_USER_ID` · 47 tasks (16 done / 31 pending) · **restart leaves
      47, not 94** · images 883/881MB for the data services (2.05GB total on disk, shared layers).
      **Also owns the Dockerfile change Prisma forces**: the runtime stage does its own
      `--prod` install and copies only `dist/`, so a client generated in the build stage
      never arrives. The runtime stage must copy `apps/<svc>/prisma/`, keep `prisma` as a
      production dependency (the CLI is needed for `migrate deploy`), and run
      `prisma generate` **after** its install. Without this the image starts and fails on
      first query.
      _Checkpoint:_ `down -v && up` from cold → tables, demo user, 47 tasks.
- [x] **3 · Auth end to end** — auth-service (argon2, CAS rotation), gateway DTOs, pipe, filter, interceptor, guard, cookies, RxJS timeout/retry. Tests for rotation. — `833583e` … `60a5078`
      `JWT_SECRET` added to compose and `.env.example` with a `${JWT_SECRET:-dev-only-…}`
      fallback, shared by auth-service (signing) and gateway (verification).
      ~~The fallback lives **only** in compose: both apps read it with `getOrThrow`, so a real
      deployment cannot inherit the placeholder by forgetting to set it.~~ **False, corrected in
      the fix pass below.** `getOrThrow` never fires, because the documented run path always
      supplies the variable — compose's own default is what it reads. Both apps now compare the
      configured secret against the placeholder at boot and warn loudly instead.
      _Verified:_ cold `down -v && up --build --wait` → 5/5 healthy in 37s · full curl path
      green — signup `201` + httpOnly cookie scoped to `/auth` (and no refresh token in the
      body) · duplicate `409` · login `200` · wrong password `401` · unknown email the
      **byte-identical** `401` at 107.8ms against 109.2ms for a real account, so the dummy
      hash closes the timing oracle · `/auth/me` `401`/`200` · refresh `200` with a rotated
      cookie · replayed cookie `401` · logout `204` · malformed signup `400` with per-field
      `details`. **Eight simultaneous refreshes of one token → exactly one `200` and seven
      `401`s**, which is the compare-and-swap holding against real Postgres rather than
      against a mock. `pnpm lint`, `pnpm -r typecheck`, 26 tests green.
      (The concurrency check was run at six and again at eight; eight is the number the README
      and this document both quote, and the one the fix pass re-ran.)
      _Deviation worth noting:_ logout answers `204` even when revocation fails upstream.
      A user told `503` cannot leave the state, and the cookie is cleared regardless; the
      unrevoked token expires on its own. Logged, not silently dropped.
      _Checkpoint:_ curl signup → login → refresh → me → logout, every status code correct.
- [x] **3.5 · Fix pass** — no new surface, only defects found by a cold brief-compliance audit
      and an adversarial security review of everything stages 0–3 shipped. Nothing was
      **violated** against the brief; these were real bugs behind a passing checkpoint.
      _Security:_ login CSRF closed by refusing form-encoded bodies (`bodyParser: false` plus
      `express.json()`) — the urlencoded parser Nest registers by default made
      `POST /auth/login` a CORS *simple* request, so a cross-origin form could log a victim into
      the attacker's account · rotation's revoke/insert/link made one transaction, so a failure
      after the revoke can no longer strand a user with a burned token · JWT verification pinned
      to `HS256` with `issuer`/`audience`, ahead of the RS256 migration where an unpinned
      algorithm list becomes algorithm confusion · the placeholder `JWT_SECRET` now warns at
      boot and is documented as a limitation, replacing a comment that claimed a protection
      which did not exist.
      _Correctness:_ `/auth/me` answers `401` rather than `404` for a deleted account, so a
      client clears its session instead of looping · malformed JSON is `400 VALIDATION`, not
      `400 INTERNAL` · the auth service validates `refreshToken` before dereferencing it
      (an empty `POST` was a `TypeError` → `500`) · ids are `encodeURIComponent`-escaped into
      internal URLs, and a non-uuid `sub` is rejected before it reaches a `@db.Uuid` column ·
      `WEB_ORIGIN` is required rather than defaulted, and the refresh cookie's `Secure` now
      comes from an explicit `COOKIE_SECURE` instead of being inferred from another origin's
      scheme.
      _Verified:_ `pnpm lint`, `pnpm -r typecheck`, **31 tests** green (26 before; the five new
      ones cover the rotation transaction, the pinned issuer/audience, the refused form post,
      and `/auth/me`'s `401`). Cold `down -v && up -d --build --wait` → **5/5 healthy in 183s**
      (a full rebuild; the earlier 37s figure was an incremental one). Both backends log the
      placeholder-secret warning at boot. Full auth path re-run against the running stack,
      **18/18** — signup `201` with an httpOnly cookie scoped to `/auth` and no refresh token
      in the body · duplicate `409` · login `200` · wrong password and unknown email the same
      `401` · `/auth/me` `401`/`200` · the README's demo credentials `200` · malformed signup
      `400` with per-field details · refresh `200` and rotated · replay `401` · logout `204`
      with the cookie cleared · refresh after logout `401`.
      _The two fixes that needed proving, not asserting:_ a form-encoded
      `POST /auth/login` is refused **`400 VALIDATION` with no `Set-Cookie`**, which is the CSRF
      path closed · **eight simultaneous refreshes of one token → exactly one `200` and seven
      `401`s**, so the compare-and-swap still holds now that it runs inside a transaction.
      _Also verified by forging tokens with the placeholder secret_ (it is published, which is
      the point): a valid signature naming a non-existent account is `401` not `404`; a non-uuid
      `sub` is `401` not `500`; and a correctly signed token with the wrong issuer, the wrong
      audience, or neither is refused. The control case — a forged token for `DEMO_USER_ID`
      returning `200` — is why the placeholder is now a documented README limitation.
      _Two claims checked rather than trusted, per the compliance rule:_ an empty `POST` and a
      bodyless `POST` to the auth service's internal `refresh` and `logout` (issued from inside
      the gateway container, which is the only thing that can reach them) both answer
      `400 VALIDATION` instead of crashing · the gateway really does refuse to boot on a bad
      config — `COOKIE_SECURE=maybe` exits 1 with `COOKIE_SECURE must be "true" or "false"`, and
      an unset `WEB_ORIGIN` exits 1 with `Configuration key "WEB_ORIGIN" does not exist`.
      No `ERROR` or unhandled exception in any service log across the whole run.
- [ ] **4 · Tasks end to end** — CRUD, completion, list query. Tests for the query builder and completion transitions.
      **Two things this stage must build that are easy to miss, both found by the stage-3 audit:**
      1. **task-service needs its own `DomainExceptionFilter`.** auth-service registers one via
         `APP_FILTER` in its `app.module.ts`; task-service has no equivalent. Without it a
         `DomainError` leaves as an unshaped `500`, the gateway's `UpstreamService` cannot read
         an `error` code it recognises back off the body, and every domain failure becomes
         `503`. "Another user's task is `404`" would silently become `503` — which is precisely
         what this stage's checkpoint tests, so it would fail in a way that looks like a
         networking problem.
      2. **Numeric query fields need `@Type(() => Number)`.** The gateway's global pipe sets
         `transform: true` but not `enableImplicitConversion`, so `page=1` arrives as the
         string `'1'` and fails `@IsInt()` with a `400`. Applies to `page` and `pageSize`.
      _Checkpoint:_ curl CRUD, pagination, filter, sort, and a `404` on another user's task.
- [ ] **5 · Frontend auth** — Next + Mantine + Tally tokens, login/signup, session restore, single-flight refresh interceptor.
      **Owns the brief's "API interaction should be abstracted using reusable hooks or
      service functions"** as a named deliverable, not a side effect: one `api-client.ts`
      holding the axios instance and the refresh interceptor, and typed hooks over it.
      Installing TanStack Query does not satisfy this on its own.
      _Checkpoint:_ log in in the browser; survives a hard refresh, and no component calls
      `fetch`/axios directly.
- [ ] **6 · Frontend tasks** — dashboard, create/edit/delete/complete, pagination, filter, sort, search, loading states, toasts, responsive.
      _Checkpoint:_ the brief's four frontend requirements demonstrated at 360 / 768 / 1280.
- [ ] **7 · Bonus** — throttler, cache on the list endpoint, retry audit.
      **The cache is a tenancy bug waiting to happen.** NestJS's `CacheInterceptor` keys on the
      request URL, and `GET /tasks?page=1` is byte-identical for every user — the identity lives
      in the `Authorization` header, which the default key never sees. Dropped in naively, the
      first user to load page 1 fills the cache and the second is served *their rows*. The whole
      point of "every task query is scoped by the JWT's `userId`" is undone by a decorator added
      for a bonus mark. Either override `trackBy` to fold `request.user.userId` into the key, or
      cache inside the task service where the query already carries the user. **Needs a test that
      two different users issuing the identical query string get different rows** — a cache-hit
      log line proves the cache works, not that it is safe.
      _Checkpoint:_ `429` on rapid auth; cache hit visible in logs; the two-user cache test green.
- [ ] **8 · Ship** — README, fresh-clone test on a clean machine, invite reviewers.
      _Checkpoint:_ you clone it somewhere clean and it runs.

## Brief coverage

Every requirement in `BRIEF.md` and the stage that owns it. This is a map, not a status
board — status comes from the checkboxes above and from `git log`. Its job is to make an
orphaned requirement obvious. Re-audited with fresh eyes at stages 4 and 8.

| Brief requirement                                            | Owner   |
| ------------------------------------------------------------ | ------- |
| React · TypeScript · Next.js · CSS framework                 | 1 ✓     |
| Node.js with NestJS                                          | 1 ✓     |
| Microservice split: gateway, auth service, task service      | 1 ✓     |
| Docker + docker-compose for local orchestration              | 1 ✓     |
| PostgreSQL                                                   | 1 ✓ / 2 |
| Prisma or TypeORM                                            | 2       |
| Services communicate over a transport layer                  | 3       |
| Sign up and log in via the API Gateway                       | 3       |
| JWTs with access + refresh tokens                            | 3       |
| **Refresh token rotation** (the brief's only "must")         | 3       |
| Gateway: global validation, request logging, guards, filters | 3       |
| DTOs and validators                                          | 3       |
| Consistent HTTP status codes · global exception handling     | 3       |
| Auth service encapsulates all user logic                     | 3       |
| Task CRUD + mark complete; completion business logic         | 4       |
| Pagination with page size and page selector                  | 4 · 6   |
| Filtering by completion status and keyword                   | 4 · 6   |
| Sorting by date and completion status                        | 4 · 6   |
| Task service reachable only via the gateway, authenticated   | 1 ✓ · 4 |
| API abstracted behind reusable hooks or service functions    | 5       |
| Fully responsive · loading indicators · toasts               | 6       |
| Clean architecture across services                           | 3 · 4   |
| Bonus: rate limiting and caching                             | 7       |
| Bonus: RxJS for service comms / retry                        | 3 · 7   |
| README: run locally · trade-offs · limitations               | 1 ✓ · 8 |
| GitHub repo + access for both reviewers                      | 8       |
| Clear and meaningful commit history                          | ongoing |

## README (required sections)

The brief names three: **how to run locally** · **key design decisions and trade-offs** · **known limitations and future improvements**. Plus an architecture diagram (mermaid renders on GitHub).

Trade-offs worth writing: HTTP over TCP transport · two databases in one container · access token in memory + refresh in an httpOnly cookie · SHA-256 for opaque refresh tokens vs argon2 for passwords · gateway-local HS256 verification (RS256 in production) · `404` rather than `403` for other users' tasks · CSR-only protected pages.

Limitations / future: reuse-detection chain revocation · access tokens can't be revoked before expiry · Playwright journeys · no user deletion, so task rows would orphan · RS256/JWKS · Redis-backed throttling and cache.

## Out of scope

Labels, subtasks, due dates, dark mode, workspaces, "stay signed in", password reset, social login, email verification, Redis, message brokers, CQRS, k8s. Named in the README so they read as decisions rather than omissions.
