import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AxiosError, AxiosRequestConfig } from 'axios';
import { Observable, catchError, firstValueFrom, map, retry, throwError, timer } from 'rxjs';
import { TimeoutError, timeout } from 'rxjs';
import { DomainError, ERROR_STATUS, ErrorCode, UPSTREAM_TIMEOUT_MS } from '@tally/contracts';

/** One retry, not three: a read the user is waiting on has a latency budget. */
const RETRY_COUNT = 1;
const RETRY_DELAY_MS = 100;

/** Body shape every downstream service's translating filter emits. */
interface UpstreamErrorBody {
  error?: ErrorCode;
  message?: string;
}

/**
 * The single door between the gateway and the services behind it. Nothing else
 * in this app talks HTTP outward.
 *
 * Two guarantees live here because they only hold if they hold everywhere:
 *
 * 1. **Every call times out at three seconds.** A downstream service that hangs
 *    would otherwise pin a gateway request until the client gives up, and the
 *    reviewer's browser would show a spinner with no explanation.
 * 2. **Only reads retry.** `retry` on the shared path would make a dropped
 *    response to `POST /tasks` create a second task — the request succeeded, the
 *    acknowledgement did not, and the gateway cannot tell those apart. So the
 *    method is what decides, and it is decided here rather than at each call
 *    site, where "just this once" is a one-line change.
 */
@Injectable()
export class UpstreamService {
  private readonly logger = new Logger(UpstreamService.name);

  constructor(private readonly http: HttpService) {}

  /** Safe to repeat, so it retries a timeout or a 5xx once. */
  get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return this.send(this.http.get<T>(url, config), RETRY_COUNT);
  }

  /** Never retried: a repeated POST is a second write, not a second attempt. */
  post<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return this.send(this.http.post<T>(url, body, config), 0);
  }

  private send<T>(request$: Observable<{ data: T }>, retries: number): Promise<T> {
    return firstValueFrom(
      request$.pipe(
        timeout(UPSTREAM_TIMEOUT_MS),
        retry({
          count: retries,
          // A predicate, not a plain count: a 401 or a 409 is the service's
          // considered answer and will be identical next time. Retrying it
          // doubles the load to reach the same conclusion 100ms later.
          delay: (error: unknown, attempt: number) =>
            this.isTransient(error)
              ? timer(RETRY_DELAY_MS * attempt)
              : throwError(() => error as Error),
        }),
        map((response) => response.data),
        catchError((error: unknown) => throwError(() => this.toDomainError(error))),
      ),
    );
  }

  /** Worth a second attempt: nobody's decision, just a bad moment. */
  private isTransient(error: unknown): boolean {
    if (error instanceof TimeoutError) {
      return true;
    }

    const status = (error as AxiosError).response?.status;
    return status === undefined || status >= 500;
  }

  /**
   * Turns a transport failure back into the domain failure that caused it.
   *
   * The service already decided what went wrong and said so in the body; this
   * reads that `error` code back and re-raises it, so the gateway's global
   * filter sees one kind of exception whatever its origin. A response we cannot
   * read that way — a timeout, a refused connection, an HTML error page from
   * something that is not our service — is `Upstream`, which is `503`: the
   * request was fine, the system behind it was not.
   */
  private toDomainError(error: unknown): DomainError {
    if (error instanceof DomainError) {
      return error;
    }

    const response = (error as AxiosError<UpstreamErrorBody>).response;
    const code = response?.data?.error;

    // `code in ERROR_STATUS` is the trust check: a body that does not name a
    // code we know is not one of our services answering, whatever its status.
    if (code && code in ERROR_STATUS) {
      return new DomainError(code, response?.data?.message ?? 'Request rejected.');
    }

    this.logger.warn(
      `Upstream call failed: ${error instanceof Error ? error.message : String(error)}`,
    );

    return new DomainError(ErrorCode.Upstream, 'That service is unavailable. Try again shortly.');
  }
}
