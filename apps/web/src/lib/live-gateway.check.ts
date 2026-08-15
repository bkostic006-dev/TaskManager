/**
 * A manual check against a running stack, deliberately named `.check.ts` so the
 * hermetic suite never picks it up — `pnpm test` must not depend on Docker:
 *
 *   docker compose up -d --wait
 *   corepack pnpm --filter @tally/web exec jest \
 *     --testRegex "live-gateway\.check\.ts$" src/lib/live-gateway.check.ts
 *
 * It exists because two claims in this stage are only worth anything against
 * the real server: that a hard refresh restores the session from the httpOnly
 * cookie, and that concurrent expiries never put two refreshes on the wire —
 * the one situation the server's compare-and-swap is built to lose.
 *
 * Everything here is the real client module and the real gateway. The only
 * simulation is the browser's transport layer: axios under Node neither stores
 * cookies nor sends an `Origin`, so the adapter and interceptor below do what a
 * browser would and nothing else. App logic — the single-flight coordinator,
 * the retry guard, the session store — is untouched.
 */
import axios from 'axios';

import { apiClient, restoreSession } from './api-client';
import { login } from './auth-api';
import { authSession } from './auth-session';

const ORIGIN = 'http://localhost:3000';
const jar = new Map<string, string>();
let refreshCalls = 0;
let refreshesInFlight = 0;
let maxRefreshesInFlight = 0;

beforeAll(() => {
  apiClient.defaults.baseURL = 'http://localhost:3001';

  // The transport shim: cookies and Origin, plus a count of how many refreshes
  // are on the wire at the same instant. Two *sequential* refreshes are fine —
  // the second presents the cookie the first rotated to. Two *concurrent* ones
  // are the bug: they present the same token, and the compare-and-swap kills
  // one of them.
  const http = axios.getAdapter('http');
  apiClient.defaults.adapter = async (config) => {
    const isRefresh = config.url === '/auth/refresh';
    if (isRefresh) {
      refreshCalls += 1;
      refreshesInFlight += 1;
      maxRefreshesInFlight = Math.max(maxRefreshesInFlight, refreshesInFlight);
    }
    try {
      return await http(config);
    } finally {
      if (isRefresh) {
        refreshesInFlight -= 1;
      }
    }
  };

  apiClient.interceptors.request.use((config) => {
    config.headers.set('Origin', ORIGIN);
    if (jar.size > 0) {
      config.headers.set('Cookie', [...jar].map(([name, value]) => `${name}=${value}`).join('; '));
    }
    return config;
  });

  apiClient.interceptors.response.use((response) => {
    for (const raw of (response.headers['set-cookie'] as string[] | undefined) ?? []) {
      const [pair] = raw.split(';');
      const index = pair.indexOf('=');
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      if (value === '') {
        jar.delete(name);
      } else {
        jar.set(name, value);
      }
    }
    return response;
  });
});

jest.setTimeout(30_000);

it('restores a session after a hard refresh and coalesces 20 concurrent 401s', async () => {
  const auth = await login({ email: 'dana@northbay.dev', password: 'tally-demo-2026' });
  authSession.start(auth); // what useLogin's onSuccess does
  console.log('1. login          :', auth.user.email, '| cookie held:', jar.has('refresh_token'));
  expect(authSession.getAccessToken()).not.toBeNull();

  // A hard refresh: the tab is rebuilt, so the in-memory token is gone and the
  // httpOnly cookie is all that survived.
  authSession.clear();
  expect(authSession.getAccessToken()).toBeNull();
  console.log('2. hard refresh   : access token dropped, cookie kept');

  await restoreSession();
  console.log(
    '3. session restore:',
    authSession.getSnapshot().status,
    '|',
    authSession.getSnapshot().user?.name,
    '| refresh calls:',
    refreshCalls,
  );
  expect(authSession.getSnapshot().user?.email).toBe('dana@northbay.dev');

  // Now make every in-flight request expire at once, which is what an access
  // token timing out mid-page does. Server-side rotation is a compare-and-swap,
  // so 20 separate refreshes would mean 1 success and 19 logouts.
  const before = refreshCalls;
  authSession.start({ accessToken: 'not-a-valid-token', user: auth.user });

  const responses = await Promise.all(
    Array.from({ length: 20 }, () => apiClient.get('/tasks?page=1&pageSize=8')),
  );

  console.log(
    '4. 20 parallel 401s: statuses',
    [...new Set(responses.map((response) => response.status))],
    '| refreshes issued:',
    refreshCalls - before,
    '| max concurrent:',
    maxRefreshesInFlight,
    '| still signed in:',
    authSession.getSnapshot().user !== null,
  );
  expect(responses.every((response) => response.status === 200)).toBe(true);
  // The property that matters: never two refreshes on the wire at once, which
  // is the only situation the server's compare-and-swap can lose.
  expect(maxRefreshesInFlight).toBe(1);
  expect(authSession.getSnapshot().user).not.toBeNull();
  expect(responses[0].data).toHaveProperty('meta');
});
