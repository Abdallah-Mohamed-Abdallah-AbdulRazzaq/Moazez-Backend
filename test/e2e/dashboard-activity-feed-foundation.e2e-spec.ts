import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AuditOutcome,
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
const PASSWORD = 'DashboardActivity123!';

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

type CreatedPrincipal = {
  email: string;
  userId: string;
  roleId: string;
  organizationId: string;
  schoolId: string;
};

jest.setTimeout(90000);

describe('Sprint 16C Dashboard Activity Feed Foundation (e2e)', () => {
  const suffix = randomUUID().split('-')[0];
  const marker = `s16c-activity-${suffix}`;

  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let demoSchoolId = '';
  let demoOrganizationId = '';
  let activityPermissionId = '';
  let deniedPrincipal: CreatedPrincipal;
  let minimalPrincipal: CreatedPrincipal;

  const createdOrganizationIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdAuditResourceIds: string[] = [];

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

    activityPermissionId = await ensureActivityFeedPermission();
    await ensureDemoAdminHasActivityFeedPermission();
    deniedPrincipal = await createPrincipal({
      label: 'denied',
      organizationId: demoOrganizationId,
      schoolId: demoSchoolId,
      permissionIds: [],
    });
    minimalPrincipal = await createMinimalSchoolPrincipal();
    await createDemoActivityFeedSeed();

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
      await cleanupE2eData();
      await prisma.$disconnect();
    }
  });

  it('registers the activity feed route and keeps lifecycle routes absent', () => {
    const routes = listRegisteredRoutes();

    expect(routes).toContain('GET /api/v1/dashboard/summary');
    expect(routes).toContain('GET /api/v1/dashboard/alerts');
    expect(routes).toContain('GET /api/v1/dashboard/activity-feed');
    for (const absentRoute of [
      'GET /api/v1/dashboard/activities',
      'GET /api/v1/dashboard/analytics-builder',
      'POST /api/v1/dashboard/activity-feed/:activityId/read',
      'POST /api/v1/dashboard/activity-feed/:activityId/dismiss',
      'POST /api/v1/dashboard/activity-feed/:activityId/pin',
      'POST /api/v1/dashboard/activity-feed/:activityId/unpin',
      'POST /api/v1/dashboard/alerts/:alertId/read',
      'POST /api/v1/dashboard/alerts/:alertId/dismiss',
    ]) {
      expect(routes).not.toContain(absentRoute);
    }
  });

  it('requires dashboard.activity_feed.view and returns the stable feed contract', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const deniedToken = await login(deniedPrincipal.email, PASSWORD);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/activity-feed`)
      .set('Authorization', `Bearer ${deniedToken}`)
      .expect(403);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/activity-feed`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      generatedAt: expect.any(String),
      items: expect.any(Array),
      pageInfo: {
        limit: 20,
        hasMore: expect.any(Boolean),
      },
      filters: {
        source: null,
        eventType: null,
        actorType: null,
        dateFrom: null,
        dateTo: null,
      },
      deferred: {
        readState: 'deferred',
        pinning: 'deferred',
        realtime: 'deferred',
        analyticsBuilder: 'deferred',
      },
    });
    expect(response.body.pageInfo).toHaveProperty('nextCursor');
    expect(
      response.body.pageInfo.nextCursor === null ||
        typeof response.body.pageInfo.nextCursor === 'string',
    ).toBe(true);
    expectNoTenantIds(response.body);
  });

  it('supports source and limit filters', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const sourceResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/activity-feed`)
      .query({ source: 'homework' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(sourceResponse.body.items.length).toBeGreaterThan(0);
    expect(
      sourceResponse.body.items.every(
        (item: { source: string }) => item.source === 'homework',
      ),
    ).toBe(true);

    const limitedResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/activity-feed`)
      .query({ source: 'homework', limit: '1' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(limitedResponse.body.items).toHaveLength(1);
    expect(limitedResponse.body.pageInfo.limit).toBe(1);
    expectNoTenantIds(limitedResponse.body);
  });

  it('rejects invalid filters', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/activity-feed`)
      .query({ source: 'wallet' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/activity-feed`)
      .query({ actorType: 'robot' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/activity-feed`)
      .query({ limit: '101' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/activity-feed`)
      .query({
        dateFrom: '2026-06-03T00:00:00.000Z',
        dateTo: '2026-06-01T00:00:00.000Z',
      })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/activity-feed`)
      .query({ eventType: 'wallet.transaction.create' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });

  it('returns a stable response for minimal data', async () => {
    const token = await login(minimalPrincipal.email, PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/activity-feed`)
      .query({
        dateFrom: '1990-01-01T00:00:00.000Z',
        dateTo: '1990-01-02T00:00:00.000Z',
      })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toMatchObject({
      generatedAt: expect.any(String),
      items: [],
      pageInfo: {
        limit: 20,
        nextCursor: null,
        hasMore: false,
      },
      filters: {
        source: null,
        eventType: null,
        actorType: null,
        dateFrom: '1990-01-01T00:00:00.000Z',
        dateTo: '1990-01-02T00:00:00.000Z',
      },
      deferred: {
        readState: 'deferred',
        pinning: 'deferred',
        realtime: 'deferred',
        analyticsBuilder: 'deferred',
      },
    });
    expectNoTenantIds(response.body);
  });

  it('keeps summary and alerts routes working', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/summary`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toHaveProperty('cards');
        expectNoTenantIds(response.body);
      });

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/alerts`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toHaveProperty('alerts');
        expectNoTenantIds(response.body);
      });
  });

  async function ensureActivityFeedPermission(): Promise<string> {
    const permission = await prisma.permission.upsert({
      where: { code: 'dashboard.activity_feed.view' },
      update: {
        module: 'dashboard',
        resource: 'activity_feed',
        action: 'view',
        description: 'View read-only dashboard operational activity feed',
      },
      create: {
        code: 'dashboard.activity_feed.view',
        module: 'dashboard',
        resource: 'activity_feed',
        action: 'view',
        description: 'View read-only dashboard operational activity feed',
      },
      select: { id: true },
    });

    return permission.id;
  }

  async function ensureDemoAdminHasActivityFeedPermission(): Promise<void> {
    const admin = await prisma.user.findUnique({
      where: { email: DEMO_ADMIN_EMAIL },
      select: { id: true },
    });
    if (!admin) {
      throw new Error('Demo admin not found - run `npm run seed` first.');
    }

    const membership = await prisma.membership.findFirst({
      where: {
        userId: admin.id,
        schoolId: demoSchoolId,
        status: MembershipStatus.ACTIVE,
        deletedAt: null,
      },
      orderBy: { startedAt: 'desc' },
      select: { roleId: true },
    });
    if (!membership) {
      throw new Error('Demo admin school membership missing.');
    }

    await prisma.rolePermission.createMany({
      data: [{ roleId: membership.roleId, permissionId: activityPermissionId }],
      skipDuplicates: true,
    });
  }

  async function createDemoActivityFeedSeed(): Promise<void> {
    const homeworkResourceId = `${marker}-demo-homework`;
    const attendanceResourceId = `${marker}-demo-attendance`;
    createdAuditResourceIds.push(homeworkResourceId, attendanceResourceId);

    await prisma.auditLog.createMany({
      data: [
        {
          organizationId: demoOrganizationId,
          schoolId: demoSchoolId,
          userType: UserType.SERVICE_ACCOUNT,
          module: 'homework',
          action: 'homework.submission.review',
          resourceType: 'homework_submission',
          resourceId: homeworkResourceId,
          outcome: AuditOutcome.SUCCESS,
          createdAt: new Date('2026-06-01T10:00:00.000Z'),
        },
        {
          organizationId: demoOrganizationId,
          schoolId: demoSchoolId,
          userType: UserType.SERVICE_ACCOUNT,
          module: 'attendance',
          action: 'attendance.session.submit',
          resourceType: 'attendance_session',
          resourceId: attendanceResourceId,
          outcome: AuditOutcome.SUCCESS,
          createdAt: new Date('2026-06-01T09:00:00.000Z'),
        },
      ],
    });
  }

  async function createMinimalSchoolPrincipal(): Promise<CreatedPrincipal> {
    const organization = await prisma.organization.create({
      data: {
        slug: `${marker}-minimal-org`,
        name: `Sprint 16C Minimal Org ${suffix}`,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);

    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `${marker}-minimal-school`,
        name: `Sprint 16C Minimal School ${suffix}`,
      },
      select: { id: true },
    });
    createdSchoolIds.push(school.id);

    return createPrincipal({
      label: 'minimal',
      organizationId: organization.id,
      schoolId: school.id,
      permissionIds: [activityPermissionId],
    });
  }

  async function createPrincipal(input: {
    label: string;
    organizationId: string;
    schoolId: string;
    permissionIds: string[];
  }): Promise<CreatedPrincipal> {
    const role = await prisma.role.create({
      data: {
        schoolId: input.schoolId,
        key: `${marker}-${input.label}-role`,
        name: `Sprint 16C ${input.label} role`,
        description: `Sprint 16C dashboard activity ${input.label} role`,
        isSystem: false,
      },
      select: { id: true },
    });
    createdRoleIds.push(role.id);

    if (input.permissionIds.length > 0) {
      await prisma.rolePermission.createMany({
        data: input.permissionIds.map((permissionId) => ({
          roleId: role.id,
          permissionId,
        })),
        skipDuplicates: true,
      });
    }

    const email = `${marker}-${input.label}@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        firstName: 'Dashboard',
        lastName: input.label,
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        passwordHash: await argon2.hash(PASSWORD, ARGON2_OPTIONS),
      },
      select: { id: true },
    });
    createdUserIds.push(user.id);

    await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: input.organizationId,
        schoolId: input.schoolId,
        roleId: role.id,
        userType: UserType.SCHOOL_USER,
        status: MembershipStatus.ACTIVE,
      },
    });

    return {
      email,
      userId: user.id,
      roleId: role.id,
      organizationId: input.organizationId,
      schoolId: input.schoolId,
    };
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

  async function cleanupE2eData(): Promise<void> {
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { resourceId: { in: createdAuditResourceIds } },
          { actorId: { in: createdUserIds } },
          { schoolId: { in: createdSchoolIds } },
          { organizationId: { in: createdOrganizationIds } },
        ],
      },
    });
    if (createdUserIds.length > 0) {
      await prisma.session.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.membership.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }
    if (createdRoleIds.length > 0) {
      await prisma.rolePermission.deleteMany({
        where: { roleId: { in: createdRoleIds } },
      });
      await prisma.role.deleteMany({
        where: { id: { in: createdRoleIds } },
      });
    }
    if (createdSchoolIds.length > 0) {
      await prisma.school.deleteMany({
        where: { id: { in: createdSchoolIds } },
      });
    }
    if (createdOrganizationIds.length > 0) {
      await prisma.organization.deleteMany({
        where: { id: { in: createdOrganizationIds } },
      });
    }
  }
});

function expectNoTenantIds(body: unknown): void {
  const serialized = JSON.stringify(body);
  expect(serialized).not.toContain('schoolId');
  expect(serialized).not.toContain('organizationId');
}

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
