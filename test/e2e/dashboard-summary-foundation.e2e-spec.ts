import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  MembershipStatus,
  PrismaClient,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { BullmqService } from '../../src/infrastructure/queue/bullmq.service';

const GLOBAL_PREFIX = '/api/v1';
const DEMO_ADMIN_EMAIL = 'admin@academy.moazez.dev';
const DEMO_ADMIN_PASSWORD = 'School123!';
const DEMO_SCHOOL_SLUG = 'moazez-academy';
const DENIED_EMAIL = 'dashboard-denied@summary.moazez.local';
const DENIED_PASSWORD = 'DashboardDenied123!';
const DENIED_ROLE_KEY = 'dashboard_summary_denied';

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

type ExpressLayer = {
  route?: {
    path?: string | string[];
    methods?: Record<string, boolean>;
  };
  handle?: {
    stack?: ExpressLayer[];
  };
};

jest.setTimeout(60000);

describe('Sprint 16A Dashboard Summary Foundation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let demoSchoolId: string;
  let demoOrganizationId: string;
  let deniedRoleId: string;
  let deniedUserId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const demoSchool = await prisma.school.findFirst({
      where: { slug: DEMO_SCHOOL_SLUG },
      select: { id: true, organizationId: true },
    });
    if (!demoSchool) {
      throw new Error('Demo school not found - run `npm run seed` first.');
    }
    demoSchoolId = demoSchool.id;
    demoOrganizationId = demoSchool.organizationId;

    await ensureDeniedUser();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BullmqService)
      .useValue(createNoopBullmqService())
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(GLOBAL_PREFIX.replace(/^\//, ''));
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  it('registers only the native school dashboard summary surface', () => {
    const routes = listRegisteredRoutes();

    expect(routes).toContain('GET /api/v1/dashboard/summary');
    for (const absentRoute of [
      'GET /api/v1/dashboard/activity-feed',
      'GET /api/v1/dashboard/alerts',
      'POST /api/v1/dashboard/alerts/:alertId/acknowledge',
      'GET /api/v1/platform/dashboard/summary',
      'GET /api/v1/admin/dashboard/summary',
      'GET /api/v1/teacher/dashboard/summary',
      'GET /api/v1/student/dashboard/summary',
      'GET /api/v1/parent/dashboard/summary',
    ]) {
      expect(routes).not.toContain(absentRoute);
    }
  });

  it('returns school-scoped summary cards for school admins and denies users without permission', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const deniedToken = await login(DENIED_EMAIL, DENIED_PASSWORD);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/summary`)
      .set('Authorization', `Bearer ${deniedToken}`)
      .expect(403);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/summary`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      generatedAt: expect.any(String),
      school: {
        name: expect.any(String),
        locale: null,
      },
      academicContext: expect.any(Object),
      cards: {
        admissions: expect.objectContaining({
          totalLeads: expect.any(Number),
          openApplications: expect.any(Number),
        }),
        students: expect.objectContaining({
          activeStudents: expect.any(Number),
          activeEnrollments: expect.any(Number),
        }),
        academics: expect.objectContaining({
          hasCurrentAcademicYear: expect.any(Boolean),
          classrooms: expect.any(Number),
        }),
        attendance: expect.objectContaining({
          todaySessions: expect.any(Number),
          pendingExcuses: expect.any(Number),
        }),
        grades: expect.objectContaining({
          activeAssessments: expect.any(Number),
          lockedAssessments: expect.any(Number),
        }),
        homework: expect.objectContaining({
          publishedAssignments: expect.any(Number),
          submissionsWaitingReview: expect.any(Number),
        }),
        behavior: expect.objectContaining({
          recentRecords: expect.any(Number),
          pendingReviewRecords: expect.any(Number),
        }),
        reinforcement: expect.objectContaining({
          activeTasks: expect.any(Number),
          rewardsPending: expect.any(Number),
        }),
        communication: expect.objectContaining({
          activeConversations: expect.any(Number),
          pendingModerationReports: expect.any(Number),
        }),
      },
      alertsPreview: expect.any(Array),
      deferred: {
        activityFeed: 'deferred',
        alertsEngine: 'deferred',
        analyticsBuilder: 'out_of_scope_v1',
      },
    });
    expect(response.body.academicContext).toHaveProperty('academicYear');
    expect(response.body.academicContext).toHaveProperty('term');

    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain('schoolId');
    expect(serialized).not.toContain('organizationId');
  });

  async function ensureDeniedUser(): Promise<void> {
    const role = await prisma.role.upsert({
      where: {
        schoolId_key: {
          schoolId: demoSchoolId,
          key: DENIED_ROLE_KEY,
        },
      },
      update: {
        name: 'Dashboard Summary Denied',
        description: 'No dashboard permissions',
        isSystem: false,
        deletedAt: null,
      },
      create: {
        schoolId: demoSchoolId,
        key: DENIED_ROLE_KEY,
        name: 'Dashboard Summary Denied',
        description: 'No dashboard permissions',
        isSystem: false,
      },
    });
    deniedRoleId = role.id;
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });

    const passwordHash = await argon2.hash(DENIED_PASSWORD, ARGON2_OPTIONS);
    const user = await prisma.user.upsert({
      where: { email: DENIED_EMAIL },
      update: {
        firstName: 'Dashboard',
        lastName: 'Denied',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        passwordHash,
        deletedAt: null,
      },
      create: {
        email: DENIED_EMAIL,
        firstName: 'Dashboard',
        lastName: 'Denied',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        passwordHash,
      },
    });
    deniedUserId = user.id;

    await prisma.membership.updateMany({
      where: {
        userId: deniedUserId,
        status: MembershipStatus.ACTIVE,
        deletedAt: null,
      },
      data: {
        status: MembershipStatus.INACTIVE,
        endedAt: new Date(),
      },
    });

    await prisma.membership.create({
      data: {
        userId: deniedUserId,
        organizationId: demoOrganizationId,
        schoolId: demoSchoolId,
        roleId: deniedRoleId,
        userType: UserType.SCHOOL_USER,
        status: MembershipStatus.ACTIVE,
        startedAt: new Date(),
      },
    });
  }

  async function login(email: string, password: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password })
      .expect(200);

    return response.body.accessToken;
  }

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
