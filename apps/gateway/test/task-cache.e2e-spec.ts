import { INestApplication } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  ACCESS_TOKEN_TTL,
  JWT_AUDIENCE,
  JWT_ISSUER,
  TASK_ROUTES,
  type Task,
  type TaskListResponse,
} from '@tally/contracts';
import { AppModule } from '../src/app.module';
import { TasksClient } from '../src/tasks/tasks.client';

const DANA = '00000000-0000-4000-8000-000000000001';
const MARCUS = '00000000-0000-4000-8000-000000000002';

/** The same URL both users ask for — byte for byte, which is the whole point. */
const SHARED_QUERY = `${TASK_ROUTES.base}?page=1&pageSize=8&status=all`;

function pageFor(userId: string): TaskListResponse {
  const task: Task = {
    id: `${userId}-task`,
    title: userId === DANA ? 'Rotate the Stripe API keys' : 'Renew the office lease',
    description: null,
    completed: false,
    completedAt: null,
    createdAt: '2026-08-10T08:00:00.000Z',
    updatedAt: '2026-08-10T08:00:00.000Z',
  };
  return { data: [task], meta: { page: 1, pageSize: 8, total: 1, totalPages: 1 } };
}

/**
 * The list cache, and the one property that makes it safe to have at all.
 *
 * `CacheInterceptor` keys on the request URL by default, and `GET /tasks?page=1`
 * is identical for every user — the identity is in the `Authorization` header,
 * which that key never sees. This suite exists to fail if `userId` ever stops
 * being part of the key, which was mutation-checked by deleting it and watching
 * the first test go red.
 */
describe('Gateway task list cache', () => {
  let app: INestApplication;
  let tasks: jest.Mocked<TasksClient>;
  let tokens: Record<string, string>;

  beforeAll(async () => {
    tasks = {
      list: jest.fn(),
      create: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      complete: jest.fn(),
      uncomplete: jest.fn(),
    } as unknown as jest.Mocked<TasksClient>;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TasksClient)
      .useValue(tasks)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const jwt = app.get(JwtService);
    const sign = (userId: string, email: string) =>
      jwt.signAsync(
        { sub: userId, email },
        { issuer: JWT_ISSUER, audience: JWT_AUDIENCE, expiresIn: ACCESS_TOKEN_TTL },
      );

    tokens = {
      [DANA]: await sign(DANA, 'dana@northbay.dev'),
      [MARCUS]: await sign(MARCUS, 'marcus@northbay.dev'),
    };
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    tasks.list.mockImplementation((userId: string) => Promise.resolve(pageFor(userId)));
    // The store outlives a test, so without this each case would inherit
    // whatever the last one left behind and "was this a hit?" would depend on
    // the order jest happened to run them in.
    await app.get<Cache>(CACHE_MANAGER).clear();
  });

  const auth = (userId: string) => ({ Authorization: `Bearer ${tokens[userId]}` });

  it('serves two users on an identical query string their own rows', async () => {
    // Dana first, so hers is what a URL-keyed cache would be holding.
    const dana = await request(app.getHttpServer()).get(SHARED_QUERY).set(auth(DANA)).expect(200);

    const marcus = await request(app.getHttpServer())
      .get(SHARED_QUERY)
      .set(auth(MARCUS))
      .expect(200);

    expect(dana.body.data[0].id).toBe(`${DANA}-task`);
    expect(marcus.body.data[0].id).toBe(`${MARCUS}-task`);
    expect(marcus.body.data[0].id).not.toBe(dana.body.data[0].id);

    // The stronger half: Marcus's request reached the task service. A cache hit
    // would have answered him from Dana's entry without asking anyone, so
    // "different rows" and "two upstream calls" fail together if the key stops
    // carrying the user, and neither can be satisfied by luck.
    expect(tasks.list).toHaveBeenCalledTimes(2);
    expect(tasks.list.mock.calls.map(([userId]) => userId)).toEqual([DANA, MARCUS]);
    expect(marcus.headers['x-cache']).toBe('MISS');
  });

  it('answers the same user asking twice from the cache', async () => {
    const first = await request(app.getHttpServer()).get(SHARED_QUERY).set(auth(DANA)).expect(200);
    const second = await request(app.getHttpServer()).get(SHARED_QUERY).set(auth(DANA)).expect(200);

    expect(first.headers['x-cache']).toBe('MISS');
    expect(second.headers['x-cache']).toBe('HIT');
    expect(second.body).toEqual(first.body);
    expect(tasks.list).toHaveBeenCalledTimes(1);
  });

  it('retires the caller’s cached pages when they write', async () => {
    tasks.create.mockResolvedValue(pageFor(DANA).data[0]);

    await request(app.getHttpServer()).get(SHARED_QUERY).set(auth(DANA)).expect(200);
    expect(tasks.list).toHaveBeenCalledTimes(1);

    // Without this the dashboard's own refetch after a create would be answered
    // from the cache and the new task would be invisible for the whole TTL —
    // the shipped feature regressing for the sake of the cache.
    await request(app.getHttpServer())
      .post(TASK_ROUTES.base)
      .set(auth(DANA))
      .send({ title: 'Book the venue' })
      .expect(201);

    const after = await request(app.getHttpServer()).get(SHARED_QUERY).set(auth(DANA)).expect(200);

    expect(after.headers['x-cache']).toBe('MISS');
    expect(tasks.list).toHaveBeenCalledTimes(2);
  });
});
