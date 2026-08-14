/**
 * Fixed identity for the seeded demo account.
 *
 * The two services own separate databases with no foreign key between them,
 * so the task seed cannot look this up — auth seeds the user at this id and
 * tasks seeds rows against it. Both sides import the constant; neither
 * generates it. Changing it invalidates any existing seeded volume.
 */
export const DEMO_USER_ID = '00000000-0000-4000-8000-000000000001';

/**
 * Credentials printed in the README so a reviewer can log in immediately.
 *
 * `password` is the plaintext the auth seed hashes with argon2id; nothing else
 * may read it. `name` lives here rather than in the seed so the demo account's
 * display name has one definition shared by the seed and the README.
 */
export const DEMO_CREDENTIALS = {
  email: 'dana@northbay.dev',
  password: 'tally-demo-2026',
  name: 'Dana Whitfield',
} as const;

/**
 * Page sizes the list endpoint accepts.
 *
 * A closed set rather than a range: the UI offers exactly these, and anything
 * else is rejected with `400` rather than silently clamped, so the response
 * always reflects what was asked for.
 */
export const PAGE_SIZES = [8, 16, 24, 48] as const;
export const DEFAULT_PAGE_SIZE = 8;

/** Budget for any single gateway → service call before it is abandoned. */
export const UPSTREAM_TIMEOUT_MS = 3000;
