import * as argon2 from 'argon2';
import { DEMO_CREDENTIALS, DEMO_USER_ID } from '@tally/contracts';
import { PrismaClient } from '../generated/prisma';

/**
 * Seeds the demo account the README's credentials log into.
 *
 * Runs from the container entrypoint on **every** start, so it must be
 * idempotent. The id is imported rather than generated because the task service
 * seeds rows against the same constant, with no foreign key — and no query —
 * able to connect the two databases.
 *
 * Both unique columns are checked, not just the id. Matching on `id` alone would
 * let a row that already holds the demo email fail the subsequent insert with
 * P2002, and because the entrypoint runs under `set -e` with
 * `restart: unless-stopped`, that single error becomes a permanent crash loop
 * that never satisfies the gateway's `service_healthy` dependency — the whole
 * stack stays down over a seed. The write is an upsert for the same reason.
 *
 * Hashing parameters are argon2's defaults for `argon2id`, the variant that
 * resists both GPU and side-channel attacks; stage 3 verifies against these.
 */
async function seed(prisma: PrismaClient): Promise<void> {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ id: DEMO_USER_ID }, { email: DEMO_CREDENTIALS.email }] },
    select: { id: true, email: true },
  });

  if (existing) {
    // An id mismatch is worth saying out loud: the task service seeds its rows
    // against DEMO_USER_ID, so the demo account would log in to an empty list.
    if (existing.id !== DEMO_USER_ID) {
      console.warn(
        `[seed] ${existing.email} exists at ${existing.id}, not ${DEMO_USER_ID} — ` +
          'seeded tasks belong to the latter and will not be visible. `docker compose down -v` to reset.',
      );
    } else {
      console.log(`[seed] demo user ${DEMO_CREDENTIALS.email} already present — skipping`);
    }
    return;
  }

  const passwordHash = await argon2.hash(DEMO_CREDENTIALS.password, { type: argon2.argon2id });

  await prisma.user.upsert({
    where: { email: DEMO_CREDENTIALS.email },
    update: {},
    create: {
      id: DEMO_USER_ID,
      email: DEMO_CREDENTIALS.email,
      name: DEMO_CREDENTIALS.name,
      passwordHash,
    },
  });

  console.log(`[seed] created demo user ${DEMO_CREDENTIALS.email} at ${DEMO_USER_ID}`);
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await seed(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('[seed] failed', error);
  // Non-zero exit stops the entrypoint before the server starts: a service
  // whose data layer is unusable should fail loudly, not serve empty results.
  process.exit(1);
});
