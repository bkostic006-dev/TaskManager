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
COPY apps/auth-service apps/auth-service
# contracts first: the app resolves @tally/contracts through its dist, so the
# app build fails outright if this has not run.
RUN pnpm --filter @tally/contracts build
RUN pnpm --filter @tally/auth-service build

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
# `@tally/auth-service...` selects this app plus its workspace dependencies, so the
# frontend's tree never reaches a backend image. Do not switch this to
# node-linker=hoisted: the hoisted layout ignores the filter and installs every
# workspace's dependencies flat — Next and Mantine included, 1.08GB against
# 388MB.
RUN pnpm install --frozen-lockfile --prod --filter @tally/auth-service... \
    && pnpm store prune
COPY --from=build /app/packages/contracts/dist packages/contracts/dist
COPY --from=build /app/apps/auth-service/dist apps/auth-service/dist

USER node
WORKDIR /app/apps/auth-service
EXPOSE 4001
CMD ["node", "dist/main.js"]
