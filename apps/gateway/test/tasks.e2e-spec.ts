import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  ACCESS_TOKEN_TTL,
  DomainError,
  ErrorCode,
  JWT_AUDIENCE,
  JWT_ISSUER,
  TASK_ROUTES,
  type Task,
} from '@tally/contracts';
import { AppModule } from '../src/app.module';
import { TasksClient } from '../src/tasks/tasks.client';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const TASK_ID = '11111111-1111-4111-8111-111111111111';

const TASK: Task = {
  id: TASK_ID,
  title: 'Rotate the Stripe API keys',
  description: 'Quarterly rotation; restricted keys only.',
  completed: false,
  completedAt: null,
  createdAt: '2026-08-10T08:00:00.000Z',
  updatedAt: '2026-08-10T08:00:00.000Z',
};

/**
 * The gateway's own responsibilities on the task surface, with the task service
 * replaced by a double: the guard, the query DTO's conversions and refusals,
 * the status codes, and the tenancy rule that the id comes from the token.
 * What the task service decides is tested where it is decided.
 */
describe('Gateway tasks', () => {
  let app: INestApplication;
  let tasks: jest.Mocked<TasksClient>;
  let accessToken: string;

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

    accessToken = await app
      .get(JwtService)
      .signAsync(
        { sub: USER_ID, email: 'dana@northbay.dev' },
        { issuer: JWT_ISSUER, audience: JWT_AUDIENCE, expiresIn: ACCESS_TOKEN_TTL },
      );
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  const auth = () => ({ Authorization: `Bearer ${accessToken}` });

  it('converts the numeric query fields, and rejects the values outside the contract', async () => {
    // The global pipe runs with `transform: true` but not
    // `enableImplicitConversion`, so `page=2` arrives as the string '2' and
    // would fail @IsInt with a 400 without the explicit @Type(() => Number) —
    // the endpoint would reject its own documented usage.
    tasks.list.mockResolvedValue({
      data: [TASK],
      meta: { page: 2, pageSize: 8, total: 47, totalPages: 6 },
    });

    await request(app.getHttpServer())
      .get(`${TASK_ROUTES.base}?page=2&pageSize=8&status=pending&sortBy=title&sortOrder=asc`)
      .set(auth())
      .expect(200);

    const [, query] = tasks.list.mock.calls[0];
    expect(query).toMatchObject({ page: 2, pageSize: 8, status: 'pending' });
    expect(typeof query.page).toBe('number');
    expect(typeof query.pageSize).toBe('number');

    jest.clearAllMocks();

    // And the closed set is enforced rather than clamped. A clamped request
    // would reach the service and come back 200 with rows the client never
    // asked for, with nothing in the response to say so.
    const res = await request(app.getHttpServer())
      .get(`${TASK_ROUTES.base}?pageSize=7`)
      .set(auth())
      .expect(400);

    expect(res.body).toMatchObject({
      error: ErrorCode.Validation,
      details: { pageSize: ['pageSize must be one of 8, 16, 24, 48.'] },
    });

    await request(app.getHttpServer()).get(`${TASK_ROUTES.base}?page=0`).set(auth()).expect(400);
    await request(app.getHttpServer())
      .get(`${TASK_ROUTES.base}?sortBy=dueDate`)
      .set(auth())
      .expect(400);
    expect(tasks.list).not.toHaveBeenCalled();
  });

  it("answers 404, not 403 or 503, for another user's task", async () => {
    // The 503 case is the one worth naming: without the task service's own
    // exception filter a DomainError leaves as an unshaped 500, UpstreamService
    // finds no code it recognises, and every domain answer — this one included
    // — becomes 503 UPSTREAM_UNAVAILABLE. The tenancy rule would read as a
    // network fault.
    tasks.findOne.mockRejectedValue(
      new DomainError(ErrorCode.NotFound, 'That task no longer exists.'),
    );

    const res = await request(app.getHttpServer())
      .get(TASK_ROUTES.byId(TASK_ID))
      .set(auth())
      .expect(404);

    expect(res.body).toEqual({
      statusCode: 404,
      error: ErrorCode.NotFound,
      message: 'That task no longer exists.',
    });
  });

  it('takes the tenant key from the verified token on every route', async () => {
    tasks.create.mockResolvedValue(TASK);
    tasks.complete.mockResolvedValue({ ...TASK, completed: true });
    tasks.remove.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .post(TASK_ROUTES.base)
      .set(auth())
      .send({ title: '  Rotate the Stripe API keys  ' })
      .expect(201);

    await request(app.getHttpServer()).patch(TASK_ROUTES.complete(TASK_ID)).set(auth()).expect(200);

    await request(app.getHttpServer()).delete(TASK_ROUTES.byId(TASK_ID)).set(auth()).expect(204);

    // Nothing the client sends can widen the scope: the id is the token's
    // subject in every case, and the DTO's trim ran before the service saw it.
    expect(tasks.create).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ title: 'Rotate the Stripe API keys' }),
    );
    expect(tasks.complete).toHaveBeenCalledWith(USER_ID, TASK_ID);
    expect(tasks.remove).toHaveBeenCalledWith(USER_ID, TASK_ID);
  });

  it('refuses a completed field on PATCH, and guards every route', async () => {
    // The flag and the timestamp move together, through the two transition
    // routes. `forbidNonWhitelisted` names the field rather than stripping it,
    // so a client that thinks it toggled completion is told it did not.
    const res = await request(app.getHttpServer())
      .patch(TASK_ROUTES.byId(TASK_ID))
      .set(auth())
      .send({ title: 'Renamed', completed: true })
      .expect(400);

    expect(res.body.details).toMatchObject({
      completed: expect.arrayContaining([expect.stringContaining('should not exist')]),
    });
    expect(tasks.update).not.toHaveBeenCalled();

    // None of the seven is @Public(), so the global guard covers all of them —
    // including the two that were added last and are easiest to forget.
    await request(app.getHttpServer()).get(TASK_ROUTES.base).expect(401);
    await request(app.getHttpServer()).post(TASK_ROUTES.base).send({ title: 'x' }).expect(401);
    await request(app.getHttpServer()).get(TASK_ROUTES.byId(TASK_ID)).expect(401);
    await request(app.getHttpServer()).patch(TASK_ROUTES.byId(TASK_ID)).send({}).expect(401);
    await request(app.getHttpServer()).delete(TASK_ROUTES.byId(TASK_ID)).expect(401);
    await request(app.getHttpServer()).patch(TASK_ROUTES.complete(TASK_ID)).expect(401);
    await request(app.getHttpServer()).patch(TASK_ROUTES.uncomplete(TASK_ID)).expect(401);

    // Not one of them reached the service.
    for (const call of Object.values(tasks)) {
      expect(call).not.toHaveBeenCalled();
    }
  });
});
