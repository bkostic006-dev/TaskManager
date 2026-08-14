#!/bin/sh
# Container start sequence: schema, data, server — in that order, and only ever
# forward. Compose has already gated this on Postgres being healthy.
#
# `set -e` is what makes the ordering meaningful: if the migration or the seed
# fails, the container exits instead of starting a server on top of a database
# it cannot use. That turns a data-layer fault into a failed healthcheck at
# boot rather than a 500 on the first request.
set -e

# `migrate deploy`, never `migrate dev`: it applies the committed migrations and
# nothing else — it will not generate one, will not prompt, and will not reset a
# drifted database. Idempotent, so it is safe on every start.
./node_modules/.bin/prisma migrate deploy

# Compiled seed. `ts-node` has no place in a production image, and there is no
# TypeScript in it to run anyway. The seed is idempotent: it returns early once
# the demo user already has tasks, so a second `up` does not double them.
node dist/seed.js

# `exec` replaces the shell so Node becomes PID 1 and receives SIGTERM directly.
# Without it the shell holds PID 1, ignores the signal, and `docker compose
# stop` spends its full ten-second grace period before killing the container.
exec node dist/main.js
