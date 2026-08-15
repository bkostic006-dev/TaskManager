import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import express from 'express';
import request from 'supertest';
import {
  AUTH_ROUTES,
  AuthSession,
  DomainError,
  ErrorCode,
  JWT_AUDIENCE,
  JWT_ISSUER,
  REFRESH_COOKIE,
} from '@tally/contracts';
import { AppModule } from '../src/app.module';
import { AuthClient } from '../src/auth/auth.client';

const SESSION: AuthSession = {
  accessToken: 'signed.access.token',
  user: {
    id: 'user-1',
    email: 'dana@northbay.dev',
    name: 'Dana Whitfield',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  refreshToken: 'the-opaque-refresh-token',
  refreshExpiresAt: new Date(Date.now() + 604_800_000).toISOString(),
};

/**
 * The gateway's own responsibilities, with the auth service replaced by a
 * double: status codes, the uniform error body, validation, the guard, and
 * cookie handling. What the auth service decides is tested where it is decided.
 */
describe('Gateway auth', () => {
  let app: INestApplication;
  let authClient: jest.Mocked<AuthClient>;
  let accessToken: string;

  beforeAll(async () => {
    authClient = {
      signup: jest.fn(),
      login: jest.fn(),
      refresh: jest.fn(),
      logout: jest.fn(),
      findUser: jest.fn(),
    } as unknown as jest.Mocked<AuthClient>;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthClient)
      .useValue(authClient)
      .compile();

    // Mirrors `main.ts`, and has to be restated because the body parser is an
    // adapter option rather than a module provider — the same reason CORS is
    // configured there. Without it the suite would run against a gateway that
    // still accepts form encoding, and the test below asserting it does not
    // would pass for the wrong reason.
    app = moduleRef.createNestApplication({ bodyParser: false });
    app.use(express.json());
    await app.init();

    accessToken = await app
      .get(JwtService)
      .signAsync(
        { sub: 'user-1', email: SESSION.user.email },
        { issuer: JWT_ISSUER, audience: JWT_AUDIENCE },
      );
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  it('answers signup with 201 and puts the refresh token only in an httpOnly cookie', async () => {
    authClient.signup.mockResolvedValue(SESSION);

    const res = await request(app.getHttpServer())
      .post(AUTH_ROUTES.signup)
      .send({ email: 'Dana@Northbay.dev ', password: 'correct-horse-battery', name: 'Dana' })
      .expect(201);

    expect(res.body).toEqual({ accessToken: SESSION.accessToken, user: SESSION.user });
    // The long-lived credential must not be readable by any script on the page.
    expect(JSON.stringify(res.body)).not.toContain(SESSION.refreshToken);

    const [cookie] = res.headers['set-cookie'] as unknown as string[];
    expect(cookie).toContain(`${REFRESH_COOKIE}=${SESSION.refreshToken}`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain(`Path=${AUTH_ROUTES.base}`);

    // The DTO's transform ran before the service saw the payload.
    expect(authClient.signup).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'dana@northbay.dev' }),
    );
  });

  it('rejects an invalid payload with 400, per-field details, and no upstream call', async () => {
    const res = await request(app.getHttpServer())
      .post(AUTH_ROUTES.signup)
      .send({ email: 'not-an-email', password: 'short', name: 'Dana', role: 'admin' })
      .expect(400);

    expect(res.body).toMatchObject({
      statusCode: 400,
      error: ErrorCode.Validation,
      details: {
        email: ['Enter a valid email address.'],
        password: ['Password must be at least 10 characters.'],
        // forbidNonWhitelisted: an unknown field is an error, not something to
        // strip silently and report success for.
        role: expect.arrayContaining([expect.stringContaining('should not exist')]),
      },
    });
    expect(authClient.signup).not.toHaveBeenCalled();
  });

  it('maps a rejected login to 401 in the uniform body', async () => {
    authClient.login.mockRejectedValue(
      new DomainError(ErrorCode.Unauthorized, "That email and password don't match."),
    );

    const res = await request(app.getHttpServer())
      .post(AUTH_ROUTES.login)
      .send({ email: 'dana@northbay.dev', password: 'not-the-password' })
      .expect(401);

    expect(res.body).toEqual({
      statusCode: 401,
      error: ErrorCode.Unauthorized,
      message: "That email and password don't match.",
    });
  });

  it('maps an unreachable auth service to 503', async () => {
    authClient.login.mockRejectedValue(
      new DomainError(ErrorCode.Upstream, 'That service is unavailable. Try again shortly.'),
    );

    const res = await request(app.getHttpServer())
      .post(AUTH_ROUTES.login)
      .send({ email: 'dana@northbay.dev', password: 'correct-horse-battery' })
      .expect(503);

    expect(res.body.error).toBe(ErrorCode.Upstream);
  });

  it('guards /auth/me, and forwards the id from the token rather than the request', async () => {
    await request(app.getHttpServer()).get(AUTH_ROUTES.me).expect(401);
    expect(authClient.findUser).not.toHaveBeenCalled();

    authClient.findUser.mockResolvedValue(SESSION.user);
    await request(app.getHttpServer())
      .get(AUTH_ROUTES.me)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    // The identity comes from the verified claims. Nothing the client sends can
    // widen it, which is what makes trusting the gateway downstream defensible.
    expect(authClient.findUser).toHaveBeenCalledWith('user-1');
  });

  it('rejects a token signed with another key', async () => {
    const forged = await new JwtService({ secret: 'not-the-gateways-key' }).signAsync(
      { sub: 'user-2', email: 'mallory@northbay.dev' },
      { issuer: JWT_ISSUER, audience: JWT_AUDIENCE },
    );

    await request(app.getHttpServer())
      .get(AUTH_ROUTES.me)
      .set('Authorization', `Bearer ${forged}`)
      .expect(401);
  });

  it('rejects a correctly signed token minted for a different issuer and audience', async () => {
    // The key alone is not the whole contract. A token signed with our secret
    // by something else in an estate — another service, an older deployment —
    // is still not a token for this gateway, and the pinned `issuer`/`audience`
    // are what say so.
    const foreign = await app
      .get(JwtService)
      .signAsync(
        { sub: 'user-2', email: 'mallory@northbay.dev' },
        { issuer: 'somewhere-else', audience: 'something-else' },
      );

    await request(app.getHttpServer())
      .get(AUTH_ROUTES.me)
      .set('Authorization', `Bearer ${foreign}`)
      .expect(401);
  });

  it('answers 401, not 404, when a valid token names an account that is gone', async () => {
    // The auth service is right to call this a 404 — it looked up an id and
    // found nothing. The client cannot act on that: a 404 leaves the session in
    // place, so a frontend that calls /auth/me on load retries forever with a
    // credential that will never work. 401 is the one status it already knows
    // means "clear the session".
    authClient.findUser.mockRejectedValue(
      new DomainError(ErrorCode.NotFound, 'That account no longer exists.'),
    );

    const res = await request(app.getHttpServer())
      .get(AUTH_ROUTES.me)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);

    expect(res.body.error).toBe(ErrorCode.Unauthorized);
  });

  it('refuses a form-encoded login, closing the no-preflight CSRF path', async () => {
    // A cross-origin `<form method="POST">` sending this content type is a CORS
    // *simple* request: no preflight, so the browser sends it and the gateway
    // would answer with `Set-Cookie` — logging the victim into the attacker's
    // account, where everything they then write is readable by its owner. CORS
    // hides only the response, which the attacker does not need. Accepting JSON
    // and nothing else means such a request cannot be made without a preflight,
    // and a preflight is something `enableCors` can refuse.
    const res = await request(app.getHttpServer())
      .post(AUTH_ROUTES.login)
      .type('form')
      .send({ email: 'mallory@northbay.dev', password: 'the-attackers-password' })
      .expect(400);

    expect(res.body.error).toBe(ErrorCode.Validation);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(authClient.login).not.toHaveBeenCalled();
  });

  it('refuses to refresh without a cookie, before troubling the auth service', async () => {
    await request(app.getHttpServer()).post(AUTH_ROUTES.refresh).expect(401);
    expect(authClient.refresh).not.toHaveBeenCalled();
  });

  it('rotates the cookie on refresh', async () => {
    const rotated = { ...SESSION, refreshToken: 'the-successor-token' };
    authClient.refresh.mockResolvedValue(rotated);

    const res = await request(app.getHttpServer())
      .post(AUTH_ROUTES.refresh)
      .set('Cookie', `${REFRESH_COOKIE}=${SESSION.refreshToken}`)
      .expect(200);

    expect(authClient.refresh).toHaveBeenCalledWith(SESSION.refreshToken);
    expect((res.headers['set-cookie'] as unknown as string[])[0]).toContain(
      `${REFRESH_COOKIE}=the-successor-token`,
    );
  });

  it('answers logout with 204 and an emptied cookie', async () => {
    authClient.logout.mockResolvedValue(undefined);

    const res = await request(app.getHttpServer())
      .post(AUTH_ROUTES.logout)
      .set('Cookie', `${REFRESH_COOKIE}=${SESSION.refreshToken}`)
      .expect(204);

    const [cookie] = res.headers['set-cookie'] as unknown as string[];
    expect(cookie).toContain(`${REFRESH_COOKIE}=;`);
    expect(cookie).toContain('Expires=Thu, 01 Jan 1970');
  });

  it('still logs out when the auth service cannot revoke the token', async () => {
    authClient.logout.mockRejectedValue(new DomainError(ErrorCode.Upstream, 'unavailable'));

    // Telling a user their logout failed leaves them somewhere they cannot get
    // out of, while the browser has already dropped the cookie regardless.
    const res = await request(app.getHttpServer())
      .post(AUTH_ROUTES.logout)
      .set('Cookie', `${REFRESH_COOKIE}=${SESSION.refreshToken}`)
      .expect(204);

    expect((res.headers['set-cookie'] as unknown as string[])[0]).toContain(`${REFRESH_COOKIE}=;`);
  });
});
