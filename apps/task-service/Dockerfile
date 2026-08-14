# syntax=docker/dockerfile:1

# Build context is the repo root (see docker-compose.yml) because pnpm needs the
# workspace manifest and the lockfile, not just this app's directory.

# ---------------------------------------------------------------- deps
# Manifests only, so an edit to any .ts file leaves this layer — and the whole
# install — cached. The three Nest images share these instructions verbatim,
# which means they also share the resulting layer.
FROM node:22-slim AS deps
WORKDIR /app
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/gateway/package.json apps/gateway/
COPY apps/auth-service/package.json apps/auth-service/
COPY apps/task-service/package.json apps/task-service/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------- build
FROM deps AS build
WORKDIR /app
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/task-service apps/task-service
# contracts first: the app resolves @tally/contracts through its dist, so the
# app build fails outright if this has not run.
RUN pnpm --filter @tally/contracts build
# The app's `build` script is `prisma generate && nest build`. The generate is
# not optional here: src imports the client's types, so tsc has nothing to
# compile against until the schema has been turned into a client.
RUN pnpm --filter @tally/task-service build

# ---------------------------------------------------------------- runtime
# Production dependencies plus compiled output only — no toolchain, no sources.
#
# `COPY --from=build /app/node_modules` cannot work: pnpm's layout is a tree of
# symlinks into a virtual store, and COPY dereferences them into duplicated
# files with dangling targets. `pnpm deploy` is the intended answer but is
# broken in pnpm 9.15.4 — it resolves the target directory relative to the
# workspace package (every bin fails ENOENT) and ignores `--prod`, installing
# webpack and prettier into a "production" tree. So this stage runs its own
# install: symlinks created here are valid here, and nothing crosses a stage
# boundary. Only dist/ is copied in.
#
# That has a consequence Prisma forces us to handle: the client generated during
# `build` lives in that stage's node_modules and never arrives. This stage
# therefore copies the schema and generates its own client, against its own
# install. `prisma` is a production dependency for the same reason — the CLI has
# to exist at container start for `migrate deploy`.
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/gateway/package.json apps/gateway/
COPY apps/auth-service/package.json apps/auth-service/
COPY apps/task-service/package.json apps/task-service/
COPY apps/web/package.json apps/web/
# `@tally/task-service...` selects this app plus its workspace dependencies, so the
# frontend's tree never reaches a backend image. Do not switch this to
# node-linker=hoisted: the hoisted layout ignores the filter and installs every
# workspace's dependencies flat — Next and Mantine included, 1.08GB against
# 388MB.
RUN pnpm install --frozen-lockfile --prod --filter @tally/task-service... \
    && pnpm store prune

# Schema and migrations: the first is what `generate` reads, the second is what
# `migrate deploy` applies on every start.
COPY apps/task-service/prisma apps/task-service/prisma
RUN pnpm --filter @tally/task-service exec prisma generate

COPY --from=build /app/packages/contracts/dist packages/contracts/dist
COPY --from=build /app/apps/task-service/dist apps/task-service/dist
COPY --chmod=0755 apps/task-service/docker-entrypoint.sh /usr/local/bin/entrypoint.sh

USER node
WORKDIR /app/apps/task-service
EXPOSE 4002
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
