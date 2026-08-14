# Tally — task manager (Catena take-home)

Requirements: `docs/BRIEF.md` (source of truth). Plan and stages: `docs/PLAN.md`. Read the current stage before writing code.

## Layout

`apps/web` (Next 15 · Mantine 8 · TanStack Query) · `apps/gateway` (NestJS, the only public surface) · `apps/auth-service` · `apps/task-service` (both NestJS + Prisma 6, no published ports) · `packages/contracts` (shared types, route constants, error codes) · `design/` (Tally design source).

## Commands

```bash
pnpm --filter <app> dev | build | test | lint
pnpm -r typecheck
docker compose up --build              # the reviewer's path — keep it working
docker compose down -v                 # full reset
docker compose -f docker-compose.yml -f docker-compose.dev.yml up postgres
pnpm --filter <service> exec prisma migrate dev --name <name>
```

## Hard rules

- **Services never import from each other.** Shared types go through `@tally/contracts`.
- **DTOs and validation live in the gateway.** Services still guard their own invariants.
- **Every task query is scoped by the JWT's `userId`.** Another user's task is `404`, never `403`.
- **Every downstream call is piped through `timeout(3000)`; retry reads only** — retrying a POST creates duplicates.
- **Status codes and error bodies come from the plan's API table**, via one global exception filter. Uniform shape `{ statusCode, error, message, details? }`.
- Never hand-edit migrations or generated Prisma clients.
- Conventional commits, small and imperative. Several per stage, no `wip`.

## Tests

Written **after** the code in each stage works, covering logic that actually branches: token rotation, the list query builder, completion transitions, and gateway status-code/validation checks. Roughly 25 in total.

Do not add UI snapshots, CSS regression tests, library-internals tests, or exhaustive validator permutations. The brief never asks for tests at all — the suite exists to show judgment, so its size is part of the signal.

## TSDoc

**Types carry the _what_; comments carry the _why_ and the behavior contract.** No `@param {string}`, no `@returns {Promise<T>}` — TypeScript already knows.

Required on: every `contracts` export · service methods holding business logic (rotation, the query builder, completion transitions) · guards, filters, interceptors — one block each saying what it catches and what it emits · frontend hooks — one line, plus anything non-obvious. Use `@throws` on anything that maps to a status code; it doubles as the error contract.

Skip thin controllers and self-evident private helpers. A comment restating the signature is worse than none. Write them with the code, never as a later sweep.

## Design

`design/` is a **reference that removes decisions, not a specification to match.** Take colours, spacing, radii, shadows and fonts from `design/tokens.ts`; check `design/components.md` for which Mantine component builds an element; read the matching `design/mockups/*.html` before building a view, and reuse its copy — button labels, error messages, empty-state text.

Build from it, don't measure against it. If a screen looks close and behaves correctly, it's done. Don't invent a second visual language, and don't stop to pixel-match.

Accent is teal `#2F4C56`. Brass `#8A6410` is for errors and warnings only. Completed rows use the neutral ink marker, never the accent — a finished task must not read as clickable.

## Definition of done

`pnpm lint`, `pnpm -r typecheck`, and the stage's tests pass; `docker compose up` still boots the whole stack.
