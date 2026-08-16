import {
  AxiosError,
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { AUTH_ROUTES, type AuthResponse, ErrorCode } from '@tally/contracts';

/**
 * The single-flight refresh coordinator.
 *
 * This is the branchiest and highest-risk logic in the frontend, and the one
 * place where two correct behaviours destroy each other: server-side rotation
 * is a compare-and-swap, so the *second* concurrent `/auth/refresh` is answered
 * `401` on purpose. A client that opens two therefore logs a valid session out
 * at random. Every test below exists because that failure is invisible in
 * ordinary use and reads as flakiness rather than as a race.
 *
 * The transport is stubbed at axios's adapter — the lowest seam that still runs
 * the real interceptors, the real retry guard and the real promise
 * coordination.
 */

const USER = { id: 'u1', email: 'dana@northbay.dev', name: 'Dana Reyes', createdAt: '2026-01-01' };

function respond<T>(config: InternalAxiosRequestConfig, status: number, data: T): AxiosResponse<T> {
  return { data, status, statusText: '', headers: new AxiosHeaders(), config };
}

/** What a real adapter does with a non-2xx: reject with the response attached. */
function fail(config: InternalAxiosRequestConfig, status: number, data: unknown): Promise<never> {
  return Promise.reject(
    new AxiosError(
      'Request failed',
      AxiosError.ERR_BAD_REQUEST,
      config,
      {},
      respond(config, status, data),
    ),
  );
}

const UNAUTHORIZED_BODY = {
  statusCode: 401,
  error: ErrorCode.Unauthorized,
  message: 'That session has expired. Log in again.',
};

/** What the gateway's throttler guard actually emits, message included. */
const THROTTLED_BODY = {
  statusCode: 429,
  error: ErrorCode.Throttled,
  message: 'Too many requests. Wait a moment and try again.',
};

function deferred(): { promise: Promise<void>; release: () => void } {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

type Client = typeof import('./api-client');
type Session = typeof import('./auth-session');

/**
 * A fresh copy of the module graph per test. The coordinator's whole state is
 * module-level — that is the point of it — so it has to be rebuilt rather than
 * reset between cases.
 */
async function load(): Promise<{ client: Client; session: Session }> {
  jest.resetModules();
  const client = await import('./api-client');
  const session = await import('./auth-session');
  return { client, session };
}

describe('api-client: single-flight refresh', () => {
  it('coalesces concurrent 401s into exactly one refresh, then replays both with the new token', async () => {
    const { client, session } = await load();
    const gate = deferred();
    const calls: string[] = [];
    let refreshes = 0;

    client.apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      const url = config.url ?? '';
      calls.push(`${url}:${String(config.headers.get('Authorization') ?? 'none')}`);

      if (url === AUTH_ROUTES.refresh) {
        refreshes += 1;
        await gate.promise;
        return respond<AuthResponse>(config, 200, { accessToken: 'fresh-token', user: USER });
      }
      // Only the first attempt is unauthorized; the replay carries the new token.
      if (config.retried !== true) {
        return fail(config, 401, UNAUTHORIZED_BODY);
      }
      return respond(config, 200, { ok: url });
    };

    const both = Promise.all([client.apiClient.get('/tasks'), client.apiClient.get('/tasks/1')]);

    // Let both 401s land before the refresh is allowed to answer. Without the
    // shared promise this is the exact window in which the second request opens
    // its own refresh and burns the token the first one is rotating.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(refreshes).toBe(1);

    gate.release();
    const [first, second] = await both;

    expect(refreshes).toBe(1);
    expect(first.data).toEqual({ ok: '/tasks' });
    expect(second.data).toEqual({ ok: '/tasks/1' });
    expect(session.authSession.getAccessToken()).toBe('fresh-token');
    // Two unauthenticated first attempts, one refresh, two replays bearing the
    // rotated token.
    expect(calls).toEqual([
      '/tasks:none',
      '/tasks/1:none',
      `${AUTH_ROUTES.refresh}:none`,
      '/tasks:Bearer fresh-token',
      '/tasks/1:Bearer fresh-token',
    ]);
  });

  it('shares one refresh between the boot restore and a concurrent 401', async () => {
    const { client, session } = await load();
    const gate = deferred();
    let refreshes = 0;

    client.apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      if (config.url === AUTH_ROUTES.refresh) {
        refreshes += 1;
        await gate.promise;
        return respond<AuthResponse>(config, 200, { accessToken: 'fresh-token', user: USER });
      }
      if (config.retried !== true) {
        return fail(config, 401, UNAUTHORIZED_BODY);
      }
      return respond(config, 200, { ok: true });
    };

    const restore = client.restoreSession();
    const request = client.apiClient.get('/tasks');
    await new Promise((resolve) => setTimeout(resolve, 0));

    gate.release();
    await Promise.all([restore, request]);

    expect(refreshes).toBe(1);
    expect(session.authSession.getSnapshot()).toEqual({
      user: USER,
      status: 'ready',
      unavailableReason: null,
    });
  });

  it('runs the boot restore once however many times it is called (StrictMode double-invoke)', async () => {
    const { client, session } = await load();
    let refreshes = 0;

    client.apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      refreshes += 1;
      return respond<AuthResponse>(config, 200, { accessToken: 'fresh-token', user: USER });
    };

    await Promise.all([client.restoreSession(), client.restoreSession()]);
    await client.restoreSession();

    expect(refreshes).toBe(1);
    expect(session.authSession.getSnapshot().user).toEqual(USER);
  });

  it('clears the session when the refresh is refused, and surfaces the original failure', async () => {
    const { client, session } = await load();
    let refreshes = 0;

    client.apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      if (config.url === AUTH_ROUTES.refresh) {
        refreshes += 1;
        return fail(config, 401, UNAUTHORIZED_BODY);
      }
      return fail(config, 401, UNAUTHORIZED_BODY);
    };

    session.authSession.start({ accessToken: 'stale-token', user: USER });

    await expect(client.apiClient.get('/tasks')).rejects.toMatchObject({
      name: 'ApiRequestError',
      statusCode: 401,
      error: ErrorCode.Unauthorized,
    });

    expect(refreshes).toBe(1);
    expect(session.authSession.getAccessToken()).toBeNull();
    expect(session.authSession.getSnapshot()).toEqual({
      user: null,
      status: 'ready',
      unavailableReason: null,
    });
  });

  it('keeps the session when the refresh is throttled, so one noisy client cannot sign the rest out', async () => {
    const { client, session } = await load();

    client.apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      if (config.url === AUTH_ROUTES.refresh) {
        return fail(config, 429, THROTTLED_BODY);
      }
      return fail(config, 401, UNAUTHORIZED_BODY);
    };

    session.authSession.start({ accessToken: 'live-token', user: USER });

    // The caller still learns their own request failed…
    await expect(client.apiClient.get('/tasks')).rejects.toMatchObject({ statusCode: 401 });

    // …but `/auth/refresh` sits in an IP-tracked bucket shared by everyone
    // behind the bridge address, so its 429 says nothing about this credential.
    expect(session.authSession.getAccessToken()).toBe('live-token');
    expect(session.authSession.getSnapshot()).toEqual({
      user: USER,
      status: 'ready',
      unavailableReason: null,
    });
  });

  it('does not retry a request that has already been replayed once', async () => {
    const { client } = await load();
    let refreshes = 0;
    let attempts = 0;

    client.apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      if (config.url === AUTH_ROUTES.refresh) {
        refreshes += 1;
        return respond<AuthResponse>(config, 200, { accessToken: 'fresh-token', user: USER });
      }
      attempts += 1;
      return fail(config, 401, UNAUTHORIZED_BODY);
    };

    await expect(client.apiClient.get('/tasks')).rejects.toMatchObject({ statusCode: 401 });

    // One original, one replay, and then it stops. The refresh succeeded both
    // times it could have been asked for, so nothing but the retry guard ends
    // this loop.
    expect(attempts).toBe(2);
    expect(refreshes).toBe(1);
  });

  it('starts a new refresh for a later expiry rather than replaying the finished one', async () => {
    const { client } = await load();
    let refreshes = 0;
    let issued = 0;

    client.apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      if (config.url === AUTH_ROUTES.refresh) {
        refreshes += 1;
        return respond<AuthResponse>(config, 200, {
          accessToken: `token-${String(refreshes)}`,
          user: USER,
        });
      }
      issued += 1;
      if (config.retried !== true) {
        return fail(config, 401, UNAUTHORIZED_BODY);
      }
      return respond(config, 200, { ok: true });
    };

    await client.apiClient.get('/tasks');
    await client.apiClient.get('/tasks');

    expect(refreshes).toBe(2);
    expect(issued).toBe(4);
  });

  it('never refreshes for an anonymous request, so a wrong password stays a wrong password', async () => {
    const { client } = await load();
    let refreshes = 0;

    client.apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      if (config.url === AUTH_ROUTES.refresh) {
        refreshes += 1;
        return respond<AuthResponse>(config, 200, { accessToken: 'fresh-token', user: USER });
      }
      return fail(config, 401, {
        statusCode: 401,
        error: ErrorCode.Unauthorized,
        message: 'That email and password do not match.',
      });
    };

    const { login } = await import('./auth-api');
    await expect(login({ email: 'dana@northbay.dev', password: 'wrong' })).rejects.toMatchObject({
      name: 'ApiRequestError',
      statusCode: 401,
      message: 'That email and password do not match.',
    });

    expect(refreshes).toBe(0);
  });
});

/**
 * Boot has to end somewhere. `RequireAuth` holds a spinner for as long as the
 * session store says `restoring`, and nothing but `restoreSession` will ever
 * answer that question — so every way the first refresh can fail has to leave a
 * terminal state behind, and only one of them means "logged out".
 */
describe('api-client: the boot restore always reaches a terminal state', () => {
  it('ends throttled boot as unavailable, holding the gateway’s reason for the login page', async () => {
    const { client, session } = await load();

    client.apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) =>
      fail(config, 429, THROTTLED_BODY);

    await client.restoreSession();

    expect(session.authSession.getSnapshot()).toEqual({
      user: null,
      status: 'unavailable',
      unavailableReason: THROTTLED_BODY.message,
    });
  });

  it('ends a refused boot as ready with nobody signed in — no cookie is not an error', async () => {
    const { client, session } = await load();

    client.apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) =>
      fail(config, 401, UNAUTHORIZED_BODY);

    await client.restoreSession();

    expect(session.authSession.getSnapshot()).toEqual({
      user: null,
      status: 'ready',
      unavailableReason: null,
    });
  });

  it('ends an unreachable boot as unavailable rather than as a logged-out user', async () => {
    const { client, session } = await load();

    client.apiClient.defaults.adapter = async () => {
      throw new AxiosError('Network Error', AxiosError.ERR_NETWORK);
    };

    await client.restoreSession();

    const snapshot = session.authSession.getSnapshot();
    expect(snapshot.status).toBe('unavailable');
    expect(snapshot.unavailableReason).not.toBeNull();
  });
});
