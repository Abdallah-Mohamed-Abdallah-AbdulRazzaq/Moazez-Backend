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

describe('Sprint 15F Homework answers and submission attachments foundation (e2e)', () => {
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

  it('registers student, teacher, and core answer and submission attachment routes', () => {
    const routes = listRegisteredRoutes();

    expect(routes).toEqual(
      expect.arrayContaining([
        'GET /api/v1/homework/assignments/:homeworkId/submissions/:submissionId/answers',
        'GET /api/v1/homework/assignments/:homeworkId/submissions/:submissionId/answers/:answerId',
        'GET /api/v1/homework/assignments/:homeworkId/submissions/:submissionId/attachments',
        'POST /api/v1/student/homeworks/:homeworkId/submission/draft',
        'POST /api/v1/student/homeworks/:homeworkId/submission/submit',
        'GET /api/v1/student/homeworks/:homeworkId/submission/answers',
        'PUT /api/v1/student/homeworks/:homeworkId/submission/answers',
        'PATCH /api/v1/student/homeworks/:homeworkId/submission/answers/:questionId',
        'GET /api/v1/student/homeworks/:homeworkId/submission/attachments',
        'POST /api/v1/student/homeworks/:homeworkId/submission/attachments',
        'PATCH /api/v1/student/homeworks/:homeworkId/submission/attachments/:attachmentId',
        'PATCH /api/v1/student/homeworks/:homeworkId/submission/attachments/:attachmentId/reorder',
        'DELETE /api/v1/student/homeworks/:homeworkId/submission/attachments/:attachmentId',
        'GET /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId/answers',
        'GET /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId/attachments',
      ]),
    );
  });

  it('keeps parent submit, legacy sync-grade, notifications, XP, rewards, and upload surfaces deferred', () => {
    const routes = listRegisteredRoutes();

    for (const absentRoute of [
      'POST /api/v1/parent/children/:studentId/homeworks/:homeworkId/submit',
      'POST /api/v1/parent/children/:studentId/homeworks/:homeworkId/submission/submit',
      'POST /api/v1/parent/children/:studentId/homeworks/:homeworkId/submission/answers',
      'PATCH /api/v1/parent/children/:studentId/homeworks/:homeworkId/submission/answers/:questionId',
      'POST /api/v1/parent/children/:studentId/homeworks/:homeworkId/submission/attachments',
      'DELETE /api/v1/parent/children/:studentId/homeworks/:homeworkId/submission/attachments/:attachmentId',
      'POST /api/v1/student/homeworks/:homeworkId/submission/files',
      'POST /api/v1/student/homeworks/:homeworkId/submission/proof',
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
        /^.+ \/api\/v1\/parent\/children\/:studentId\/homeworks\/.*(submit|proof|upload|grade-sync|sync-grade|xp|reward)/,
      );
      expect(route).not.toMatch(
        /^.+ \/api\/v1\/homework\/.*(proof|upload|sync-grade|notification|xp|reward)/,
      );
      expect(route).not.toMatch(
        /^.+ \/api\/v1\/teacher\/homeworks\/.*(proof|upload|sync-grade|notification|xp|reward)/,
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
