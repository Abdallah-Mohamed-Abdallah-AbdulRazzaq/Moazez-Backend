import { INestApplication, ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { BullmqService } from '../../src/infrastructure/queue/bullmq.service';
import { HomeworkAssignmentsController } from '../../src/modules/homework/controller/homework-assignments.controller';
import { HomeworkAttachmentsController } from '../../src/modules/homework/controller/homework-attachments.controller';
import { HomeworkGradeSyncController } from '../../src/modules/homework/controller/homework-grade-sync.controller';
import { HomeworkQuestionsController } from '../../src/modules/homework/controller/homework-questions.controller';
import { HomeworkSubmissionContentController } from '../../src/modules/homework/controller/homework-submission-content.controller';
import { HomeworkSubmissionsController } from '../../src/modules/homework/controller/homework-submissions.controller';
import { HomeworkCoreAccessGuard } from '../../src/modules/homework/guards/homework-core-access.guard';
import { ParentHomeworksController } from '../../src/modules/parent-app/homeworks/controller/parent-homeworks.controller';
import { StudentHomeworksController } from '../../src/modules/student-app/homeworks/controller/student-homeworks.controller';
import { TeacherHomeworksController } from '../../src/modules/teacher-app/homeworks/controller/teacher-homeworks.controller';

type ExpressLayer = {
  route?: {
    path?: string | string[];
    methods?: Record<string, boolean>;
  };
  handle?: {
    stack?: ExpressLayer[];
  };
};

const HOMEWORK_CORE_ROUTES = [
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
  'GET /api/v1/homework/assignments/:homeworkId/grade-sync',
  'POST /api/v1/homework/assignments/:homeworkId/grade-sync/link',
  'POST /api/v1/homework/assignments/:homeworkId/grade-sync',
  'POST /api/v1/homework/assignments/:homeworkId/submissions/:submissionId/grade-sync',
  'GET /api/v1/homework/assignments/:homeworkId/submissions/:submissionId/answers',
  'GET /api/v1/homework/assignments/:homeworkId/submissions/:submissionId/answers/:answerId',
  'PATCH /api/v1/homework/assignments/:homeworkId/submissions/:submissionId/answers/:answerId/review',
  'PUT /api/v1/homework/assignments/:homeworkId/submissions/:submissionId/answers/review',
  'GET /api/v1/homework/assignments/:homeworkId/submissions/:submissionId/attachments',
] as const;

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
        ...HOMEWORK_CORE_ROUTES,
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

    expect(
      routes.filter((route) => route.includes(' /api/v1/homework/')),
    ).toEqual([...HOMEWORK_CORE_ROUTES].sort());
  });

  it('applies the core guard only to controllers with /homework paths', () => {
    const guardedCoreControllers = [
      [HomeworkAssignmentsController, 'homework/assignments'],
      [
        HomeworkAttachmentsController,
        'homework/assignments/:homeworkId/attachments',
      ],
      [HomeworkGradeSyncController, 'homework/assignments/:homeworkId'],
      [
        HomeworkQuestionsController,
        'homework/assignments/:homeworkId/questions',
      ],
      [
        HomeworkSubmissionContentController,
        'homework/assignments/:homeworkId/submissions/:submissionId',
      ],
      [
        HomeworkSubmissionsController,
        'homework/assignments/:homeworkId/submissions',
      ],
    ] as const;

    for (const [controller, path] of guardedCoreControllers) {
      expect(Reflect.getMetadata(PATH_METADATA, controller)).toBe(path);
      expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toEqual([
        HomeworkCoreAccessGuard,
      ]);
    }

    const ownershipCheckedAdapters = [
      [TeacherHomeworksController, 'teacher/homeworks'],
      [StudentHomeworksController, 'student/homeworks'],
      [ParentHomeworksController, 'parent/children/:studentId/homeworks'],
    ] as const;

    for (const [controller, path] of ownershipCheckedAdapters) {
      expect(Reflect.getMetadata(PATH_METADATA, controller)).toBe(path);
      expect(
        Reflect.getMetadata(GUARDS_METADATA, controller) ?? [],
      ).not.toContain(HomeworkCoreAccessGuard);
    }
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

  type AppModuleBullmqServiceMock = {
    getQueue: (
      ...args: Parameters<BullmqService['getQueue']>
    ) => NoopBullmqQueue;
    addJob: (
      ...args: Parameters<BullmqService['addJob']>
    ) => Promise<{ id: string }>;
    getQueueReadiness: BullmqService['getQueueReadiness'];
    createWorker: (
      ...args: Parameters<BullmqService['createWorker']>
    ) => NoopBullmqWorker;
  };

  type NoopBullmqQueue = {
    add: (...args: unknown[]) => Promise<{ id: string }>;
    close: () => Promise<void>;
  };

  type NoopBullmqWorker = {
    on: (event: string, listener: (...args: unknown[]) => void) => void;
    close: () => Promise<void>;
  };

  function createNoopBullmqService(): AppModuleBullmqServiceMock {
    return {
      getQueue: jest.fn(() => ({
        add: jest.fn().mockResolvedValue({ id: 'noop-job' }),
        close: jest.fn().mockResolvedValue(undefined),
      })),
      addJob: jest.fn().mockResolvedValue({ id: 'noop-job' }),
      getQueueReadiness: jest.fn().mockResolvedValue({
        name: 'settings-branding-logo-cleanup',
        status: 'ok',
        counts: { waiting: 0, active: 0, delayed: 0, failed: 0 },
      }),
      createWorker: jest.fn(() => ({
        close: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
      })),
    };
  }
});
