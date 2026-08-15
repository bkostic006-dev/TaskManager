import { AUTH_ROUTES, type AuthResponse, type AuthUser } from '@tally/contracts';

import { apiClient } from './api-client';
import { toApiRequestError } from './api-error';

/**
 * The auth endpoints as plain service functions.
 *
 * They own the request shape and nothing else: no React, no cache, no
 * navigation. `hooks/use-auth.ts` wraps them for components; a test or a script
 * can call them directly. Every one rejects with `ApiRequestError`, so callers
 * branch on `statusCode` and render `message` without knowing axios exists.
 */

export interface LoginInput {
  email: string;
  password: string;
}

export interface SignupInput extends LoginInput {
  name: string;
}

/**
 * @throws ApiRequestError `401` when the email and password do not match, `400`
 * when either field is malformed.
 */
export async function login(input: LoginInput): Promise<AuthResponse> {
  try {
    const { data } = await apiClient.post<AuthResponse>(AUTH_ROUTES.login, input, {
      anonymous: true,
    });
    return data;
  } catch (cause) {
    throw toApiRequestError(cause);
  }
}

/**
 * @throws ApiRequestError `409` when the email is already registered, `400`
 * with per-field `details` when the payload fails the gateway's validators.
 */
export async function signup(input: SignupInput): Promise<AuthResponse> {
  try {
    const { data } = await apiClient.post<AuthResponse>(AUTH_ROUTES.signup, input, {
      anonymous: true,
    });
    return data;
  } catch (cause) {
    throw toApiRequestError(cause);
  }
}

/**
 * Ends the session server-side. The gateway answers `204` and clears the cookie
 * whether or not revocation succeeded, so this resolves for any reachable
 * gateway — the caller clears local state regardless.
 */
export async function logout(): Promise<void> {
  try {
    await apiClient.post(AUTH_ROUTES.logout, undefined, { anonymous: true });
  } catch (cause) {
    throw toApiRequestError(cause);
  }
}

/**
 * The account behind the current access token. Not used on the boot path —
 * `/auth/refresh` already returns the user — but it is the endpoint that
 * exercises the bearer header end to end.
 *
 * @throws ApiRequestError `401` when the token is missing, expired or names a
 * deleted account.
 */
export async function fetchCurrentUser(): Promise<AuthUser> {
  try {
    const { data } = await apiClient.get<AuthUser>(AUTH_ROUTES.me);
    return data;
  } catch (cause) {
    throw toApiRequestError(cause);
  }
}
