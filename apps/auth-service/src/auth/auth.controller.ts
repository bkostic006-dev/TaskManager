import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { AUTH_INTERNAL_ROUTES, AuthSession, AuthUser } from '@tally/contracts';
import { AuthService } from './auth.service';

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
  refresh(@Body() body: { refreshToken: string }): Promise<AuthSession> {
    return this.auth.refresh(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Body() body: { refreshToken: string }): Promise<void> {
    return this.auth.logout(body.refreshToken);
  }

  @Get('users/:id')
  findUser(@Param('id') id: string): Promise<AuthUser> {
    return this.auth.findUser(id);
  }
}
