import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';

/**
 * The brief's request logging: one line per request, with method, path, status
 * and elapsed milliseconds.
 *
 * The line is written from the response's `finish` event rather than from a
 * `tap` on the handler's stream. An interceptor's error arm fires *before* the
 * exception filter has chosen a status, so a failed request logged there would
 * report `200` for something the client received as a `401`. `finish` fires
 * once the bytes are on the wire, which makes the log agree with reality on
 * both paths and needs no second branch.
 *
 * Method, URL, status and duration only — never a body or a header. Those carry
 * passwords, access tokens and refresh cookies, and a log file is the wrong
 * place for all three.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Request');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const startedAt = Date.now();

    response.once('finish', () => {
      this.logger.log(
        `${request.method} ${request.originalUrl} ${response.statusCode} ${Date.now() - startedAt}ms`,
      );
    });

    return next.handle();
  }
}
