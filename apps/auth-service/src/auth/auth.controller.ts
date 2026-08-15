import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  AUTH_INTERNAL_ROUTES,
  AuthSession,
  AuthUser,
  DomainError,
  ErrorCode,
} from '@tally/contracts';
import { AuthService } from './auth.service';

/** Body of the two routes that take an opaque refresh token. */
interface RefreshTokenBody {
  refreshToken?: unknown;
}

/**
 * Narrows an unvalidated body to the token these two routes need.
 *
 * There is no `ValidationPipe` on this service — DTOs live in the gateway by
 * design — so nothing between the socket and the handler has looked at this
 * body. Reading `body.refreshToken` straight through means an empty `POST`
 * dereferences `undefined`, and a `TypeError` is a `500`: an unhandled crash
 * reported as a server fault for what is a malformed request.
 *
 * @throws DomainError `Validation` when the field is absent or not a non-empty
 * string.
 */
function requireRefreshToken(body: RefreshTokenBody | undefined): string {
  const token = body?.refreshToken;

  if (typeof token !== 'string' || token.length === 0) {
    throw new DomainError(ErrorCode.Validation, 'A refresh token is required.');
  }

  return token;
}

/**
 * The auth service's internal surface. Bodies arrive already validated by the
 * gateway's DTOs, and the network is `internal: true`, so there is no guard
 * here — reachability is the authorisation.
 */
@Controller(AUTH_INTERNAL_ROUTES.base)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('signup')
  signup(@Body() body: { email: string; password: string; name: string }): Promise<AuthSession> {
    return this.auth.signup(body);
  }

  @Post('login')
  @HttpCode(200)
  login(@Body() body: { email: string; password: string }): Promise<AuthSession> {
    return this.auth.login(body);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() body: RefreshTokenBody): Promise<AuthSession> {
    return this.auth.refresh(requireRefreshToken(body));
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Body() body: RefreshTokenBody): Promise<void> {
    return this.auth.logout(requireRefreshToken(body));
  }

  @Get('users/:id')
  findUser(@Param('id') id: string): Promise<AuthUser> {
    return this.auth.findUser(id);
  }
}
