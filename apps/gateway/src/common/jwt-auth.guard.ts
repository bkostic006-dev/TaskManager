import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { AccessTokenClaims, DomainError, ErrorCode } from '@tally/contracts';
import { IS_PUBLIC_KEY } from './public.decorator';

/** The authenticated caller, attached to the request for downstream handlers. */
export interface RequestUser {
  userId: string;
  email: string;
}

/** An `express` request after this guard has run. */
export interface AuthenticatedRequest extends Request {
  user?: RequestUser;
}

/**
 * Verifies the access token and is the only component in the system that does.
 *
 * The services behind the gateway never see a JWT and hold no signing key: they
 * are handed a `userId` and trust it. That is safe *because of the topology* —
 * they sit on an `internal: true` network with no route from the host — and
 * would not be safe without it. It is the trade this design makes for services
 * that stay free of auth plumbing, and it is the first thing to revisit if
 * anything else ever gains access to that network.
 *
 * Applied globally, so a route is protected unless it says otherwise with
 * `@Public()`.
 *
 * @throws DomainError `Unauthorized` — `401` — when the header is missing,
 * malformed, signed with another key, or expired. All four are the same answer:
 * which one it was is only useful to someone probing.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request.headers.authorization);

    if (!token) {
      throw new DomainError(ErrorCode.Unauthorized, 'Sign in to continue.');
    }

    try {
      const claims = await this.jwt.verifyAsync<AccessTokenClaims>(token);
      request.user = { userId: claims.sub, email: claims.email };
      return true;
    } catch {
      throw new DomainError(ErrorCode.Unauthorized, 'That session has expired. Log in again.');
    }
  }
}

function extractBearerToken(header: string | undefined): string | undefined {
  const [scheme, value] = header?.split(' ') ?? [];
  return scheme?.toLowerCase() === 'bearer' && value ? value : undefined;
}
