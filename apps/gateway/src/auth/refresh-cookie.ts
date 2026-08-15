import type { CookieOptions, Response } from 'express';
import { AUTH_ROUTES, REFRESH_COOKIE } from '@tally/contracts';

/**
 * Builds the cookie attributes.
 *
 * `httpOnly` is the point of the whole arrangement: the refresh token is the
 * long-lived credential, so no script may read it, which is also why the
 * short-lived access token is the one kept in memory rather than the reverse.
 *
 * `path` scopes it to `/auth`, so it is not attached to every task request —
 * a credential that only travels when it is needed is exposed less often.
 *
 * `sameSite: 'lax'` is enough here because `localhost:3000` → `localhost:3001`
 * is same-site; across real domains this would have to be `none`, which browsers
 * only honour together with `secure`.
 *
 * `secure` is an explicit input, not an inference. It cannot key off `NODE_ENV`
 * — the compose stack runs `NODE_ENV=production` over plain http on localhost,
 * and a `Secure` cookie there is silently dropped by the browser, producing a
 * login that appears to work and forgets you on reload. It used to be derived
 * from `WEB_ORIGIN`'s scheme, which coupled a security attribute of *our*
 * cookie to a string describing *someone else's* origin: two variables to get
 * right instead of one, and the failure was silent in the dangerous direction.
 * `COOKIE_SECURE` says what it means and is required at boot.
 */
export function refreshCookieOptions(secure: boolean, maxAgeMs?: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: AUTH_ROUTES.base,
    ...(maxAgeMs === undefined ? {} : { maxAge: maxAgeMs }),
  };
}

/**
 * Writes the rotated refresh token to the browser.
 *
 * The cookie's lifetime is derived from the row the auth service just created,
 * not from a constant re-applied here, so the browser stops sending the token
 * at the moment the database stops accepting it.
 */
export function setRefreshCookie(
  response: Response,
  secure: boolean,
  token: string,
  expiresAt: string,
): void {
  const maxAge = Math.max(0, new Date(expiresAt).getTime() - Date.now());
  response.cookie(REFRESH_COOKIE, token, refreshCookieOptions(secure, maxAge));
}

/**
 * Removes the cookie. The attributes must match the ones it was set with —
 * a `clearCookie` on the default path leaves the real cookie in place, and the
 * user stays logged in after logging out.
 */
export function clearRefreshCookie(response: Response, secure: boolean): void {
  response.clearCookie(REFRESH_COOKIE, refreshCookieOptions(secure));
}

/**
 * Reads `COOKIE_SECURE`, accepting only `true` or `false`.
 *
 * Anything else throws rather than defaulting. The failure mode this replaces
 * was a misconfiguration that produced a working stack with a cookie one
 * network hop from being readable — the kind of thing nobody notices, so it has
 * to be the kind of thing that stops the process.
 *
 * @throws Error when the value is neither `true` nor `false`.
 */
export function parseCookieSecure(value: string): boolean {
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }

  throw new Error(`COOKIE_SECURE must be "true" or "false", received "${value}".`);
}
