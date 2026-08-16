import { Throttle } from '@nestjs/throttler';

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;

/**
 * The gateway's rate-limit policy, in one place so the three numbers can be
 * read against each other rather than hunted for across controllers.
 *
 * **There is deliberately no single app-wide ceiling.** One number cannot serve
 * both ends of this API: tuned to make credential guessing expensive it is far
 * too tight for `GET /tasks`, which a working dashboard hits on every filter,
 * sort, page and (debounced) keystroke, so normal browsing would answer `429`;
 * tuned for browsing it is worthless against a login attacker. The brief's
 * "where applicable" is the whole exercise — so the limit is chosen per route
 * by what the route is worth attacking for.
 *
 * Buckets are already per handler: `ThrottlerGuard.generateKey` hashes the
 * controller and handler name into the key, so `login`, `signup` and `list`
 * each count separately and exhausting one never blocks another.
 *
 * Two properties of this policy that are limits rather than oversights, both
 * listed in the README as future improvements:
 *
 * - **Tracking is by IP** (`req.ip`), and the consequence is broader than a
 *   shared NAT. Because this guard runs *first* — before `JwtAuthGuard`, which
 *   it must, or a flood of wrong passwords would be rejected without ever
 *   touching the counter — it cannot know who is calling. So **credential-less
 *   requests spend the bucket of routes that require credentials.** Measured
 *   against the running stack: 121 requests carrying no `Authorization` header
 *   at all exhaust the `default` bucket, after which the demo user's own
 *   `POST /tasks` is refused `429` for the rest of the window. Her reads still
 *   work, being a different handler's bucket. Behind Docker's published port
 *   every host request arrives from the bridge address, so that bucket is
 *   shared by every client of the deployment; behind a load balancer without
 *   `trust proxy` it would be shared by the internet.
 *
 *   The fix is a second throttler tier keyed on `request.user.userId`,
 *   registered *after* the JWT guard and applied to the authenticated routes,
 *   with this IP tier kept for the auth surface. It is not built here: doing it
 *   properly means two guards with two skip-lists, and the alternative shortcut
 *   — trusting the bearer token as a bucket key before verifying it — is worse
 *   than the limitation, because an attacker rotates garbage tokens and gets an
 *   unlimited number of buckets. Found by an adversarial review of this stage;
 *   recorded rather than softened.
 * - **Storage is in-process.** Two gateway replicas mean two independent
 *   counters and twice the effective limit. Redis-backed storage is the fix and
 *   is explicitly out of scope here.
 */
export const RATE_LIMITS = {
  /**
   * Everything not named below: refresh, logout, `/auth/me`, task writes, task
   * detail, health. Two a second, which is a budget rather than a measurement:
   * it is above any rate a person clicking through this UI produces and below
   * what an unattended loop does, and nothing in the frontend batches or
   * polls, so no honest client has a way to approach it.
   */
  default: { ttl: MINUTE_MS, limit: 120 },

  /**
   * `POST /auth/login` and `POST /auth/signup`: the two routes where the thing
   * worth limiting is credential guessing and account farming.
   *
   * Ten per minute per handler, twenty-four times tighter than the task list.
   * For scale: a login costs about 100ms here, nearly all of it argon2, so an
   * unthrottled attacker gets on the order of 600 sequential guesses a minute
   * and more in parallel — this is the step from that to ten. The step is what
   * matters, not the choice between five and ten: online guessing against a
   * ten-character password minimum is hopeless at either rate, and the real
   * defence is the minimum length rather than this number.
   *
   * Ten rather than five because **the guard runs before the validation pipe**,
   * so a rejected field spends the allowance exactly as a wrong password does —
   * and `/signup`'s form is `noValidate` with no client-side checks, so every
   * fumble is a round trip. At five, a new user who trips the password minimum,
   * then the email format, then finds the address is taken, is told "too many
   * requests" while filling in a form for the first time. That is a failure at
   * the front door of the product bought for no security worth having.
   *
   * The window is short on purpose — a reviewer who trips it waits a minute,
   * not a quarter of an hour — and the honest trade is that a patient attacker
   * still gets 14 400 guesses a day from one address. Two things fix that
   * properly and are named in the README rather than built: a second, longer
   * tier (`@nestjs/throttler` supports named throttlers) and tracking login per
   * *account* as well as per IP.
   */
  authWrite: { ttl: MINUTE_MS, limit: 10 },

  /**
   * `GET /tasks`: the one route a legitimate UI hits in bursts.
   *
   * 240 a minute — four a second sustained — against a dashboard whose search
   * is debounced and whose other controls are one request per click. It is
   * twenty-four times the auth-write allowance, and that gap is the point: this
   * is not the endpoint an attacker wants, so the limit exists only to bound a
   * runaway client, not to police the user.
   */
  taskRead: { ttl: MINUTE_MS, limit: 240 },
} as const;

/** Strict: credential guessing and account farming. See {@link RATE_LIMITS}. */
export const ThrottleAuthWrite = (): MethodDecorator & ClassDecorator =>
  Throttle({ default: RATE_LIMITS.authWrite });

/** Generous: a dashboard changing filters is normal use. See {@link RATE_LIMITS}. */
export const ThrottleTaskRead = (): MethodDecorator & ClassDecorator =>
  Throttle({ default: RATE_LIMITS.taskRead });
