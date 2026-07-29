import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { APPLICATION_VERSION } from '../../bootstrap/application-metadata';
import { configureHttpApplication } from '../../bootstrap/http-application';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService],
    }).compile();

    app = moduleRef.createNestApplication();
    configureHttpApplication(app, {
      environment: 'test',
      corsOrigins: 'http://localhost:3001',
      swaggerEnabled: false,
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the exact minimal public compatibility contract', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    expect(Object.keys(response.body).sort()).toEqual([
      'status',
      'timestamp',
      'version',
    ]);
    expect(response.body).toEqual({
      status: 'ok',
      version: APPLICATION_VERSION,
      timestamp: expect.any(String),
    });
    const timestamp = response.body.timestamp as string;
    expect(new Date(timestamp).toISOString()).toBe(timestamp);
    expect(JSON.stringify(response.body)).not.toMatch(
      /database|redis|storage|queue|email|push|provider|topology|checks/i,
    );
  });

  it.each([
    '/api/v1/internal/probes/api/startup',
    '/api/v1/internal/probes/api/liveness',
    '/api/v1/internal/probes/api/readiness',
    '/api/v1/internal/probes/core-worker/startup',
    '/api/v1/internal/probes/core-worker/liveness',
    '/api/v1/internal/probes/core-worker/readiness',
    '/api/v1/internal/probes/media-worker/startup',
    '/api/v1/internal/probes/media-worker/liveness',
    '/api/v1/internal/probes/media-worker/readiness',
  ])('does not expose management path %s on the public listener', (path) =>
    request(app.getHttpServer()).get(path).expect(404),
  );
});
