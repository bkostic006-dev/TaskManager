/**
 * The account as anything outside the auth service is allowed to see it.
 *
 * `passwordHash` is absent by construction rather than by convention: the auth
 * service builds this shape explicitly, so a `select` that accidentally widens
 * cannot leak the hash through a response.
 *
 * `createdAt` is an ISO string, not a `Date`. Everything here crosses an HTTP
 * boundary and is JSON on arrival; typing it as `Date` would be a lie the
 * consumer discovers at runtime.
 */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

/**
 * What the gateway returns to the browser after signup, login or refresh.
 *
 * The refresh token is deliberately not here. It travels only in the httpOnly
 * cookie the gateway sets, so no client script can read it — which is the
 * entire reason for keeping the access token short-lived and in memory.
 */
export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

/**
 * What the auth service hands the gateway on the internal network.
 *
 * This is the one place the plaintext refresh token exists outside the
 * browser's cookie jar: the service mints it, returns it exactly once, and
 * keeps only its SHA-256 hash. The gateway turns it into a `Set-Cookie` and
 * drops it. It must never be forwarded to the client in a response body.
 *
 * `refreshExpiresAt` accompanies it so the gateway can set the cookie's
 * `maxAge` without re-deriving the lifetime and drifting from the database row.
 */
export interface AuthSession extends AuthResponse {
  refreshToken: string;
  refreshExpiresAt: string;
}

/**
 * Claims carried by the access JWT.
 *
 * `sub` is the user id and is the only thing downstream services are trusted
 * with: the gateway verifies the signature and forwards `sub`, so a service
 * never parses a token itself. `email` rides along purely so the gateway can
 * log a request without a round trip.
 */
export interface AccessTokenClaims {
  sub: string;
  email: string;
  iat: number;
  exp: number;
}

/**
 * Access token lifetime, in the string form `jsonwebtoken` accepts.
 *
 * Short because an access token cannot be revoked before it expires — there is
 * no denylist, by design. Fifteen minutes bounds the damage of a stolen token
 * while staying long enough that rotation is not a per-request cost.
 */
export const ACCESS_TOKEN_TTL = '15m';

/**
 * Refresh token lifetime. Also the cookie's `maxAge`, so the browser forgets
 * the token at the same moment the database stops honouring it.
 */
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Minimum password length, enforced by the gateway's DTO and echoed in the
 * signup form's hint.
 *
 * Ten rather than eight: length is the only knob that matters once hashing is
 * argon2id, and the seeded demo password is built to satisfy it.
 */
export const PASSWORD_MIN_LENGTH = 10;
