import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { DomainError, ERROR_STATUS, ErrorCode } from '@tally/contracts';

/**
 * Renders this service's failures for its single caller, the gateway.
 *
 * Catches everything thrown out of a handler and emits `{ error, message }`
 * with the status {@link ERROR_STATUS} assigns to the code. This is a
 * translator, not a second public error contract: the gateway reads `error`
 * back off the body, re-raises the `DomainError`, and its own global filter
 * produces the `{ statusCode, error, message, details? }` a client sees.
 *
 * Anything that is not a `DomainError` is unplanned, so it is logged here with
 * its stack and leaves as a bare `500` — the gateway would otherwise be
 * forwarding a Prisma error message to the internet.
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
