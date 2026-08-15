import axios from 'axios';
import { type ApiError, AUTH_ROUTES, type AuthResponse, ErrorCode } from '@tally/contracts';

import { authSession } from './auth-session';

/**
 * The only module in the web app that speaks HTTP.
 *
 * Everything else — hooks, pages, components — goes through the service
 * functions in `auth-api.ts` and the hooks in `hooks/use-auth.ts`. That is the
 * brief's "API interaction should be abstracted using reusable hooks or service
 * functions", and it is checkable rather than aspirational: no page, component
 * or hook imports `axios`, and nothing in `src/` calls `fetch`. The only other
 * files naming axios are this module's own tests, which stub its adapter.
 *
 * Two interceptors sit on the instance:
 *
 * - **Request** — attaches the in-memory access token as a bearer, unless the
 *   call is marked `anonymous`. Login, signup, refresh and logout are anonymous:
 *   their credential is the body or the httpOnly cookie, never the token, and
 *   sending a stale token with them would only confuse the log.
 * - **Response** — on a `401`, spends the refresh cookie once through the
 *   single-flight coordinator below and replays the original request. Every
 *   rejection that leaves this module is an {@link ApiRequestError}, so no
 *   caller ever handles an `AxiosError`.
 */

declare module 'axios' {
  interface AxiosRequestConfig {
    /**
     * This request is not authenticated by the access token, and a `401` from
     * it means "these credentials are wrong", not "the token expired". Set on
     * the four auth endpoints; without it, a failed login would trigger a
     * refresh, and `/auth/refresh` answering `401` would refresh itself
     * forever.
     */
    anonymous?: boolean;
    /**
     * Set by the response interceptor on the replay. A request carrying it is
     * never retried again: one refresh per request is the whole budget, and
     * without this a permanently-401 endpoint is an infinite loop.
     */
    retried?: boolean;
  }
}

/**
 * Baked into the bundle at build time by Next, which is why compose passes it
 * as a build ARG rather than a runtime variable — the browser, not the
 * container, is what resolves this address. The fallback matches compose's
 * default published gateway port so `next dev` works without an env file.
 */
const baseURL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export const apiClient = axios.create({
  baseURL,
  // Without this the refresh cookie is neither sent nor stored, and every
  // session dies at the first page load. The gateway's CORS is configured with
  // an exact origin and `credentials: true` to match.
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * A gateway error, in the one shape the gateway's global exception filter emits.
 *
 * Thrown in place of `AxiosError` so that a component rendering a failure never
 * has to know the transport. `statusCode` is `0` for a request that never got a
 * response at all — the server being down is not a status code.
 */
export class ApiRequestError extends Error implements ApiError {
  readonly statusCode: number;
  readonly error: ErrorCode;
  readonly details?: Record<string, string[]>;

  constructor(body: ApiError, options?: { cause?: unknown }) {
    super(body.message, options);
    this.name = 'ApiRequestError';
    this.statusCode = body.statusCode;
    this.error = body.error;
    this.details = body.details;
  }
}

/** Copy for the case the gateway never answered — there is no server message to show. */
const UNREACHABLE: ApiError = {
  statusCode: 0,
  error: ErrorCode.Upstream,
  message: "We couldn't reach the server. Check your connection and try again.",
};

function isApiErrorBody(value: unknown): value is ApiError {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const body = value as Partial<ApiError>;
  return typeof body.statusCode === 'number' && typeof body.message === 'string';
}

/**
 * Normalises anything thrown by axios into an {@link ApiRequestError}.
 *
 * The gateway answers every failure with `{ statusCode, error, message,
 * details? }`, so the happy path is to pass that through untouched — the
 * message a user sees is the one the API wrote, not one invented here. A
 * response that is *not* that shape (a proxy's HTML error page, a body the
 * browser could not parse) is reported by status alone rather than rendered.
 */
export function toApiRequestError(cause: unknown): ApiRequestError {
  if (cause instanceof ApiRequestError) {
    return cause;
  }

  // `isAxiosError` rather than `instanceof`: it duck-types on a flag axios sets,
  // so it still recognises an error raised by a second copy of the module — a
  // bundler chunk boundary, or a test that reset the module registry.
  if (axios.isAxiosError(cause)) {
    const response = cause.response;
    if (response === undefined) {
      return new ApiRequestError(UNREACHABLE, { cause });
    }
    if (isApiErrorBody(response.data)) {
      return new ApiRequestError(response.data, { cause });
    }
    return new ApiRequestError(
      {
        statusCode: response.status,
        error: ErrorCode.Internal,
        message: 'Something went wrong. Try again.',
      },
      { cause },
    );
  }

  return new ApiRequestError(
    { statusCode: 0, error: ErrorCode.Internal, message: 'Something went wrong. Try again.' },
    { cause },
  );
}

apiClient.interceptors.request.use((config) => {
  if (config.anonymous === true) {
    return config;
  }
  const token = authSession.getAccessToken();
  if (token !== null) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

/* ------------------------------------------------------------------ *
 * Single-flight refresh
 * ------------------------------------------------------------------ */

/**
 * The one refresh in flight, or `null` when none is.
 *
 * **This variable is the whole point of the stage.** Server-side rotation is a
 * compare-and-swap: the first `/auth/refresh` to present a given token wins and
 * every other one is answered `401`, correctly. Three things fire that call at
 * once in normal use — React StrictMode double-invoking the boot effect, and
 * any two requests whose access token expired in the same tick. Let them each
 * open their own request and all but one is told the session is dead, so a
 * naive client logs the user out at random. It reads as flakiness rather than
 * as a race, which is what makes it expensive.
 *
 * Holding the promise instead of the result means every caller awaits the same
 * network call and sees the same answer. It is cleared in `finally` — success
 * or failure — so the *next* genuine expiry starts a fresh one rather than
 * replaying a stale outcome forever.
 */
let refreshPromise: Promise<AuthResponse> | null = null;

async function requestRefresh(): Promise<AuthResponse> {
  try {
    const { data } = await apiClient.post<AuthResponse>(AUTH_ROUTES.refresh, undefined, {
      // Anonymous both ways: the cookie is the credential, and a 401 here is
      // terminal rather than something to refresh out of.
      anonymous: true,
    });
    authSession.start(data);
    return data;
  } catch (cause) {
    // A refresh that fails is the only trustworthy "you are logged out" signal
    // the client gets. Clearing here rather than retrying is what stops the
    // loop; the gateway deliberately answers `401` — not `404` — for a token
    // whose account is gone, precisely so this branch is reached.
    authSession.clear();
    throw toApiRequestError(cause);
  }
}

/**
 * Exchanges the refresh cookie for a new access token, coalescing concurrent
 * callers onto one request. See {@link refreshPromise} for why that matters.
 *
 * @throws ApiRequestError `401` when the cookie is missing, expired or already
 * rotated. The session is cleared before it throws.
 */
export function refreshSession(): Promise<AuthResponse> {
  refreshPromise ??= requestRefresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

let restoreAttempted = false;

/**
 * Restores the session on boot, at most once per page load.
 *
 * The access token lives in memory, so a hard refresh arrives with nothing; the
 * httpOnly cookie is the only thing that survived, and this spends it. Failure
 * is not an error condition — a first-time visitor has no cookie — so it
 * resolves either way and the answer is read off the session store.
 *
 * Guarded twice on purpose: `restoreAttempted` stops a remount from re-asking a
 * question already answered, and {@link refreshSession} coalesces the
 * StrictMode double-invoke that happens before the first attempt has settled.
 */
export async function restoreSession(): Promise<void> {
  if (restoreAttempted) {
    return;
  }
  restoreAttempted = true;
  authSession.markRestoring();

  try {
    await refreshSession();
  } catch {
    // Already cleared by requestRefresh. Not being signed in is not a failure.
  }
}

apiClient.interceptors.response.use(
  (response) => response,
  async (cause: unknown) => {
    if (!axios.isAxiosError(cause)) {
      throw toApiRequestError(cause);
    }

    const config = cause.config;
    const retryable =
      cause.response?.status === 401 &&
      config !== undefined &&
      config.anonymous !== true &&
      config.retried !== true;

    if (!retryable) {
      throw toApiRequestError(cause);
    }

    try {
      await refreshSession();
    } catch {
      // Surface the original 401 rather than the refresh's: the caller asked
      // about their request, and the session is already cleared.
      throw toApiRequestError(cause);
    }

    return apiClient.request({ ...config, retried: true });
  },
);
