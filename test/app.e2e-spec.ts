import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureHttpApplication } from './../src/bootstrap/http-application';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureHttpApplication(app, {
      environment: 'test',
      corsOrigins: 'http://localhost:3001',
      swaggerEnabled: false,
    });
    await app.init();
  });

  it('/api/v1 (GET)', () => {
    return request(app.getHttpServer()).get('/api/v1').expect(200).expect({
      service: 'moazez-backend',
      version: '0.0.1',
    });
  });

  it('/ is not the public identity endpoint', () => {
    return request(app.getHttpServer()).get('/').expect(404);
  });

  afterEach(async () => {
    await app.close();
  });
});
