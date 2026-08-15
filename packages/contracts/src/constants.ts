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

/**
 * The throwaway HS256 key `docker-compose.yml` falls back to when `JWT_SECRET`
 * is unset, so that a bare clone boots with no `.env` step.
 *
 * It is duplicated here, as a literal, for one purpose: both apps compare their
 * configured secret against it at boot and log a warning when they match. It is
 * a published value in a public repository, so anything signed with it can be
 * forged by anyone — including a token for {@link DEMO_USER_ID}. Keep it byte
 * for byte identical to the fallback in `docker-compose.yml`; if they drift,
 * the warning stops firing and the boot stays silently insecure.
 */
export const DEV_ONLY_JWT_SECRET = 'dev-only-not-a-secret-change-me';

/**
 * Signing algorithm, issuer and audience for the access token — one definition
 * for the auth service that signs and the gateway that verifies.
 *
 * Pinned rather than left to the library's defaults. `jsonwebtoken` will accept
 * any algorithm the token's own header names unless it is given a list, so an
 * unpinned verifier is one migration away from algorithm confusion: the moment
 * signing moves to RS256 and the gateway holds a public key, a token whose
 * header says `HS256` would be verified *with that public key as an HMAC
 * secret* — and the public key is public. `issuer` and `audience` are the same
 * argument one level up: they stop a token minted for something else in the
 * estate from being spent here.
 */
export const JWT_ALGORITHM = 'HS256';
export const JWT_ISSUER = 'tally-auth';
export const JWT_AUDIENCE = 'tally-gateway';
