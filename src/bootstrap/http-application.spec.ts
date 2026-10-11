import {
  BadRequestException,
  Controller,
  Get,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppController } from '../app.controller';
import { AppService } from '../app.service';
import { RequestContextMiddleware } from '../common/context/context.middleware';
import { GlobalExceptionFilter } from '../common/exceptions/global-exception.filter';
import { APPROVED_PRODUCTION_APPLICATION_ORIGINS } from './application-cors.policy';
import {
  configureHttpApplication,
  logHttpApplicationStarted,
} from './http-application';

jest.setTimeout(15_000);

@Controller('bootstrap-test-error')
class BootstrapTestErrorController {
  @Get()
  fail(): never {
    throw new BadRequestException('invalid request');
  }
}

describe('HTTP application bootstrap policy', () => {
  const applications: INestApplication[] = [];

  afterEach(async () => {
    await Promise.all(applications.splice(0).map((app) => app.close()));
  });

  it('keeps Swagger absent and unadvertised when disabled', async () => {
    const app = await createTestApplication(false);
    const logger = { log: jest.fn() };

    logHttpApplicationStarted(logger as never, 3000, {
      allowedOrigins: ['http://localhost:3001'],
      swaggerEnabled: false,
    });

    await request(app.getHttpServer()).get('/api/v1/docs').expect(404);
    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log).not.toHaveBeenCalledWith(
      expect.stringContaining('Swagger'),
    );
  });

  it('registers Swagger at the existing path only when explicitly enabled', async () => {
    const app = await createTestApplication(true);

    await request(app.getHttpServer())
      .get('/api/v1/docs')
      .redirects(1)
      .expect(200);
  });

  it('defensively rejects Swagger in production', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();
    const app = moduleRef.createNestApplication();
    applications.push(app);

    expect(() =>
      configureHttpApplication(app, {
        environment: 'production',
        corsOrigins: 'https://schools.moazez.cloud,https://admin.moazez.cloud',
        swaggerEnabled: true,
      }),
    ).toThrow(/forbidden in production/u);
  });

  it('enforces credentialed HTTP CORS with the shared allowlist', async () => {
    const app = await createTestApplication(false);

    await request(app.getHttpServer())
      .get('/api/v1')
      .set('Origin', 'http://localhost:3001')
      .expect('access-control-allow-origin', 'http://localhost:3001')
      .expect('access-control-allow-credentials', 'true')
      .expect(200);

    const denied = await request(app.getHttpServer())
      .get('/api/v1')
      .set('Origin', 'http://localhost:3002')
      .expect(200);
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();

    await request(app.getHttpServer()).get('/api/v1').expect(200);
  });

  it('keeps the response ID, request context, and error trace ID consistent', async () => {
    const app = await createTestApplication(false);
    const requestId = 'caller.Request_1:attempt-2';

    const response = await request(app.getHttpServer())
      .get('/api/v1/bootstrap-test-error')
      .set('x-request-id', requestId)
      .set('x-trace-id', 'must-not-be-authoritative')
      .expect(400);

    expect(response.headers['x-request-id']).toBe(requestId);
    expect(response.body.error.traceId).toBe(requestId);
  });

  it('allows credentialed Teacher HTTP requests and preflight in production', async () => {
    const app = await createTestApplication(false, 'production');
    for (const method of ['get', 'options'] as const) {
      await request(app.getHttpServer())
        [method]('/api/v1')
        .set('Origin', 'https://teacher.moazez.cloud')
        .set('Access-Control-Request-Method', 'GET')
        .expect('access-control-allow-origin', 'https://teacher.moazez.cloud')
        .expect('access-control-allow-credentials', 'true')
        .expect(method === 'get' ? 200 : 204);
    }
  });

  it.each([
    '*',
    'null',
    'https://teacher.moazez.cloud/path',
    'https://teacher.moazez.cloud.evil.test',
    'http://teacher.moazez.cloud',
  ])('does not authorize production HTTP browser origin %s', async (origin) => {
    const app = await createTestApplication(false, 'production');
    const response = await request(app.getHttpServer())
      .get('/api/v1')
      .set('Origin', origin)
      .expect(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(
      response.headers['access-control-allow-credentials'],
    ).toBeUndefined();
  });

  it('never reflects a malformed inbound ID in a response or error envelope', async () => {
    const app = await createTestApplication(false);
    const invalid = 'x'.repeat(129);

    const response = await request(app.getHttpServer())
      .get('/api/v1/bootstrap-test-error')
      .set('x-request-id', invalid)
      .expect(400);

    expect(response.headers['x-request-id']).not.toBe(invalid);
    expect(response.body.error.traceId).toBe(response.headers['x-request-id']);
    expect(response.body.error.traceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
    );
  });

  it('serves only the minimal root identity under the global prefix', async () => {
    const app = await createTestApplication(false);

    await request(app.getHttpServer()).get('/api/v1').expect(200).expect({
      service: 'moazez-backend',
      version: '0.0.1',
    });
    await request(app.getHttpServer()).get('/').expect(404);
  });

  it('keeps the effective Express trust proxy setting disabled', async () => {
    const app = await createTestApplication(false);
    const express = app.getHttpAdapter().getInstance() as {
      get(setting: string): unknown;
    };

    expect(express.get('trust proxy')).toBe(false);
  });

  async function createTestApplication(
    swaggerEnabled: boolean,
    environment: 'test' | 'production' = 'test',
  ): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({
      controllers: [AppController, BootstrapTestErrorController],
      providers: [AppService],
    }).compile();
    const app = moduleRef.createNestApplication();
    const middleware = new RequestContextMiddleware();
    app.use((request, response, next) =>
      middleware.use(request, response, next),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    configureHttpApplication(app, {
      environment,
      corsOrigins:
        environment === 'production'
          ? APPROVED_PRODUCTION_APPLICATION_ORIGINS.join(',')
          : 'http://localhost:3001',
      swaggerEnabled,
    });
    await app.init();
    applications.push(app);
    return app;
  }
});
