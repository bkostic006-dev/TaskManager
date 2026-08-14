import type { CookieOptions, Response } from 'express';
import { AUTH_ROUTES, REFRESH_COOKIE } from '@tally/contracts';

/**
 * Builds the cookie attributes, given the origin the browser will be on.
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
 * `secure` follows the origin's scheme rather than `NODE_ENV`. The compose stack
 * runs with `NODE_ENV=production` over plain http on localhost, so keying it to
 * the environment would set a cookie the browser silently refuses to store —
 * and the symptom is a login that appears to work and forgets you on refresh.
 */
export function refreshCookieOptions(webOrigin: string, maxAgeMs?: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: webOrigin.startsWith('https://'),
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
  webOrigin: string,
  token: string,
  expiresAt: string,
): void {
  const maxAge = Math.max(0, new Date(expiresAt).getTime() - Date.now());
  response.cookie(REFRESH_COOKIE, token, refreshCookieOptions(webOrigin, maxAge));
}

/**
 * Removes the cookie. The attributes must match the ones it was set with —
 * a `clearCookie` on the default path leaves the real cookie in place, and the
 * user stays logged in after logging out.
 */
export function clearRefreshCookie(response: Response, webOrigin: string): void {
  response.clearCookie(REFRESH_COOKIE, refreshCookieOptions(webOrigin));
}
