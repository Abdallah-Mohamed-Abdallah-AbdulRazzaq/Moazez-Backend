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

describe('Sprint 15E Homework questions and attachments foundation (e2e)', () => {
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

  it('registers assignment-owned question, option, and attachment routes', () => {
    const routes = listRegisteredRoutes();

    expect(routes).toEqual(
      expect.arrayContaining([
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
      ]),
    );
  });

  it('keeps uploads, grade sync, XP, and parent submit deferred', () => {
    const routes = listRegisteredRoutes();

    for (const absentRoute of [
      'POST /api/v1/student/homeworks/:homeworkId/answers',
      'POST /api/v1/student/homeworks/:homeworkId/attachments',
      'POST /api/v1/student/homeworks/:homeworkId/proof',
      'GET /api/v1/student/homeworks/:homeworkId/questions',
      'GET /api/v1/student/homeworks/:homeworkId/attachments',
      'POST /api/v1/parent/children/:studentId/homeworks/:homeworkId/submit',
      'POST /api/v1/parent/children/:studentId/homeworks/:homeworkId/submission/submit',
      'POST /api/v1/parent/children/:studentId/homeworks/:homeworkId/answers',
      'GET /api/v1/parent/children/:studentId/homeworks/:homeworkId/questions',
      'GET /api/v1/parent/children/:studentId/homeworks/:homeworkId/attachments',
      'POST /api/v1/homework/assignments/:homeworkId/submissions/:submissionId/sync-grade-item',
      'POST /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId/sync-grade-item',
      'POST /api/v1/homework/assignments/:homeworkId/notifications',
      'POST /api/v1/homework/assignments/:homeworkId/xp',
      'POST /api/v1/homework/assignments/:homeworkId/rewards',
    ]) {
      expect(routes).not.toContain(absentRoute);
    }

    for (const route of routes) {
      expect(route).not.toMatch(
        /^.+ \/api\/v1\/student\/homeworks\/.*(proof|upload|grade-sync|sync-grade|xp|reward)/,
      );
      expect(route).not.toMatch(
        /^.+ \/api\/v1\/parent\/children\/:studentId\/homeworks\/.*(submit|answer|proof|upload|grade-sync|sync-grade|xp|reward)/,
      );
      expect(route).not.toMatch(
        /^.+ \/api\/v1\/homework\/.*(proof|upload|grade-sync|sync-grade|notification|xp|reward)/,
      );
      expect(route).not.toMatch(
        /^.+ \/api\/v1\/teacher\/homeworks\/.*(proof|upload|grade-sync|sync-grade|notification|xp|reward)/,
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

        for (const routePath of paths) {
          for (const method of methods) {
            routes.push(`${method} ${routePath}`);
          }
        }
      }

      if (layer.handle?.stack) {
        collectRoutes(layer.handle.stack, routes);
      }
    }
  }
});

function createNoopBullmqService(): Pick<
  BullmqService,
  'addEmailJob' | 'addImportJob' | 'createWorker' | 'onModuleDestroy'
> {
  return {
    addEmailJob: jest.fn().mockResolvedValue(undefined),
    addImportJob: jest.fn().mockResolvedValue(undefined),
    createWorker: jest.fn().mockReturnValue({ close: jest.fn() }),
    onModuleDestroy: jest.fn().mockResolvedValue(undefined),
  };
}
