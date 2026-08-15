import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { DomainError, ERROR_STATUS, ErrorCode } from '@tally/contracts';

/**
 * Renders this service's failures for its single caller, the gateway.
 *
 * Catches everything thrown out of a handler and emits `{ error, message }`
 * with the status {@link ERROR_STATUS} assigns to the code. This is a
 * translator, not a second public error contract: the gateway's
 * `UpstreamService` reads `error` back off the body, re-raises the
 * `DomainError`, and its own global filter produces the
 * `{ statusCode, error, message, details? }` a client sees.
 *
 * Without it every deliberate failure here leaves as an unshaped `500`, the
 * gateway finds no code it recognises in the body, and *every* domain answer
 * becomes `503 UPSTREAM_UNAVAILABLE`. The tenancy rule is the casualty that
 * matters: "another user's task is `404`" would report as a network fault.
 *
 * Anything that is not a `DomainError` is unplanned, so it is logged here with
 * its stack and leaves as a bare `500` — the gateway would otherwise be
 * forwarding a Prisma error message, table names included, to the internet.
 *
 * Duplicated from the auth service rather than shared: services never import
 * from each other, and `@tally/contracts` is types and constants, not Nest
 * providers.
 *
 * @throws Nothing. A filter that throws produces an unhandled rejection and a
 * hung socket, so every branch ends in a written response.
 */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof DomainError) {
      response.status(ERROR_STATUS[exception.code]).json({
        error: exception.code,
        message: exception.message,
      });
      return;
    }

    // Nest's own — an unmatched route, a malformed JSON body. Real, but not
    // domain failures, so they keep their status and lose their shape.
    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).json({
        error: ErrorCode.Internal,
        message: exception.message,
      });
      return;
    }

    this.logger.error(
      'Unhandled exception',
      exception instanceof Error ? exception.stack : exception,
    );

    response.status(ERROR_STATUS[ErrorCode.Internal]).json({
      error: ErrorCode.Internal,
      message: 'Something went wrong.',
    });
  }
}
