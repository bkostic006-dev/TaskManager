# Tally — task manager (Catena take-home)

Requirements: `docs/BRIEF.md` (source of truth). Plan and stages: `docs/PLAN.md`. Read the current stage before writing code.

## Layout

`apps/web` (Next 15 · Mantine 8 · TanStack Query) · `apps/gateway` (NestJS, the only public surface) · `apps/auth-service` · `apps/task-service` (both NestJS + Prisma 6, no published ports) · `packages/contracts` (shared types, route constants, error codes) · `design/` (Tally design source — local only, gitignored).

## Commands

```bash
pnpm --filter <app> dev | build | test | lint
pnpm -r typecheck
docker compose up --build              # the reviewer's path — keep it working
docker compose down -v                 # full reset
docker compose -f docker-compose.yml -f docker-compose.dev.yml up postgres
pnpm --filter <service> exec prisma migrate dev --name <name>
```

## Environment quirks (this machine)

- **`pnpm` is not on PATH** — invoke it as `corepack pnpm …`.
- **`docker` may not be on PATH** — full path is `C:\Program Files\Docker\Docker\resources\bin\docker.exe`. Docker Desktop must be running before any `docker` command works.
- **`pnpm --filter @tally/web build` fails on the host** with `EPERM … symlink`. Next's standalone output creates symlinks, which Windows blocks without Developer Mode. It builds correctly inside Docker, so this never affects what ships — but `pnpm -r build` will always show that one failure locally.
- A **native PostgreSQL already owns port 5432** here. It cannot collide with ours, because compose never publishes the database.
- **No `python` and no `jq`.** Verification scripts that parse JSON have to use `grep`/`cut`/`sed`, or Node. The Windows Store shim answers `python` and prints an advert instead of failing, so a script using it appears to run and silently produces empty variables.

## Hard rules

- **Services never import from each other.** Shared types go through `@tally/contracts`.
- **DTOs and validation live in the gateway.** Services still guard their own invariants.
- **Every task query is scoped by the JWT's `userId`.** Another user's task is `404`, never `403`.
- **Every downstream call is piped through `timeout(3000)`; retry reads only** — retrying a POST creates duplicates.
- **Status codes and error bodies come from the plan's API table**, via one global exception filter. Uniform shape `{ statusCode, error, message, details? }`.
- Never hand-edit migrations or generated Prisma clients.
- Conventional commits, small and imperative. Several per stage, no `wip`.

## Every stage ends with a compliance check

Before a stage's checkpoint closes:

1. **Re-read `docs/BRIEF.md`** and confirm what the stage just built actually satisfies the
   requirements it claimed — from the code, not from the plan. Update the coverage table in
   `docs/PLAN.md` if anything moved.
2. **Never assert a property you have not tested.** A comment saying "cannot happen", "refuses
   to start", or "is indistinguishable" is a claim, and every one this project shipped turned
   out false. Verify it and say what you ran, or describe what the code does and stop.
3. **If the stage touched auth, tenancy, or a trust boundary**, run an adversarial review — a
   subagent briefed to attack it, not to confirm it. That is what caught the problems a
   checklist did not.

## Tests

Written **after** the code in each stage works, covering logic that actually branches: token rotation, the list query builder, completion transitions, and gateway status-code/validation checks. **81 across 15 spec files** (51 unit · 30 e2e), measured after stage 7 — the target started at "roughly 25" and grew because each stage added branching logic worth pinning: the cache's per-user key, throttle envelopes, the refresh compare-and-swap under concurrency, the web client's single-flight coordinator. The number is a measurement, not a budget; do not delete tests to hit an older figure.

Do not add UI snapshots, CSS regression tests, library-internals tests, or exhaustive validator permutations. The brief never asks for tests at all — the suite exists to show judgment, so its size is part of the signal.

## TSDoc

**Types carry the _what_; comments carry the _why_ and the behavior contract.** No `@param {string}`, no `@returns {Promise<T>}` — TypeScript already knows.

Required on: every `contracts` export · service methods holding business logic (rotation, the query builder, completion transitions) · guards, filters, interceptors — one block each saying what it catches and what it emits · frontend hooks — one line, plus anything non-obvious. Use `@throws` on anything that maps to a status code; it doubles as the error contract.

Skip thin controllers and self-evident private helpers. A comment restating the signature is worse than none. Write them with the code, never as a later sweep.

## Design

`design/` is working material, not product: it is **gitignored and exists only on this machine**, so a fresh clone will not have it and nothing in `apps/` imports from it. The guidance below applies when it is present; when it is not, the tokens already in `apps/web` are the reference.

`design/` is a **reference that removes decisions, not a specification to match.** Take colours, spacing, radii, shadows and fonts from `design/tokens.ts`; check `design/components.md` for which Mantine component builds an element; read the matching `design/mockups/*.html` before building a view, and reuse its copy — button labels, error messages, empty-state text.

Build from it, don't measure against it. If a screen looks close and behaves correctly, it's done. Don't invent a second visual language, and don't stop to pixel-match.

Accent is teal `#2F4C56`. Brass `#8A6410` is for errors and warnings only. Completed rows use the neutral ink marker, never the accent — a finished task must not read as clickable.

## Definition of done

`pnpm lint`, `pnpm -r typecheck`, and the stage's tests pass; `docker compose up` still boots the whole stack.
