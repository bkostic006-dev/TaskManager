import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiError, DomainError, ERROR_STATUS, ErrorCode } from '@tally/contracts';

/**
 * The one place an error becomes a response. Every failure the public API emits
 * leaves through here, in the shape {@link ApiError} describes.
 *
 * It catches five kinds of thing:
 *
 * - `DomainError` — raised by the validation pipe, by the guard, or re-raised
 *   from a downstream service's reply. The code carries the meaning; the status
 *   comes from {@link ERROR_STATUS}, never from a literal at the throw site.
 * - A body-parser refusal — see {@link bodyParserCode}. Checked first, because
 *   these do not arrive as `HttpException`s and used to fall through to the
 *   `500`.
 * - A stack overflow from a body nested deeply enough to exhaust the pipe's
 *   recursion — see {@link isStackOverflow}.
 * - `HttpException` — Nest's own: a route that does not exist. Given the same
 *   body so a client never has to parse two formats, and a code that agrees
 *   with its status — see {@link NEST_STATUS_CODES}.
 * - Anything else — a bug. Logged with its stack and answered with a bare
 *   `500`, because the alternative is putting a stack trace on the internet.
 *
 * @throws Nothing. A filter that throws produces an unhandled rejection and a
 * hung socket, so every branch ends in a written response.
 */
/**
 * Domain codes for the statuses the framework raises on its own, before any
 * handler runs.
 *
 * These exceptions come from Nest and Express rather than from our code, so
 * they arrive with a status and no `ErrorCode`, and one has to be chosen for
 * them. Defaulting all of them to `Internal` published a body that contradicted
 * itself — a malformed JSON payload answered `400` with `"error":"INTERNAL"`,
 * which tells a client both "you sent something wrong" and "the server broke".
 * `400` here is Express's body parser rejecting the payload, which is a
 * validation failure by any reading; `404` is an unmatched route. Anything else
 * really is ours, and keeps `Internal`.
 */
const NEST_STATUS_CODES: Record<number, ErrorCode> = {
  400: ErrorCode.Validation,
  404: ErrorCode.NotFound,
};

/**
 * An error thrown by `express.json()` while reading the body.
 *
 * body-parser rejects a payload by throwing an `http-errors` instance — a
 * plain `Error` carrying a machine-readable `type` and a status — not a Nest
 * `HttpException`. Nothing above matched them, so a 150 KB login body was
 * answered `500 INTERNAL` while the log said `PayloadTooLargeError`: the client
 * was told the server had broken when the client had in fact sent too much.
 */
interface BodyParserError extends Error {
  type: string;
  status?: number;
  statusCode?: number;
}

function isBodyParserError(exception: unknown): exception is BodyParserError {
  if (!(exception instanceof Error)) {
    return false;
  }

  const { type, status, statusCode } = exception as Partial<BodyParserError>;
  return typeof type === 'string' && (typeof status === 'number' || typeof statusCode === 'number');
}

/**
 * The domain code for a body the parser refused, or `undefined` if this is not
 * a parser error at all.
 *
 * Only `entity.too.large` gets its own answer: it is the one refusal that is
 * not about the *content* of the body, and it is the one a client can act on by
 * sending less. Every other 4xx refusal — truncated JSON, a charset we cannot
 * decode, an aborted upload — is the client sending something unreadable, which
 * is a validation failure by any reading. A parser error carrying a 5xx status
 * is ours, and is left to the `500` branch with its stack logged.
 */
function bodyParserCode(exception: unknown): ErrorCode | undefined {
  if (!isBodyParserError(exception)) {
    return undefined;
  }

  if (exception.type === 'entity.too.large') {
    return ErrorCode.PayloadTooLarge;
  }

  const status = exception.status ?? exception.statusCode ?? 500;
  return status >= 400 && status < 500 ? ErrorCode.Validation : undefined;
}

/**
 * True only for V8's stack-overflow `RangeError`.
 *
 * A body nested ten thousand levels deep parses fine — `JSON.parse` is
 * iterative — and then overflows the stack inside `ValidationPipe`, which walks
 * the parsed object recursively to strip prototype keys. The request is what is
 * unreasonable, so `400` is the honest answer rather than `500`.
 *
 * Matched on the message rather than on `instanceof RangeError` alone, because
 * the broad version would answer `400` to any out-of-range bug in our own code
 * — an invalid `Array` length, a bad `toFixed` — and hide it as the client's
 * fault. It is still logged, since a runaway recursion of our own would land
 * here too and must not become invisible.
 */
function isStackOverflow(exception: unknown): boolean {
  return exception instanceof RangeError && exception.message.includes('call stack size exceeded');
}

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

    const parserCode = bodyParserCode(exception);
    if (parserCode) {
      return {
        statusCode: ERROR_STATUS[parserCode],
        error: parserCode,
        message:
          parserCode === ErrorCode.PayloadTooLarge
            ? 'That request body is too large.'
            : (exception as Error).message,
      };
    }

    if (isStackOverflow(exception)) {
      this.logger.warn(
        `Stack overflow handling ${request.method} ${request.url} — answered 400. ` +
          'Expected cause is a deeply nested request body; anything else here is a bug.',
      );

      return {
        statusCode: ERROR_STATUS[ErrorCode.Validation],
        error: ErrorCode.Validation,
        message: 'That request is nested too deeply.',
      };
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      return {
        statusCode,
        error: NEST_STATUS_CODES[statusCode] ?? ErrorCode.Internal,
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
