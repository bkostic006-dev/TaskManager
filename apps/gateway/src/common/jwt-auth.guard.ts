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
 * malformed, signed with another key, expired, or carrying claims that are not
 * the shape {@link AccessTokenClaims} promises. All of them are the same
 * answer: which one it was is only useful to someone probing.
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

    let claims: unknown;
    try {
      claims = await this.jwt.verifyAsync<object>(token);
    } catch {
      throw new DomainError(ErrorCode.Unauthorized, REJECTED);
    }

    if (!isAccessTokenClaims(claims)) {
      throw new DomainError(ErrorCode.Unauthorized, REJECTED);
    }

    request.user = { userId: claims.sub, email: claims.email };
    return true;
  }
}

/** The one answer to every way a token can fail. Stated once so it stays one. */
const REJECTED = 'That session has expired. Log in again.';

/**
 * Checks that the verified payload actually is {@link AccessTokenClaims}.
 *
 * A signature check says who wrote the payload, not what is in it: the generic
 * on `verifyAsync` is an assertion TypeScript takes on faith, and JWT claims are
 * arbitrary JSON. A token minted with `sub: ["<uuid>"]` verified, and the array
 * flowed onward as the caller's identity — it survived the auth service's uuid
 * regex because a one-element array stringifies back to the same uuid. That is
 * contained today; it stops being contained the moment `userId` is spliced into
 * a query builder, so the type is asserted here, once, before anything reads it.
 *
 * `exp` is part of the check rather than of `verifyOptions` because
 * `jsonwebtoken@9` has no `requireExp` — it verifies an exp-less token whatever
 * you pass. The `maxAge` there bounds such a token's life; this refuses it.
 */
function isAccessTokenClaims(claims: unknown): claims is AccessTokenClaims {
  if (typeof claims !== 'object' || claims === null) {
    return false;
  }

  const { sub, email, exp } = claims as Partial<AccessTokenClaims>;
  return (
    typeof sub === 'string' &&
    sub.length > 0 &&
    typeof email === 'string' &&
    typeof exp === 'number'
  );
}

function extractBearerToken(header: string | undefined): string | undefined {
  const [scheme, value] = header?.split(' ') ?? [];
  return scheme?.toLowerCase() === 'bearer' && value ? value : undefined;
}
