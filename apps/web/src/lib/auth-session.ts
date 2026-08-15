import type { AuthResponse, AuthUser } from '@tally/contracts';

/**
 * Where the session lives while the tab is open.
 *
 * The access token is a module variable and nothing else — never
 * `localStorage`, never a readable cookie. That is the deliberate trade-off
 * recorded in the plan: a token no script can persist is a token an XSS cannot
 * exfiltrate for later, and the cost is that a hard refresh starts with no
 * credential at all. Restoring it is `restoreSession()`'s job in
 * `api-client.ts`, which spends the httpOnly refresh cookie the browser kept.
 *
 * React reads this through `useSyncExternalStore`, so the snapshot is an
 * immutable object replaced on every change rather than mutated — a mutated
 * object would compare equal to itself and no component would re-render.
 */

/** Where the app is in deciding whether anyone is signed in. */
export type SessionStatus =
  /** Boot has not asked yet. Nothing may be concluded from `user` being null. */
  | 'unknown'
  /** The refresh cookie is being spent right now. Gates must wait, not redirect. */
  | 'restoring'
  /** The question is answered: `user` is the truth. */
  | 'ready';

export interface SessionSnapshot {
  user: AuthUser | null;
  status: SessionStatus;
}

/**
 * The pre-boot snapshot, shared by the initial client state and the server
 * render. One frozen object for both, because `useSyncExternalStore` compares
 * snapshots by identity and a fresh literal each call is an infinite loop.
 */
const UNKNOWN_SNAPSHOT: SessionSnapshot = Object.freeze({ user: null, status: 'unknown' });

let accessToken: string | null = null;
let snapshot: SessionSnapshot = UNKNOWN_SNAPSHOT;
const listeners = new Set<() => void>();

function publish(next: SessionSnapshot): void {
  snapshot = next;
  for (const listener of listeners) {
    listener();
  }
}

export const authSession = {
  /** The bearer token for outgoing requests. `null` between boot and restore. */
  getAccessToken: (): string | null => accessToken,

  getSnapshot: (): SessionSnapshot => snapshot,

  /**
   * The server never has an access token, so it always renders the pre-boot
   * state. Protected views must therefore be client-side gated — see
   * `require-auth.tsx`.
   */
  getServerSnapshot: (): SessionSnapshot => UNKNOWN_SNAPSHOT,

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /** Adopts the result of a login, signup or refresh. */
  start(auth: AuthResponse): void {
    accessToken = auth.accessToken;
    publish({ user: auth.user, status: 'ready' });
  },

  /**
   * Forgets everything and declares the question answered. Called on logout and
   * whenever a refresh fails — a failed refresh is the only reliable signal
   * that the browser's cookie is no longer worth anything.
   */
  clear(): void {
    accessToken = null;
    publish({ user: null, status: 'ready' });
  },

  /** Announces that boot is spending the cookie, so gates hold instead of redirecting. */
  markRestoring(): void {
    if (snapshot.status !== 'unknown') {
      return;
    }
    publish({ user: snapshot.user, status: 'restoring' });
  },
};
