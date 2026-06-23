import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { BullmqService } from '../../src/infrastructure/queue/bullmq.service';

type ExpressLayer = {
  route?: {
    path?: string | string[];
    methods?: Record<string, boolean>;
  };
  handle?: {
    stack?: ExpressLayer[];
  };
};

describe('Sprint 13F Homework final closeout route inventory (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BullmqService)
      .useValue(createNoopBullmqService())
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('registers the completed Homework Core and app-facing routes', () => {
    const routes = listRegisteredRoutes();

    expect(routes).toEqual(
      expect.arrayContaining([
        'GET /api/v1/homework/assignments',
        'POST /api/v1/homework/assignments',
        'GET /api/v1/homework/assignments/:homeworkId',
        'PATCH /api/v1/homework/assignments/:homeworkId',
        'POST /api/v1/homework/assignments/:homeworkId/publish',
        'POST /api/v1/homework/assignments/:homeworkId/close',
        'POST /api/v1/homework/assignments/:homeworkId/cancel',
        'GET /api/v1/homework/assignments/:homeworkId/questions',
        'POST /api/v1/homework/assignments/:homeworkId/questions',
        'GET /api/v1/homework/assignments/:homeworkId/questions/:questionId',
        'PATCH /api/v1/homework/assignments/:homeworkId/questions/:questionId',
        'PATCH /api/v1/homework/assignments/:homeworkId/questions/:questionId/reorder',
        'DELETE /api/v1/homework/assignments/:homeworkId/questions/:questionId',
        'POST /api/v1/homework/assignments/:homeworkId/questions/:questionId/options',
        'PATCH /api/v1/homework/assignments/:homeworkId/questions/:questionId/options/:optionId',
        'PATCH /api/v1/homework/assignments/:homeworkId/questions/:questionId/options/:optionId/reorder',
        'DELETE /api/v1/homework/assignments/:homeworkId/questions/:questionId/options/:optionId',
        'GET /api/v1/homework/assignments/:homeworkId/attachments',
        'POST /api/v1/homework/assignments/:homeworkId/attachments',
        'PATCH /api/v1/homework/assignments/:homeworkId/attachments/:attachmentId',
        'PATCH /api/v1/homework/assignments/:homeworkId/attachments/:attachmentId/reorder',
        'DELETE /api/v1/homework/assignments/:homeworkId/attachments/:attachmentId',
        'GET /api/v1/homework/assignments/:homeworkId/targets',
        'POST /api/v1/homework/assignments/:homeworkId/targets/resolve',
        'GET /api/v1/homework/assignments/:homeworkId/submissions',
        'GET /api/v1/homework/assignments/:homeworkId/submissions/:submissionId',
        'POST /api/v1/homework/assignments/:homeworkId/submissions/:submissionId/review',
        'PATCH /api/v1/homework/assignments/:homeworkId/submissions/:submissionId/review',
        'GET /api/v1/teacher/homeworks/dashboard',
        'GET /api/v1/teacher/homeworks/classes/:classId/assignments',
        'POST /api/v1/teacher/homeworks/classes/:classId/assignments',
        'GET /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId',
        'PATCH /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId',
        'POST /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/publish',
        'POST /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/close',
        'POST /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/cancel',
        'GET /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/questions',
        'POST /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/questions',
        'GET /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/questions/:questionId',
        'PATCH /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/questions/:questionId',
        'PATCH /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/questions/:questionId/reorder',
        'DELETE /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/questions/:questionId',
        'POST /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/questions/:questionId/options',
        'PATCH /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/questions/:questionId/options/:optionId',
        'PATCH /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/questions/:questionId/options/:optionId/reorder',
        'DELETE /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/questions/:questionId/options/:optionId',
        'GET /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/attachments',
        'POST /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/attachments',
        'PATCH /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/attachments/:attachmentId',
        'PATCH /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/attachments/:attachmentId/reorder',
        'DELETE /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/attachments/:attachmentId',
        'GET /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions',
        'GET /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId',
        'GET /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId/answers',
        'GET /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId/attachments',
        'POST /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId/review',
        'GET /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/targets',
        'POST /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/targets/resolve',
        'GET /api/v1/student/homeworks',
        'GET /api/v1/student/homeworks/:homeworkId',
        'GET /api/v1/student/homeworks/:homeworkId/submission',
        'PUT /api/v1/student/homeworks/:homeworkId/submission',
        'GET /api/v1/student/homeworks/:homeworkId/submission/answers',
        'PUT /api/v1/student/homeworks/:homeworkId/submission/answers',
        'GET /api/v1/student/homeworks/:homeworkId/submission/attachments',
        'POST /api/v1/student/homeworks/:homeworkId/submit',
        'POST /api/v1/student/homeworks/:homeworkId/submission/submit',
        'GET /api/v1/parent/children/:studentId/homeworks',
        'GET /api/v1/parent/children/:studentId/homeworks/:homeworkId',
      ]),
    );
  });

  it('keeps deferred Homework and adjacent app routes unregistered', () => {
    const routes = listRegisteredRoutes();

    for (const absentRoute of [
      'GET /api/v1/homework/submissions',
      'POST /api/v1/homework/submissions',
      'POST /api/v1/homework/assignments/:homeworkId/submissions',
      'GET /api/v1/homework/questions',
      'POST /api/v1/homework/questions',
      'GET /api/v1/homework/attachments',
      'POST /api/v1/homework/attachments',
      'GET /api/v1/student/homeworks/:homeworkId/submission/history',
      'GET /api/v1/student/homeworks/:homeworkId/questions',
      'GET /api/v1/student/homeworks/:homeworkId/attachments',
      'POST /api/v1/parent/children/:studentId/homeworks/:homeworkId/submit',
      'POST /api/v1/parent/children/:studentId/homeworks/:homeworkId/submission/submit',
      'GET /api/v1/parent/children/:studentId/homeworks/:homeworkId/questions',
      'GET /api/v1/parent/children/:studentId/homeworks/:homeworkId/attachments',
      'GET /api/v1/parent/homeworks',
      'POST /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId/sync-grade-item',
      'GET /api/v1/student/pickup',
      'GET /api/v1/parent/pickup',
      'GET /api/v1/parent/smart-pickup',
    ]) {
      expect(routes).not.toContain(absentRoute);
    }

    for (const route of routes) {
      expect(route).not.toMatch(
        /^.+ \/api\/v1\/homework\/.*(proof|upload|xp|reward)/,
      );
      expect(route).not.toMatch(
        /^.+ \/api\/v1\/student\/homeworks\/.*(proof|upload|grade-sync|xp|reward)/,
      );
      expect(route).not.toMatch(
        /^.+ \/api\/v1\/parent\/children\/:studentId\/homeworks\/.*(submit|submission|question|answer|attachment|proof|upload)/,
      );
      expect(route).not.toMatch(
        /^.+ \/api\/v1\/teacher\/homeworks\/.*(proof|upload|xp|reward)/,
      );
    }
  });

  function listRegisteredRoutes(): string[] {
    const expressApp = app.getHttpAdapter().getInstance() as {
      _router?: { stack?: ExpressLayer[] };
      router?: { stack?: ExpressLayer[] };
    };
    const stack = expressApp._router?.stack ?? expressApp.router?.stack ?? [];
    const routes: string[] = [];

    collectRoutes(stack, routes);

    return routes.sort();
  }

  function collectRoutes(layers: ExpressLayer[], routes: string[]): void {
    for (const layer of layers) {
      if (layer.route?.path && layer.route.methods) {
        const paths = Array.isArray(layer.route.path)
          ? layer.route.path
          : [layer.route.path];
        const methods = Object.entries(layer.route.methods)
          .filter(([, enabled]) => enabled)
          .map(([method]) => method.toUpperCase());

        for (const path of paths) {
          for (const method of methods) {
            routes.push(`${method} ${normalizeRoutePath(path)}`);
          }
        }
      }

      if (layer.handle?.stack) {
        collectRoutes(layer.handle.stack, routes);
      }
    }
  }

  function normalizeRoutePath(path: string): string {
    return `/${path}`.replace(/\/{2,}/g, '/');
  }

  function createNoopBullmqService(): Pick<
    BullmqService,
    'addJob' | 'createWorker' | 'getQueue'
  > {
    return {
      getQueue: jest.fn(() => ({
        add: jest.fn().mockResolvedValue({ id: 'noop-job' }),
        close: jest.fn().mockResolvedValue(undefined),
      })),
      addJob: jest.fn().mockResolvedValue({ id: 'noop-job' }),
      createWorker: jest.fn(() => ({
        close: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
      })),
    } as unknown as Pick<
      BullmqService,
      'addJob' | 'createWorker' | 'getQueue'
    >;
  }
});
