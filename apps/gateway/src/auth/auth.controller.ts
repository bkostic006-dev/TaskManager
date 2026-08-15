import { Body, Controller, Get, HttpCode, Logger, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import {
  AUTH_ROUTES,
  AuthResponse,
  AuthSession,
  AuthUser,
  DomainError,
  ErrorCode,
  REFRESH_COOKIE,
} from '@tally/contracts';
import { CurrentUser, type RequestUser } from '../common/current-user.decorator';
import { Public } from '../common/public.decorator';
import { AuthClient } from './auth.client';
import { clearRefreshCookie, parseCookieSecure, setRefreshCookie } from './refresh-cookie';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';

/**
 * The public authentication surface.
 *
 * Every cookie in the system is written and cleared in this file. The auth
 * service returns a refresh token as a value and knows nothing about `Set-Cookie`,
 * `SameSite` or the browser's origin — that is a transport concern belonging to
 * the only component with a browser on the other end.
 */
@Controller(AUTH_ROUTES.base)
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private readonly cookieSecure: boolean;

  constructor(
    private readonly auth: AuthClient,
    config: ConfigService,
  ) {
    this.cookieSecure = parseCookieSecure(config.getOrThrow<string>('COOKIE_SECURE'));
  }

  @Public()
  @Post('signup')
  async signup(
    @Body() body: SignupDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    return this.establish(await this.auth.signup(body), response);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    return this.establish(await this.auth.login(body), response);
  }

  /**
   * Trades the refresh cookie for a new access token and a new cookie.
   *
   * Public in the guard's sense — the whole point is that it works when the
   * access token has expired — but not unauthenticated: the cookie is the
   * credential, and a request without one is rejected here rather than sent
   * downstream to be rejected there.
   *
   * @throws DomainError `Unauthorized` when no cookie is present, and again
   * from the auth service if the token is dead, expired, or already rotated.
   */
  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const token = this.readRefreshCookie(request);
    if (!token) {
      throw new DomainError(ErrorCode.Unauthorized, 'That session has expired. Log in again.');
    }

    return this.establish(await this.auth.refresh(token), response);
  }

  /**
   * Ends the session. Always `204`, and always clears the cookie.
   *
   * Revocation is attempted but its failure is not propagated. A user who
   * clicks "log out" and is told `503` is left in a state they cannot leave,
   * still holding a cookie, while the browser has in fact already been cleared
   * — the error would describe a backend condition as a user-facing failure.
   * Clearing the cookie is the part that protects them, and it happens either
   * way; an unrevoked token then simply expires on its own schedule. The
   * failure is logged rather than silently dropped.
   */
  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const token = this.readRefreshCookie(request);
    clearRefreshCookie(response, this.cookieSecure);

    if (!token) {
      return;
    }

    try {
      await this.auth.logout(token);
    } catch (error) {
      // error, not warn: a credential outliving its own revocation is a
      // security event, not an oddity. The user is still logged out as far as
      // this browser is concerned — the cookie was cleared before the call —
      // but a copy taken beforehand stays valid until it expires. Stated in
      // the README's limitations rather than surfaced, because a 503 here
      // reports something the user cannot act on and cannot retry.
      this.logger.error(
        `Refresh token could not be revoked; it stays valid until it expires: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * The account behind the presented access token.
   *
   * A token that verifies but names an account that no longer exists is a
   * `401`, not the `404` the auth service raises for the same lookup. The
   * difference is what the client can do about it: `404` reads as "this page
   * is missing" and leaves the session in place, so a web client that refreshes
   * `/auth/me` on load loops on a credential that will never work again. `401`
   * is the one status the whole frontend already treats as "clear the session
   * and log in".
   *
   * @throws DomainError `Unauthorized` when the token is missing or invalid
   * (from the guard), or when its subject has been deleted.
   */
  @Get('me')
  async me(@CurrentUser() user: RequestUser): Promise<AuthUser> {
    try {
      return await this.auth.findUser(user.userId);
    } catch (error) {
      if (error instanceof DomainError && error.code === ErrorCode.NotFound) {
        throw new DomainError(ErrorCode.Unauthorized, 'That session has expired. Log in again.');
      }
      throw error;
    }
  }

  /**
   * Splits the session: the refresh token becomes a cookie, and only the access
   * token and the user reach the response body.
   *
   * Returning the session as-is would put the long-lived credential where any
   * script on the page can read it, which is exactly what the httpOnly cookie
   * exists to prevent.
   */
  private establish(session: AuthSession, response: Response): AuthResponse {
    setRefreshCookie(response, this.cookieSecure, session.refreshToken, session.refreshExpiresAt);

    return { accessToken: session.accessToken, user: session.user };
  }

  private readRefreshCookie(request: Request): string | undefined {
    const value = (request.cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }
}
