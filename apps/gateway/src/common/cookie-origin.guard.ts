import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { DomainError, ErrorCode, REFRESH_COOKIE } from '@tally/contracts';
import { SAFE_METHODS } from './safe-methods';

/**
 * Refuses a state-changing request that spends the refresh cookie on behalf of
 * a page we did not serve.
 *
 * `/auth/login` is safe from CSRF because its credential is in the body and the
 * gateway parses only JSON, which a cross-origin form cannot send without a
 * preflight. `/auth/refresh` and `/auth/logout` take their credential from the
 * cookie and never read the body, so that protection does not reach them: they
 * answer a `text/plain` or form-encoded POST just as happily. Today the cookie
 * is `SameSite=Lax` and a cross-site POST simply does not carry it — but the
 * plan and `refresh-cookie.ts` both record that a deployment with the web app
 * and the API on different domains needs `SameSite=None; Secure`, and under
 * `None` a hostile page could POST `/auth/logout` and log the victim out
 * without ever reading the response.
 *
 * The rule is deliberately keyed on the *cookie*, not on a list of routes: any
 * future endpoint that accepts this credential is covered the day it is
 * written, and no one has to remember to annotate it. An absent `Origin` is
 * allowed, because a browser always sends one on a cross-site POST while
 * non-browser clients — curl, the README's examples, the Next server — send
 * none; requiring it would break documented usage to close nothing.
 *
 * A CSRF token would be the heavier answer. It buys nothing here that this does
 * not, given the cookie is only ever spent by these two routes.
 *
 * @throws DomainError `Unauthorized` — `401` — when the request carries the
 * refresh cookie, changes state, and names an origin that is not `WEB_ORIGIN`.
 */
@Injectable()
export class CookieOriginGuard implements CanActivate {
  private readonly webOrigin: string;

  constructor(config: ConfigService) {
    // Same variable CORS is configured from, and required for the same reason:
    // a default here would be a deployment quietly trusting an origin nobody
    // chose.
    this.webOrigin = config.getOrThrow<string>('WEB_ORIGIN');
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (SAFE_METHODS.has(request.method)) {
      return true;
    }

    const cookie = (request.cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE];
    if (typeof cookie !== 'string' || cookie.length === 0) {
      return true;
    }

    const origin = request.headers.origin;
    if (origin === undefined || origin === this.webOrigin) {
      return true;
    }

    throw new DomainError(ErrorCode.Unauthorized, 'That request came from an unrecognised origin.');
  }
}
