import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AUTH_INTERNAL_ROUTES, AuthSession, AuthUser } from '@tally/contracts';
import { UpstreamService } from '../common/upstream.service';

/**
 * The gateway's view of the auth service: five calls, all of them through
 * {@link UpstreamService}, so the timeout and the retry policy apply without
 * this file restating them.
 *
 * Note which verb each uses. `findUser` is the only `get`, and therefore the
 * only call that retries — the other four either create a session or destroy
 * one, and repeating those on a dropped response would mint a second refresh
 * token or revoke a token the client still holds.
 */
@Injectable()
export class AuthClient {
  private readonly baseUrl: string;

  constructor(
    private readonly upstream: UpstreamService,
    config: ConfigService,
  ) {
    // `getOrThrow` for the reason main.ts gives about WEB_ORIGIN: a default is
    // worse than a crash. A missing variable would boot a gateway that looks
    // healthy and answers every auth call with a `503`.
    this.baseUrl = config.getOrThrow<string>('AUTH_SERVICE_URL');
  }

  signup(body: { email: string; password: string; name: string }): Promise<AuthSession> {
    return this.upstream.post<AuthSession>(this.url(AUTH_INTERNAL_ROUTES.signup), body);
  }

  login(body: { email: string; password: string }): Promise<AuthSession> {
    return this.upstream.post<AuthSession>(this.url(AUTH_INTERNAL_ROUTES.login), body);
  }

  refresh(refreshToken: string): Promise<AuthSession> {
    return this.upstream.post<AuthSession>(this.url(AUTH_INTERNAL_ROUTES.refresh), {
      refreshToken,
    });
  }

  logout(refreshToken: string): Promise<void> {
    return this.upstream.post<void>(this.url(AUTH_INTERNAL_ROUTES.logout), { refreshToken });
  }

  findUser(userId: string): Promise<AuthUser> {
    return this.upstream.get<AuthUser>(this.url(AUTH_INTERNAL_ROUTES.userById(userId)));
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }
}
