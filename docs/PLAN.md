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
- [ ] **2 · Data layer** — Prisma schemas, migrations in the entrypoint, seeds.
      **Also owns the Dockerfile change Prisma forces**: the runtime stage does its own
      `--prod` install and copies only `dist/`, so a client generated in the build stage
      never arrives. The runtime stage must copy `apps/<svc>/prisma/`, keep `prisma` as a
      production dependency (the CLI is needed for `migrate deploy`), and run
      `prisma generate` **after** its install. Without this the image starts and fails on
      first query.
      _Checkpoint:_ `down -v && up` from cold → tables, demo user, 47 tasks.
- [ ] **3 · Auth end to end** — auth-service (argon2, CAS rotation), gateway DTOs, pipe, filter, interceptor, guard, cookies, RxJS timeout/retry. Tests for rotation.
      **Must add `JWT_SECRET` to compose and `.env.example`** with a `${JWT_SECRET:-dev-only-…}`
      fallback, shared by auth-service (signing) and gateway (verification) — otherwise the
      zero-step boot breaks for the reviewer on the first protected request.
      _Checkpoint:_ curl signup → login → refresh → me → logout, every status code correct.
- [ ] **4 · Tasks end to end** — CRUD, completion, list query. Tests for the query builder and completion transitions.
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
      _Checkpoint:_ `429` on rapid auth; cache hit visible in logs.
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
