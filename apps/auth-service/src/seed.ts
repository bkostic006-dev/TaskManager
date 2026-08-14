import * as argon2 from 'argon2';
import { DEMO_CREDENTIALS, DEMO_USER_ID } from '@tally/contracts';
import { PrismaClient } from '../generated/prisma';

/**
 * Seeds the demo account the README's credentials log into.
 *
 * Runs from the container entrypoint on **every** start, so it must be
 * idempotent: presence of the row at `DEMO_USER_ID` is the whole check, and a
 * hit returns before argon2 is ever invoked. The id is imported rather than
 * generated because the task service seeds rows against the same constant with
 * no foreign key — and no query — able to connect the two databases.
 *
 * Hashing parameters are argon2's defaults for `argon2id`, the variant that
 * resists both GPU and side-channel attacks; stage 3 verifies against these.
 */
async function seed(prisma: PrismaClient): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { id: DEMO_USER_ID } });
  if (existing) {
    console.log(`[seed] demo user ${DEMO_CREDENTIALS.email} already present — skipping`);
    return;
  }

  const passwordHash = await argon2.hash(DEMO_CREDENTIALS.password, { type: argon2.argon2id });

  await prisma.user.create({
    data: {
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
