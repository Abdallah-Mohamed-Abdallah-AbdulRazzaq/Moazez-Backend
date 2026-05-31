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

describe('Sprint 15G Homework answer review completion (e2e)', () => {
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

  it('registers answer-level review routes without grade sync or reward surfaces', () => {
    const routes = listRegisteredRoutes();

    expect(routes).toEqual(
      expect.arrayContaining([
        'PATCH /api/v1/homework/assignments/:homeworkId/submissions/:submissionId/answers/:answerId/review',
        'PUT /api/v1/homework/assignments/:homeworkId/submissions/:submissionId/answers/review',
        'PATCH /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId/answers/:answerId/review',
        'PUT /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId/answers/review',
        'POST /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId/review',
        'PATCH /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId/review',
      ]),
    );

    for (const absentRoute of [
      'POST /api/v1/homework/assignments/:homeworkId/submissions/:submissionId/recompute-score',
      'POST /api/v1/homework/assignments/:homeworkId/submissions/:submissionId/sync-grade-item',
      'POST /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId/sync-grade-item',
      'POST /api/v1/homework/assignments/:homeworkId/notifications',
      'POST /api/v1/homework/assignments/:homeworkId/xp',
      'POST /api/v1/homework/assignments/:homeworkId/rewards',
      'POST /api/v1/parent/children/:studentId/homeworks/:homeworkId/submit',
    ]) {
      expect(routes).not.toContain(absentRoute);
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
