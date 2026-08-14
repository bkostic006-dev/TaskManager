import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiError, DomainError, ERROR_STATUS, ErrorCode } from '@tally/contracts';

/**
 * The one place an error becomes a response. Every failure the public API emits
 * leaves through here, in the shape {@link ApiError} describes.
 *
 * It catches three kinds of thing:
 *
 * - `DomainError` — raised by the validation pipe, by the guard, or re-raised
 *   from a downstream service's reply. The code carries the meaning; the status
 *   comes from {@link ERROR_STATUS}, never from a literal at the throw site.
 * - `HttpException` — Nest's own, almost always a 404 for a route that does not
 *   exist. Given the same body so a client never has to parse two formats.
 * - Anything else — a bug. Logged with its stack and answered with a bare
 *   `500`, because the alternative is putting a stack trace on the internet.
 *
 * @throws Nothing. A filter that throws produces an unhandled rejection and a
 * hung socket, so every branch ends in a written response.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();

    const body = this.toBody(exception, request);
    response.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown, request: Request): ApiError {
    if (exception instanceof DomainError) {
      return {
        statusCode: ERROR_STATUS[exception.code],
        error: exception.code,
        message: exception.message,
        ...(exception.details ? { details: exception.details } : {}),
      };
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      return {
        statusCode,
        error: statusCode === 404 ? ErrorCode.NotFound : ErrorCode.Internal,
        message: exception.message,
      };
    }

    this.logger.error(
      `Unhandled ${request.method} ${request.url}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    return {
      statusCode: ERROR_STATUS[ErrorCode.Internal],
      error: ErrorCode.Internal,
      message: 'Something went wrong.',
    };
  }
}
