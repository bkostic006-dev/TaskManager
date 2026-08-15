# Tally — build plan

Requirements source of truth: [BRIEF.md](BRIEF.md). Where this document conflicts with the brief, the brief wins.

**Product name:** Tally. **Repo:** `git@github.com:bkostic006-dev/TaskManager.git`.
Reviewers to invite at the end: `MFarrugiaCatena` (matthew.farrugia@catenamedia.com) and ricardo.gomes@catenamedia.com.

## Decisions

| Area       | Choice                                                                                                    | Why                                                                                                                                                   |
| ---------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo   | pnpm workspaces                                                                                           | 4 apps + 1 shared package; Nx is tooling noise at this size                                                                                           |
| Transport  | **HTTP** (`@nestjs/axios` → `HttpService`)                                                                | Brief allows any transport. Status codes propagate natively, healthchecks are real, and `HttpService` returns Observables so the RxJS bonus falls out |
| ORM        | **Prisma 6** (6.19.3; 7.9.1 is current — see _Versioning_ below)                                          | Boring and well documented. Prisma 7's ESM/driver-adapter changes buy nothing here                                                                    |
| Data       | One Postgres container, two databases (`auth_db`, `tasks_db`)                                             | Service boundary without container sprawl. No cross-DB foreign key — `Task.userId` is a plain column                                                  |
| Runtime    | `node:22-slim`                                                                                            | LTS to 2027, widest native-prebuild coverage (argon2). Not alpine                                                                                     |
| Backend    | NestJS 11                                                                                                 | 12 is still a preview                                                                                                                                 |
| Frontend   | Next 15 · React 19 · **Mantine 8** · TanStack Query 5                                                     | Mantine 8 is what `design/tokens.ts` was authored against — it drops in unmodified                                                                    |
| Auth       | Access JWT 15 min (HS256, in memory) + opaque refresh 7 d (httpOnly cookie, SHA-256 hashed), **rotation** | Rotation is the brief's only "must"                                                                                                                   |
| Validation | class-validator + global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`)              | Explicit brief requirement                                                                                                                            |
| Tests      | After each stage, on logic that branches. ~25 total                                                       | The brief never mentions testing; a proportionate suite is a professional-standards signal, not a discipline framework                                |

### Versioning

Checked 2026-08-15. We are behind current on three majors, deliberately:

| Package                 | Ours     | Current  | Call                                                                    |
| ----------------------- | -------- | -------- | ----------------------------------------------------------------------- |
| `prisma` / `@prisma/client` | 6.19.3   | 7.9.1    | **Stay.** Revisit only as a README future-improvement                   |
| `next`                  | 15.5.23  | 16.3.1   | **Stay.** No brief requirement, and the Docker build is working         |
| `@mantine/core`         | 8.3.18   | 9.5.1    | **Stay.** `design/tokens.ts` was authored against 8 and drops in unmodified |
| `@nestjs/core`          | 11.x     | 11.2.1   | Current already                                                         |
| `@tanstack/react-query` | 5.x      | 5.101.4  | Current major already                                                   |

The brief is explicit that library versions are **unspecified** and that nothing requires latest
majors. An earlier planning pass chose four bleeding-edge majors for a rubric nobody had read,
and reading the brief deleted them — that is a mistake this document should not re-make from the
other direction.

**A major upgrade at the end is the worst available timing**: it lands after everything works,
immediately before submission, with no slack to recover. Prisma 7 in particular changes ESM and
driver-adapter handling, which is exactly the machinery the two Dockerfiles already fight
(`prisma generate` after the runtime `--prod` install). The upgrade buys no requirement in the
brief and risks the one thing the brief does demand: that `docker compose up` works for a
reviewer.

So: **not upgrading**, and the reason is recorded as a deliberate trade-off in the README's
"known limitations and future improvements" section — which the brief asks for by name. That
turns a version gap into a demonstrated decision instead of an oversight.

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

**Errors:** `400` validation · `401` missing/expired/invalid token · `404` not found _or not yours_ · `409` email taken · `413` body over the gateway's JSON limit · `429` throttled · `500` unexpected · `503` upstream service unreachable or timed out. Uniform body `{ statusCode, error, message, details? }` from one global filter.

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
5. **Docker.** `prisma generate` in the build stage, `migrate deploy` in the entrypoint. `HOSTNAME=0.0.0.0` for Next standalone. Postgres port unpublished. `NEXT_PUBLIC_API_URL` is baked at build time — the browser needs `localhost:3001`. Because it is
   baked, **changing `GATEWAY_PORT` requires `--build`, not a restart**: `up -d` alone relaunches
   the old bundle still pointing at the old port, and the failure looks like CORS.
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
      `getOrThrow` never fires, because the documented run path always supplies the variable —
      compose's own default is what it reads. Both apps compare the configured secret against
      the placeholder at boot and warn loudly instead.
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
      `POST /auth/login` a CORS _simple_ request, so a cross-origin form could log a victim into
      the attacker's account · rotation's revoke/insert/link made one transaction, so a failure
      after the revoke can no longer strand a user with a burned token · JWT verification pinned
      to `HS256` with `issuer`/`audience`, ahead of the RS256 migration where an unpinned
      algorithm list becomes algorithm confusion · the placeholder `JWT_SECRET` now warns at
      boot and is documented as a limitation, replacing a comment that claimed a protection
      which did not exist.
      _Correctness:_ `/auth/me` answers `401` rather than `404` for a deleted account, so a
      client clears its session instead of looping · **syntactically** malformed JSON is
      `400 VALIDATION`, not `400 INTERNAL` (narrower than this line first claimed — two other
      malformed-body classes still returned `500` until stage 3.6) · the auth service validates
      `refreshToken` before dereferencing it
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
- [x] **3.6 · Second fix pass** — the stage-3.5 fix pass was itself the product of an adversarial
      review, so it had never been attacked. A hostile reviewer was briefed against the running
      stack to break it rather than confirm it. — `cee60fd` … `e72c447`
      **What held**, which is the more useful half: `alg:none` (with and without a junk
      signature), an empty signature, a wrong-key signature, and `kid`/`jku` header injection are
      all `401` — the HS256 pinning is real, and no key is ever fetched. Rotation is
      **understated** in the notes above, not overstated: one `200` out of **twenty** parallel
      refreshes, not eight, and `expiresAt` is genuinely enforced rather than only `revokedAt`.
      Path traversal through `sub`, prototype-pollution keys, the CORS origin matcher, the
      content-type matrix on login, and the timing-oracle equaliser all held. Nothing leaked a
      stack, a Prisma error, or an internal hostname to any client.
      **Four defects fixed:** an oversized body was `500` where `413` is honest, and an
      over-nested one `500` where Nest's own recursive `stripProtoKeys` overflowed the stack ·
      the verifier pinned algorithm, issuer and audience but never expiry, so a token whose `exp`
      was deleted or set a century out was accepted · the guard read `claims.sub` untyped, so a
      forged `sub: ["<uuid>"]` became the caller's identity — contained today, and load-bearing
      for stage 4, where `userId` reaches a query builder · `/auth/refresh` and `/auth/logout`
      take their credential from the cookie, so the login CSRF fix never covered them.
      _Verified, each one re-run by the orchestrator rather than taken on report:_ 150KB body
      `500`→`413`, and the depth branch stays reachable under the new 32kb limit (5 000-deep
      objects and 15 000-deep arrays both `400`, while a 60KB payload is refused on size first) ·
      forged tokens with no `exp`, no `iat`, or `exp` +100y against an hour-old `iat` are all
      `200`→`401`, and `sub: ["<uuid>"]` is `200`→`401` · hostile-origin `refresh`/`logout`
      `200`/`204`→`401` **with the session surviving both attempts**, while curl with no `Origin`
      and the browser's correct `Origin` still succeed. `pnpm lint`, `pnpm -r typecheck`, **36
      tests** green (31 before).
      _A claim rejected rather than shipped:_ `requireExp` is the natural companion to `maxAge`
      and **does not exist in `jsonwebtoken@9`** — passing it, an exp-less token still verifies.
      Confirmed in the installed source. `exp` presence is asserted in the guard instead, so the
      protection is real rather than decorative. This is the third time this project has caught a
      comment claiming a protection that did not exist.
      _Known and accepted:_ `maxAge` measures from `iat`, so a token with a far-future `exp` and a
      **fresh** `iat` is spendable for its normal 15 minutes and then dead. The property now
      guaranteed is "no access token is accepted more than `ACCESS_TOKEN_TTL` after it was
      minted, whatever its `exp` says" — stated that way rather than as "`exp` is enforced",
      which would be the overclaim. Requiring `exp == iat + TTL` would hardcode the policy a
      second time and break every login if the signer's TTL drifted.
      _Residual, documented not fixed:_ under a future `SameSite=None` deployment the origin
      check is what stops forced-logout CSRF; a browser always sends `Origin` on a cross-site
      POST, but this is defence for a configuration this repo does not ship.
- [x] **4 · Tasks end to end** — CRUD, completion, list query. Tests for the query builder and
      completion transitions. — `1603465` … `3e68047`
      _Decision made here:_ the internal hop carries `userId` **in the path**
      (`/users/:userId/tasks`), because a route that cannot be constructed without the tenant key
      cannot be called without it. Every task-service repository method takes `userId` as its
      first argument with no overload omitting it, so a query that forgets the tenant key does
      not compile — the tenancy rule is kept by the type system, not by remembering. Writes are
      `updateMany`/`deleteMany` narrowed on `{ id, userId }` rather than `update`/`delete` on the
      primary key: a unique-key write cannot express the scope, so it would need a preceding
      read, and between that read and the write the row's owner is taken on trust.
      _Verified against the running stack, re-run by the orchestrator rather than taken on
      report:_ CRUD round trip `201`/`200`/`200`/`204` then `404` · **all five routes answer
      `404` for another user's task — not `403`, and no `503` anywhere**, which is what proves
      the new filter is actually wired; the owner's copy was untouched afterwards, the row never
      appeared in the other user's list, and no response exposes `userId` · `pageSize=7`,
      `page=0`, `page=abc`, `status=maybe`, `sortBy=dueDate`, `sortOrder=sideways` all `400`
      with the field named, while `pageSize=8` and `48` are `200` · filter totals 47 / 16 / 31
      with every row in each page matching the filter · walking all six pages of
      `sortBy=completed` (16 rows tied on the sort column) yields 47 distinct ids matching a
      single 48-row fetch, so the `id` tie-break really does make pagination stable across a
      page boundary · `search` matches a term that appears **only in a description**, and is
      case-insensitive · re-completing three times leaves `completedAt` **and `updatedAt`
      unchanged** — the stronger signal, since it shows the no-op path issues no write at all —
      while a genuine transition after `uncomplete` does stamp a new time ·
      `PATCH {"completed":true}` is `400`, so completion is unreachable as a field edit · all
      seven routes `401` without a token. `pnpm lint`, `pnpm -r typecheck`, **49 tests** green
      (36 before; 13 new).
      **Three things this stage had to build that were easy to miss:** 1. **task-service needs its own `DomainExceptionFilter`.** auth-service registers one via
      `APP_FILTER` in its `app.module.ts`; task-service has no equivalent. Without it a
      `DomainError` leaves as an unshaped `500`, the gateway's `UpstreamService` cannot read
      an `error` code it recognises back off the body, and every domain failure becomes
      `503`. "Another user's task is `404`" would silently become `503` — which is precisely
      what this stage's checkpoint tests, so it would fail in a way that looks like a
      networking problem. 2. **Numeric query fields need `@Type(() => Number)`.** The gateway's global pipe sets
      `transform: true` but not `enableImplicitConversion`, so `page=1` arrives as the
      string `'1'` and fails `@IsInt()` with a `400`. Applies to `page` and `pageSize`. 3. **`UpstreamService` has only `get` and `post`.** This stage needs `PATCH` and `DELETE`,
      and there is no obvious home for them — so the tempting move is to reach for
      `HttpService` at the call site, which silently escapes both guarantees the class exists
      to hold (`timeout(3000)`, and retry on reads only). The new verbs belong in that file,
      **non-retrying**: a repeated `DELETE` is idempotent but a repeated `PATCH` is not, and
      the policy is decided there rather than per call site precisely so "just this once"
      is not a one-line change.
      Also: every task-service repository method takes `userId` as its **first argument**, so
      tenancy scoping is enforced by the type system rather than by remembering. Stage 3.6's
      guard fix guarantees that `userId` is a string before it ever reaches one.
      _Checkpoint:_ curl CRUD, pagination, filter, sort, and a `404` on another user's task.
- [x] **5 · Frontend auth** — Next + Mantine + Tally tokens, login/signup, session restore,
      single-flight refresh interceptor. — `4e9da83` … `d596f07`
      _Verified, re-run by the orchestrator:_ the abstraction is real and mechanical — `axios`
      appears in `apps/web/src` only in `lib/api-client.ts` (plus its spec and the manual live
      check), `fetch(` and `XMLHttpRequest` appear nowhere, and only `hooks/use-auth.ts` imports
      the client; every page and component goes through a hook · `/login` and `/signup` serve
      their real mockup copy, `/dashboard` is client-gated · `NEXT_PUBLIC_API_URL` is baked into
      the shipped chunk as `http://localhost:3001`, not a container hostname · **trap 2 is
      closed**: with `Origin: http://localhost:3000` the preflight is `204` with
      `ACAO`/`ACAC`, login `200` sets an `HttpOnly; Path=/auth; SameSite=Lax` cookie with no
      refresh token in the body, **refresh `200` and rotates**, logout `204`; the same live
      cookie from `https://evil.example` is `401` on both and **the session survives** ·
      against the live gateway, a hard refresh restores from the cookie with one refresh call,
      and 20 parallel `401`s yield **max concurrent refreshes = 1** with the session intact.
      `pnpm lint`, `pnpm -r typecheck`, **56 tests** green (49 before).
      _The tests were mutation-checked rather than trusted:_ changing `??=` to `=` in the
      coordinator fails exactly the two concurrency tests, and the live check then reproduces
      the real symptom — `ApiRequestError: That session has expired. Log in again.` That is the
      random-logout bug this stage exists to prevent, demonstrated and then fixed.
      **Not verified — needs a human with a browser, and stage 6 must close it:** an actual
      click-through to `/dashboard`; that a real browser sends and stores the refresh cookie on
      the cross-origin XHR (the live check simulates the jar); the StrictMode double-invoke
      under `next dev` (`reactStrictMode: true` is now set explicitly, because Next's default is
      version-dependent and asserting it would be a guess); that F5 keeps you signed in as a
      gesture rather than as a mechanism; and that toasts, the submit spinner and the redirects
      behave. None of this was described as working — it was not observed.
      _Also added:_ `jest`/`ts-jest` to `apps/web`, which had no test runner.
      **Owns the brief's "API interaction should be abstracted using reusable hooks or
      service functions"** as a named deliverable, not a side effect: one `api-client.ts`
      holding the axios instance and the refresh interceptor, and typed hooks over it.
      Installing TanStack Query does not satisfy this on its own.
      **The single-flight refresh promise is mandatory, not a nicety — this is the one place
      where two correct features destroy each other.** On boot the app calls `/auth/refresh`;
      React StrictMode double-invokes that effect in development; parallel `401`s fan out into
      more. Rotation is a compare-and-swap, so the second request is answered `401` — correctly —
      and the client logs the user out. It presents as "I get randomly logged out", reads as
      flakiness rather than a race, and eats hours. Trap 1 in this document, and the only trap
      that spans two stages: the server half shipped in stage 3, the client half ships here.
      _Checkpoint:_ log in in the browser; survives a hard refresh, and no component calls
      `fetch`/axios directly. Also load the app with StrictMode on and confirm the session
      survives the double-invoked boot refresh.
- [ ] **6 · Frontend tasks** — dashboard, create/edit/delete/complete, pagination, filter, sort, search, loading states, toasts, responsive.
      **The softest estimate in this plan.** Every prior version of this stage ran roughly 2×
      over, because judging a rendered page is a human loop that does not compress. Budget for
      that rather than discovering it.
      **Gate on the brief's four frontend items — responsive, loading indicators, toasts, hooks
      abstraction — and on nothing else.** `design/` removes decisions; it is not a specification
      to match. This project's single most expensive mistake was treating mockup fidelity as a
      gate, which turned an accelerator into hours of pixel arbitration. If a screen looks close
      and behaves correctly, it is done. When time pressure arrives, **fidelity yields first; the
      four compliance items do not.**
      _Checkpoint:_ the brief's four frontend requirements demonstrated at 360 / 768 / 1280.
- [ ] **7 · Bonus** — throttler, cache on the list endpoint, retry audit.
      **Throttle per route, not one global limit.** A single app-wide ceiling is the wrong shape:
      it is simultaneously too loose for `/auth/login` and `/auth/signup`, where the thing worth
      limiting is credential guessing and account farming, and too tight for `GET /tasks`, which
      a legitimate dashboard hits on every filter, sort and page change. One number cannot serve
      both, and tuning it to protect login makes normal browsing hit `429`. Use `@Throttle()` per
      controller or handler with a strict limit on the auth writes and a generous one on the task
      reads, and say in the README why the two differ.
      **The cache is a tenancy bug waiting to happen.** NestJS's `CacheInterceptor` keys on the
      request URL, and `GET /tasks?page=1` is byte-identical for every user — the identity lives
      in the `Authorization` header, which the default key never sees. Dropped in naively, the
      first user to load page 1 fills the cache and the second is served _their rows_. The whole
      point of "every task query is scoped by the JWT's `userId`" is undone by a decorator added
      for a bonus mark. Either override `trackBy` to fold `request.user.userId` into the key, or
      cache inside the task service where the query already carries the user. **Needs a test that
      two different users issuing the identical query string get different rows** — a cache-hit
      log line proves the cache works, not that it is safe.
      _Checkpoint:_ `429` on rapid auth; cache hit visible in logs; the two-user cache test green.
- [ ] **8 · Ship** — README, fresh-clone test on a clean machine, invite reviewers.
      **Do not send-and-assume.** The repo is private, so access depends on an invitation
      being accepted. `MFarrugiaCatena` is verified to exist and is Matthew Farrugia. Ricardo
      is given only as an email — GitHub can invite by address, but silently does nothing if
      it is not attached to an account, and that failure is invisible from our side.
      After inviting, confirm **two** pending invitations:
      `gh api repos/bkostic006-dev/TaskManager/invitations --jq '.[].invitee.login'`
      If one is missing, ask the recruiter for the GitHub username the same day. Making the
      repo public is the zero-risk fallback and the brief explicitly permits it.
      **Invite the reviewers early — do not leave it to this stage.** It is the one step where
      "works locally" and "submitted" diverge, and the only requirement with no fallback if
      something goes wrong at the end. An invitation costs nothing to send now and nothing to
      re-send; a failure to send it on the last day cannot be recovered. Needs a human: it grants
      two real people access to the repo.
      _Checkpoint:_ you clone it somewhere clean and it runs.

## Final QA

Executed once at stage 8 against the finished app, but **written as we go** — a list composed
at the end is composed from memory of what was built, not from the brief, so it omits exactly
what was forgotten. Each stage appends its checkpoint here as it closes.

- **Stages 1–4 checkpoints** are the backend QA and are recorded per stage above: cold boot to
  5/5 healthy · both databases seeded 47/16/31 · the full auth curl path with every status
  asserted · rotation under 8 concurrent refreshes · tenancy returning `404` (never `403`,
  never `503`) on all five task routes · the query contract rejecting every out-of-range
  parameter · pagination stable across a tie boundary · completion idempotent by `updatedAt`.
- **Stage 5–6 additions:** the four frontend requirements the brief names — fully responsive,
  loading indicators, toasts, and API access behind reusable hooks — checked at 360/768/1280,
  plus a hard refresh keeping the session and a forced API failure showing the error path.
- **Stage 7 additions:** `429` on rapid auth calls, and a cache test proving two users on a
  byte-identical query string get different rows.
- **Stage 8:** fresh clone **as a non-owner account**, `docker compose up`, demo login,
  paginate and filter. Cloning your own private repo uses credentials the reviewer does not
  have, so the owner's clone proves nothing about their experience.

Two open notes to resolve in their stages:

- **Throttling is per route, not one global limit.** The brief says "where applicable"; auth
  endpoints need a tight limit and the task list does not want the same one. Stage 7.
- **Re-check microservice adherence** against the brief's "Backend Service Responsibilities"
  section once all three services carry real code — the split has only been judged on the auth
  and task paths so far. Stage 8's compliance pass.

## Brief coverage

Every requirement in `BRIEF.md` and the stage that owns it. This is a map, not a status
board — status comes from the checkboxes above and from `git log`. Its job is to make an
orphaned requirement obvious. Re-audited with fresh eyes at stages 4 and 8.

| Brief requirement                                            | Owner     |
| ------------------------------------------------------------ | --------- |
| React · TypeScript · Next.js · CSS framework                 | 1 ✓       |
| Node.js with NestJS                                          | 1 ✓       |
| Microservice split: gateway, auth service, task service      | 1 ✓       |
| Docker + docker-compose for local orchestration              | 1 ✓       |
| PostgreSQL                                                   | 1 ✓ / 2   |
| Prisma or TypeORM                                            | 2 ✓       |
| Services communicate over a transport layer                  | 3 ✓       |
| Sign up and log in via the API Gateway                       | 3 ✓       |
| JWTs with access + refresh tokens                            | 3 ✓       |
| **Refresh token rotation** (the brief's only "must")         | 3 ✓       |
| Gateway: global validation, request logging, guards, filters | 3 ✓       |
| DTOs and validators                                          | 3 ✓ · 4 ✓ |
| Consistent HTTP status codes · global exception handling     | 3 ✓ · 4 ✓ |
| Auth service encapsulates all user logic                     | 3 ✓       |
| Task CRUD + mark complete; completion business logic         | 4 ✓       |
| Pagination with page size and page selector                  | 4 ✓ · 6   |
| Filtering by completion status and keyword                   | 4 ✓ · 6   |
| Sorting by date and completion status                        | 4 ✓ · 6   |
| Task service reachable only via the gateway, authenticated   | 1 ✓ · 4 ✓ |
| API abstracted behind reusable hooks or service functions    | 5 ✓       |
| Fully responsive · loading indicators · toasts               | 6         |
| Clean architecture across services                           | 3 ✓ · 4 ✓ |
| Bonus: rate limiting and caching                             | 7         |
| Bonus: RxJS for service comms / retry                        | 3 · 7     |
| README: run locally · trade-offs · limitations               | 1 ✓ · 8   |
| GitHub repo + access for both reviewers                      | 8         |
| Clear and meaningful commit history                          | ongoing   |

## README (required sections)

The brief names three: **how to run locally** · **key design decisions and trade-offs** · **known limitations and future improvements**. Plus an architecture diagram (mermaid renders on GitHub).

Trade-offs worth writing: HTTP over TCP transport · two databases in one container · access token in memory + refresh in an httpOnly cookie · SHA-256 for opaque refresh tokens vs argon2 for passwords · gateway-local HS256 verification (RS256 in production) · `404` rather than `403` for other users' tasks · CSR-only protected pages · **staying on Prisma 6, Next 15 and Mantine 8 rather than chasing latest majors** (see _Versioning_).

**Two the stage-4 architecture audit says belong here rather than only in a code comment**, because a reviewer reading the docs will not find them otherwise:

1. **The task service authenticates nobody — reachability _is_ the authorization.** The brief asks for a task service "only accessible to authenticated users via the API Gateway". What this stack delivers is _only reachable via the gateway, which authenticates_. That satisfies the requirement for every path a user can take — the service publishes no port, sits on an `internal: true` network with no egress, and `apps/task-service` does not even depend on `@nestjs/jwt` — but the property held is "unauthenticated calls are unreachable", not "unauthenticated calls are refused". Verified: anything already on that network can read or write any user's tasks with no credential. Say so plainly and name the condition it rests on.
2. **A `503` on a write means the gateway stopped waiting, not that nothing happened.** `UpstreamService`'s `timeout(3000)` abandons the response, not the downstream work. Measured with `task-service` paused: `POST /tasks` answers `503` after 3.01s and never retries, `GET /tasks` after 6.11s having retried once — the retry policy behaving exactly as designed — and when the service came back, **the task the client was told had failed existed anyway**. Retrying reads only is what stops the gateway _duplicating_ a write; nothing at this scope can stop one abandoned write landing. Idempotency keys are the real fix and are explicitly out of scope.

Limitations / future: reuse-detection chain revocation · access tokens can't be revoked before expiry · Playwright journeys · no user deletion, so task rows would orphan · RS256/JWKS · Redis-backed throttling and cache.

## Out of scope

Labels, subtasks, due dates, dark mode, workspaces, "stay signed in", password reset, social login, email verification, Redis, message brokers, CQRS, k8s. Named in the README so they read as decisions rather than omissions.
