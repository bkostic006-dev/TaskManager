# syntax=docker/dockerfile:1

# Build context is the repo root (see docker-compose.yml) because pnpm needs the
# workspace manifest and the lockfile, not just this app's directory.

# ---------------------------------------------------------------- deps
# Identical to the Nest images' deps stage, so the layer is shared with them.
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
COPY apps/web apps/web
# NEXT_PUBLIC_* is inlined into the client bundle at build time, so the gateway
# URL is an ARG, not a runtime env var: changing it means rebuilding this image.
# It is the address the *browser* uses, hence localhost rather than the compose
# service name.
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @tally/contracts build
# Guarantee the directory exists so the runtime COPY below is unconditional;
# stage 1 ships no static assets, later stages may.
RUN mkdir -p apps/web/public
RUN pnpm --filter @tally/web build

# ---------------------------------------------------------------- runtime
# next.config.ts sets output: 'standalone', so .next/standalone already contains
# a pruned node_modules and a server. Nothing is installed here.
FROM node:22-slim AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# Next's standalone server binds localhost by default, which inside a container
# is reachable only from the container itself — the healthcheck would pass while
# the published port served nothing.
ENV HOSTNAME=0.0.0.0
WORKDIR /app

# In a workspace the traced root is the repo root, so the server lands at
# apps/web/server.js and its relative asset lookups expect that shape kept.
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public

USER node
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["node", "server.js"]
