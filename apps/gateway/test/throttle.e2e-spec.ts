import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  ACCESS_TOKEN_TTL,
  AUTH_ROUTES,
  DEMO_CREDENTIALS,
  DomainError,
  ErrorCode,
  JWT_AUDIENCE,
  JWT_ISSUER,
  TASK_ROUTES,
} from '@tally/contracts';
import { AppModule } from '../src/app.module';
import { RATE_LIMITS } from '../src/common/throttle';
import { AuthClient } from '../src/auth/auth.client';
import { TasksClient } from '../src/tasks/tasks.client';

const USER_ID = '00000000-0000-4000-8000-000000000001';

/**
 * The two things worth asserting about the rate limit: that a refusal looks
 * like every other error this API emits, and that the two limits are actually
 * different — a single app-wide ceiling would pass a test that only counted to
 * `429` on one route.
 */
describe('Gateway rate limiting', () => {
  let app: INestApplication;
  let accessToken: string;

  beforeAll(async () => {
    const auth = {
      login: jest
        .fn()
        .mockRejectedValue(new DomainError(ErrorCode.Unauthorized, 'Check your details.')),
    };
    const tasks = {
      list: jest.fn().mockResolvedValue({
        data: [],
        meta: { page: 1, pageSize: 8, total: 0, totalPages: 0 },
      }),
    };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthClient)
      .useValue(auth)
      .overrideProvider(TasksClient)
      .useValue(tasks)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    accessToken = await app
      .get(JwtService)
      .signAsync(
        { sub: USER_ID, email: DEMO_CREDENTIALS.email },
        { issuer: JWT_ISSUER, audience: JWT_AUDIENCE, expiresIn: ACCESS_TOKEN_TTL },
      );
  });

  afterAll(async () => {
    await app.close();
  });

  it('refuses an over-limit login in the same envelope as every other error', async () => {
    const attempt = () =>
      request(app.getHttpServer())
        .post(AUTH_ROUTES.login)
        .send({ email: DEMO_CREDENTIALS.email, password: 'not-the-password' });

    for (let i = 0; i < RATE_LIMITS.authWrite.limit; i += 1) {
      const allowed = await attempt();
      expect(allowed.status).not.toBe(429);
    }

    const refused = await attempt();

    // Not just the status. Nest's own ThrottlerException is an HttpException,
    // and left alone it lands in the filter's HttpException branch, where 429
    // is not a status the framework map knows — so the body came out
    // `"error":"INTERNAL"` with the exception's class name as the message. An
    // error shaped differently from every other error is the defect here; the
    // status line was already right.
    expect(refused.status).toBe(429);
    expect(refused.body).toEqual({
      statusCode: 429,
      error: ErrorCode.Throttled,
      message: 'Too many requests. Wait a moment and try again.',
    });
    expect(refused.headers['retry-after']).toBeDefined();
  });

  it('lets the task list take a burst that would have exhausted the auth limit', async () => {
    const get = () =>
      request(app.getHttpServer())
        .get(TASK_ROUTES.base)
        .set('Authorization', `Bearer ${accessToken}`);

    // A dashboard changing filters, sorting and paging produces bursts like
    // this. Against the auth allowance every request past the fifth would be a
    // 429, which is exactly why one number cannot serve both routes.
    expect(RATE_LIMITS.taskRead.limit).toBeGreaterThan(RATE_LIMITS.authWrite.limit * 10);

    for (let i = 0; i < RATE_LIMITS.authWrite.limit * 3; i += 1) {
      await get().expect(200);
    }

    // And the generous limit is a limit, not an absence of one: spend the rest
    // of it and the next request is refused the same way login was.
    for (let i = RATE_LIMITS.authWrite.limit * 3; i < RATE_LIMITS.taskRead.limit; i += 1) {
      await get().expect(200);
    }

    const refused = await get().expect(429);
    expect(refused.body.error).toBe(ErrorCode.Throttled);
  }, 30_000);
});
