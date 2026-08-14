import { DEMO_USER_ID } from '@tally/contracts';
import { PrismaClient, Prisma } from '../generated/prisma';

/** Age in days at which a row is stamped, relative to the moment the seed runs. */
type SeedTask = {
  title: string;
  description?: string;
  createdDaysAgo: number;
  /** Present exactly on the completed rows; always younger than `createdDaysAgo`. */
  completedDaysAgo?: number;
};

/**
 * 47 rows — 31 pending, 16 completed.
 *
 * Ages are relative rather than absolute so a fresh volume always produces a
 * plausibly recent backlog, and they are spread over six weeks so that sorting
 * by `createdAt` reorders the list visibly instead of shuffling rows that were
 * all written in the same second.
 */
const TASKS: readonly SeedTask[] = [
  // ------------------------------------------------------------- completed
  {
    title: 'Renew the northbay.dev domain',
    description: 'Auto-renew was off after the card expired.',
    createdDaysAgo: 44,
    completedDaysAgo: 43,
  },
  { title: 'Send the Q3 invoice to Harlow & Finch', createdDaysAgo: 43, completedDaysAgo: 40 },
  { title: 'Book the dentist appointment', createdDaysAgo: 41, completedDaysAgo: 38 },
  {
    title: 'Export the analytics dashboard for the board deck',
    description: 'Sessions, retention and MRR — last four quarters.',
    createdDaysAgo: 39,
    completedDaysAgo: 36,
  },
  { title: 'Reply to Priya about the contract redlines', createdDaysAgo: 38, completedDaysAgo: 37 },
  { title: 'Order a replacement laptop charger', createdDaysAgo: 36, completedDaysAgo: 31 },
  {
    title: 'Cancel the unused Figma seat',
    description: 'Left over from the contractor engagement.',
    createdDaysAgo: 35,
    completedDaysAgo: 33,
  },
  { title: 'Update the on-call rota for August', createdDaysAgo: 33, completedDaysAgo: 30 },
  {
    title: 'File the mileage claim for the Bristol trip',
    createdDaysAgo: 31,
    completedDaysAgo: 26,
  },
  {
    title: 'Move the staging database to the new subnet',
    description: 'Blocked the VPC peering cleanup.',
    createdDaysAgo: 30,
    completedDaysAgo: 24,
  },
  { title: 'Draft the release notes for 2.4', createdDaysAgo: 28, completedDaysAgo: 25 },
  { title: 'Return the loaned monitor to IT', createdDaysAgo: 26, completedDaysAgo: 21 },
  { title: 'Confirm catering for the offsite', createdDaysAgo: 25, completedDaysAgo: 20 },
  {
    title: 'Rotate the Stripe API keys',
    description: 'Quarterly rotation; restricted keys only.',
    createdDaysAgo: 23,
    completedDaysAgo: 22,
  },
  { title: 'Archive the 2025 client folders', createdDaysAgo: 21, completedDaysAgo: 12 },
  {
    title: "Set up the new starter's accounts",
    description: 'Email, SSO, repo access, laptop.',
    createdDaysAgo: 20,
    completedDaysAgo: 18,
  },

  // --------------------------------------------------------------- pending
  {
    title: 'Migrate the marketing site off the old CMS',
    description: 'Two hundred pages, most of them dead.',
    createdDaysAgo: 42,
  },
  { title: 'Renew the professional indemnity insurance', createdDaysAgo: 40 },
  { title: 'Schedule the annual penetration test', createdDaysAgo: 37 },
  {
    title: 'Write up the Postgres upgrade plan',
    description: '15 to 17, with a rehearsal on a restored snapshot first.',
    createdDaysAgo: 34,
  },
  { title: 'Draft the parental leave policy', createdDaysAgo: 32 },
  { title: 'Decide on the analytics vendor', createdDaysAgo: 29 },
  {
    title: 'Refactor the notification worker',
    description: 'Retries are unbounded and it hammers the mail provider.',
    createdDaysAgo: 27,
  },
  { title: 'Tidy the shared Drive folder structure', createdDaysAgo: 24 },
  { title: 'Set up automated database backups', createdDaysAgo: 22 },
  { title: 'Write the job description for the design role', createdDaysAgo: 19 },
  {
    title: 'Audit the third-party scripts on the landing page',
    description: 'Four tag managers is three too many.',
    createdDaysAgo: 18,
  },
  { title: 'Plan the Q4 roadmap workshop', createdDaysAgo: 17 },
  { title: 'Benchmark the search endpoint under load', createdDaysAgo: 16 },
  { title: 'Read the accessibility audit findings', createdDaysAgo: 15 },
  { title: 'Cancel the duplicate Datadog subscription', createdDaysAgo: 14 },
  {
    title: 'Fix the flaky checkout test',
    description: 'Fails roughly one run in nine, always on CI.',
    createdDaysAgo: 13,
  },
  { title: 'Update the incident response runbook', createdDaysAgo: 12 },
  { title: 'Interview the second backend candidate', createdDaysAgo: 11 },
  { title: 'Sketch the onboarding empty states', createdDaysAgo: 10 },
  { title: 'Prepare the pricing experiment brief', createdDaysAgo: 9 },
  { title: 'Book flights for the Lisbon conference', createdDaysAgo: 8 },
  { title: 'Call the accountant about the VAT threshold', createdDaysAgo: 7 },
  { title: 'Follow up with Harlow & Finch on the renewal', createdDaysAgo: 6 },
  { title: 'Order standing desk mats for the new hires', createdDaysAgo: 5 },
  {
    title: "Write the postmortem for Tuesday's outage",
    description: 'Connection pool exhaustion; 41 minutes of degraded reads.',
    createdDaysAgo: 4,
  },
  { title: 'Chase the missing receipts from the offsite', createdDaysAgo: 3 },
  { title: 'Clear the backlog of Sentry alerts', createdDaysAgo: 3 },
  { title: "Review Marcus's pull request on the billing module", createdDaysAgo: 2 },
  { title: 'Replace the office coffee grinder', createdDaysAgo: 2 },
  { title: 'Sort out the recycling collection', createdDaysAgo: 1 },
  { title: 'Buy a birthday present for Nora', createdDaysAgo: 0 },
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Timestamps are offset by an extra `index` minutes so no two rows share one,
 * which keeps a `createdAt` sort total and its pagination stable.
 */
function stamp(now: number, daysAgo: number, index: number): Date {
  return new Date(now - daysAgo * MS_PER_DAY - index * 60_000);
}

/**
 * Seeds the demo user's backlog.
 *
 * Runs from the container entrypoint on every start, so the presence of any row
 * for `DEMO_USER_ID` short-circuits it — a second `docker compose up` must not
 * leave 94 tasks behind. `DEMO_USER_ID` is imported, never generated: this
 * database holds no `User` table and no foreign key to one, so the shared
 * constant is the only thing tying these rows to the account the auth service
 * seeded in a different database.
 */
async function seed(prisma: PrismaClient): Promise<void> {
  const existing = await prisma.task.count({ where: { userId: DEMO_USER_ID } });
  if (existing > 0) {
    console.log(`[seed] ${existing} task(s) already present for the demo user — skipping`);
    return;
  }

  const now = Date.now();
  const rows: Prisma.TaskCreateManyInput[] = TASKS.map((task, index) => {
    const createdAt = stamp(now, task.createdDaysAgo, index);
    const completedAt =
      task.completedDaysAgo === undefined ? null : stamp(now, task.completedDaysAgo, index);

    return {
      userId: DEMO_USER_ID,
      title: task.title,
      description: task.description ?? null,
      completed: completedAt !== null,
      completedAt,
      createdAt,
      // Mirrors the domain rule: a completed task was last touched when it was
      // completed. Prisma would otherwise stamp every row with `now`.
      updatedAt: completedAt ?? createdAt,
    };
  });

  const { count } = await prisma.task.createMany({ data: rows });
  const completed = rows.filter((row) => row.completed).length;

  console.log(
    `[seed] created ${count} tasks (${completed} completed, ${count - completed} pending)`,
  );
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
