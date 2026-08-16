import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerLimitDetail } from '@nestjs/throttler';
import type { Request } from 'express';
import { DomainError, ErrorCode } from '@tally/contracts';

/**
 * `@nestjs/throttler`'s guard, with one thing changed: what it throws.
 *
 * **Catches** nothing itself — it counts requests per caller per handler and
 * refuses the ones over the limit configured by `@Throttle()`. **Emits** a
 * `DomainError` carrying {@link ErrorCode.Throttled}, so the refusal leaves
 * through `AllExceptionsFilter`'s `DomainError` branch in the same
 * `{ statusCode, error, message }` envelope as every other failure.
 *
 * The stock guard throws `ThrottlerException`, which is a Nest `HttpException`.
 * That is not wrong, but it lands in the filter's `HttpException` branch, where
 * the code is looked up in a small map of statuses the framework raises on its
 * own — and `429` is not in it, so the body came out
 * `{"statusCode":429,"error":"INTERNAL","message":"ThrottlerException: Too Many Requests"}`.
 * A client told `INTERNAL` for its own rate limit is told the server broke, and
 * an error shape that differs from every other error is a defect whatever the
 * status line says.
 *
 * That is measured, not assumed: delegating this method back to
 * `super.throwThrottlingException` produces exactly the body quoted above and
 * fails both tests in `test/throttle.e2e-spec.ts`, which assert the envelope
 * rather than only the status.
 *
 * The `Retry-After` header the base class sets is untouched — it is written
 * before this runs.
 *
 * It also writes the only record of the refusal. `LoggingInterceptor` logs from
 * the response's `finish` event, and interceptors do not run for a request a
 * guard rejected — measured against the running stack, 97 request log lines and
 * not one of them a guard rejection. So without this line a rate limit doing
 * its job would be invisible in the logs, which is the wrong way round: the
 * refusals are the interesting traffic.
 *
 * It logs `request.path`, not `originalUrl`: the claim here is method and path
 * only, never the tracker or the body, and `originalUrl` carries the query —
 * so a throttled `GET /tasks?search=<whatever the user typed>` wrote that
 * search term into the log while this comment said it did not. Found by an
 * adversarial review of this stage; the sentence was narrower than the code.
 *
 * @throws DomainError `Throttled` — `429` — when the caller is over the limit
 * for this handler.
 */
@Injectable()
export class DomainThrottlerGuard extends ThrottlerGuard {
  private readonly logger = new Logger('RateLimit');

  protected async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const request = context.switchToHttp().getRequest<Request>();
    this.logger.warn(
      `${request.method} ${request.path} 429 — over ${detail.limit} per ${detail.ttl}ms`,
    );

    throw new DomainError(ErrorCode.Throttled, 'Too many requests. Wait a moment and try again.');
  }
}
