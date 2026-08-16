'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { AuthResponse, AuthUser } from '@tally/contracts';

import type { ApiRequestError } from '@/lib/api-error';
import { restoreSession } from '@/lib/api-client';
import * as authApi from '@/lib/auth-api';
import { authSession, type SessionStatus } from '@/lib/auth-session';
import type { LoginInput, SignupInput } from '@/lib/auth-api';

/**
 * The reusable API layer components are allowed to touch. Nothing below returns
 * a transport type: errors arrive as `ApiRequestError` and successes as the
 * shared `@tally/contracts` shapes.
 */

export interface Session {
  user: AuthUser | null;
  isAuthenticated: boolean;
  /** True until boot has finished asking the refresh cookie who this is. */
  isRestoring: boolean;
  status: SessionStatus;
  /** Why boot ended without a session when the reason was not "you are logged out". */
  unavailableReason: string | null;
}

/**
 * Subscribes to the in-memory session and kicks off the one boot restore.
 *
 * `useSyncExternalStore` rather than context: the session is also read by
 * non-React code (the request interceptor), so the store has to live outside
 * the tree, and this is the hook that reads such a store without tearing.
 *
 * The effect is safe to run in every consumer — `restoreSession` is idempotent
 * and single-flighted, which is exactly what StrictMode's double invocation
 * needs.
 */
export function useSession(): Session {
  const snapshot = useSyncExternalStore(
    authSession.subscribe,
    authSession.getSnapshot,
    authSession.getServerSnapshot,
  );

  useEffect(() => {
    void restoreSession();
  }, []);

  return {
    user: snapshot.user,
    isAuthenticated: snapshot.user !== null,
    // `unavailable` is an answer, not a wait: gates that treated it as one would
    // hold the spinner for the rest of the page's life.
    isRestoring: snapshot.status === 'unknown' || snapshot.status === 'restoring',
    status: snapshot.status,
    unavailableReason: snapshot.unavailableReason,
  };
}

/** Logs in and adopts the returned session. The refresh cookie is set by the gateway. */
export function useLogin(): UseMutationResult<AuthResponse, ApiRequestError, LoginInput> {
  return useMutation({
    mutationFn: authApi.login,
    onSuccess: (auth) => authSession.start(auth),
  });
}

/** Creates an account and signs straight in — signup returns a session, not a prompt to log in. */
export function useSignup(): UseMutationResult<AuthResponse, ApiRequestError, SignupInput> {
  return useMutation({
    mutationFn: authApi.signup,
    onSuccess: (auth) => authSession.start(auth),
  });
}

/**
 * Ends the session.
 *
 * Local state is cleared in `onSettled`, not `onSuccess`: if the gateway is
 * unreachable the user still means to be logged out, and leaving them holding a
 * dead token because the network failed is the wrong side to fail on. The
 * query cache is dropped at the same time so the next account never sees the
 * previous one's rows.
 */
export function useLogout(): UseMutationResult<void, ApiRequestError, void> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: authApi.logout,
    onSettled: () => {
      authSession.clear();
      queryClient.clear();
    },
  });
}
