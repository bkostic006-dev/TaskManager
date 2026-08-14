import { HttpService } from '@nestjs/axios';
import { AxiosError } from 'axios';
import { Observable, defer, of, throwError } from 'rxjs';
import { ErrorCode } from '@tally/contracts';
import { UpstreamService } from './upstream.service';

/** An axios rejection shaped like a real one, with a service's error body. */
function upstreamFailure(status: number, body?: { error: ErrorCode; message: string }): AxiosError {
  return Object.assign(new AxiosError('Request failed'), {
    response: { status, data: body, statusText: '', headers: {}, config: {} },
  }) as AxiosError;
}

/**
 * Counts attempts by subscription, not by calls to `http.get`.
 *
 * `retry` resubscribes to the observable it was handed; it never asks the
 * HttpService for a new one. Since axios observables are cold — the request is
 * issued on subscribe — a resubscription *is* a second HTTP request, and
 * counting mock invocations would report one attempt no matter how many were
 * made.
 */
function coldAttempts(outcome: (attempt: number) => Observable<unknown>) {
  const state = { attempts: 0 };
  const source = defer(() => {
    state.attempts += 1;
    return outcome(state.attempts);
  });

  return { state, source };
}

describe('UpstreamService', () => {
  const http = { get: jest.fn(), post: jest.fn() };
  const upstream = new UpstreamService(http as unknown as HttpService);

  beforeEach(() => jest.resetAllMocks());

  it('retries a read once when the service faults', async () => {
    const { state, source } = coldAttempts((attempt) =>
      attempt === 1 ? throwError(() => upstreamFailure(500)) : of({ data: { id: 'user-1' } }),
    );
    http.get.mockReturnValue(source);

    await expect(upstream.get('http://auth/users/user-1')).resolves.toEqual({ id: 'user-1' });
    expect(state.attempts).toBe(2);
  });

  it('never retries a write', async () => {
    const { state, source } = coldAttempts(() => throwError(() => upstreamFailure(500)));
    http.post.mockReturnValue(source);

    await expect(upstream.post('http://auth/auth/signup', {})).rejects.toBeDefined();

    // The rule the whole helper exists for: a POST that failed on the way back
    // may well have succeeded, and a second attempt is a second account rather
    // than a second try.
    expect(state.attempts).toBe(1);
  });

  it('does not retry a read the service has already decided', async () => {
    const { state, source } = coldAttempts(() =>
      throwError(() =>
        upstreamFailure(404, {
          error: ErrorCode.NotFound,
          message: 'That account no longer exists.',
        }),
      ),
    );
    http.get.mockReturnValue(source);

    await expect(upstream.get('http://auth/users/ghost')).rejects.toMatchObject({
      code: ErrorCode.NotFound,
      message: 'That account no longer exists.',
    });
    // A 404 will be a 404 again in 100ms; retrying it only doubles the load.
    expect(state.attempts).toBe(1);
  });

  it('reports a service that answers with something it did not write as unavailable', async () => {
    // An HTML error page from a proxy, say. It carries a status, but nothing
    // identifying it as one of ours, so its meaning cannot be trusted.
    http.post.mockReturnValue(throwError(() => upstreamFailure(502)));

    await expect(upstream.post('http://auth/auth/login', {})).rejects.toMatchObject({
      code: ErrorCode.Upstream,
    });
  });
});
