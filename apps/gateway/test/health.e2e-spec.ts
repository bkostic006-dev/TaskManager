import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HEALTH_ROUTE } from '@tally/contracts';
import { AppModule } from '../src/app.module';

/**
 * Establishes the supertest harness the gateway's real tests will use from
 * stage 3 onward (status-code mapping, validation, guards). The assertion
 * itself is thin by design.
 */
describe('Gateway health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports itself as healthy', async () => {
    const res = await request(app.getHttpServer()).get(HEALTH_ROUTE).expect(200);

    expect(res.body).toEqual({ status: 'ok', service: 'gateway' });
  });
});
