import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AuditOutcome,
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  SchoolEntitlementStatus,
  SchoolStatus,
  StudentEnrollmentStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { BullmqService } from '../../src/infrastructure/queue/bullmq.service';

const GLOBAL_PREFIX = '/api/v1';
const TEST_PREFIX = `platform-admin-17d-${Date.now()}`;
const PLATFORM_PASSWORD = 'Platform17D!Pass';
const SCHOOL_PASSWORD = 'School17D!Pass';

const PLATFORM_PERMISSIONS = [
  permission('platform.overview.view', 'platform', 'overview', 'view'),
  permission('platform.entitlements.view', 'platform', 'entitlements', 'view'),
  permission(
    'platform.entitlements.manage',
    'platform',
    'entitlements',
    'manage',
  ),
];

const SCHOOL_PERMISSIONS = [
  permission('students.records.view', 'students', 'records', 'view'),
  permission('students.records.manage', 'students', 'records', 'manage'),
  permission('students.enrollments.view', 'students', 'enrollments', 'view'),
  permission(
    'students.enrollments.manage',
    'students',
    'enrollments',
    'manage',
  ),
];

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

jest.setTimeout(120000);

describe('Sprint 17D Platform Admin entitlements and student seat usage (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let platformUserId: string;
  let platformAccessToken: string;
  let schoolAdminAccessToken: string;
  let organizationId: string;
  let schoolId: string;
  let archivedSchoolId: string;
  let academicYearId: string;
  let classroomId: string;

  const createdOrganizationIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdAcademicYearIds: string[] = [];
  const createdStageIds: string[] = [];
  const createdGradeIds: string[] = [];
  const createdSectionIds: string[] = [];
  const createdClassroomIds: string[] = [];
  const createdStudentIds: string[] = [];
  const createdEnrollmentIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    await ensurePermissionsAndPlatformRole();
    await createTenantAndActors();

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
        transformOptions: { enableImplicitConversion: false },
      }),
    );
    await app.init();

    platformAccessToken = await login(
      `${TEST_PREFIX}-platform@moazez.local`,
      PLATFORM_PASSWORD,
    );
    schoolAdminAccessToken = await login(
      `${TEST_PREFIX}-school-admin@moazez.local`,
      SCHOOL_PASSWORD,
    );
  });

  afterAll(async () => {
    if (app) await app.close();

    if (prisma) {
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { actorId: { in: createdUserIds } },
            { organizationId: { in: createdOrganizationIds } },
            { schoolId: { in: createdSchoolIds } },
          ],
        },
      });
      await prisma.session.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.schoolEntitlement.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.enrollment.deleteMany({
        where: { id: { in: createdEnrollmentIds } },
      });
      await prisma.student.deleteMany({
        where: { id: { in: createdStudentIds } },
      });
      await prisma.classroom.deleteMany({
        where: { id: { in: createdClassroomIds } },
      });
      await prisma.section.deleteMany({
        where: { id: { in: createdSectionIds } },
      });
      await prisma.grade.deleteMany({
        where: { id: { in: createdGradeIds } },
      });
      await prisma.stage.deleteMany({
        where: { id: { in: createdStageIds } },
      });
      await prisma.academicYear.deleteMany({
        where: { id: { in: createdAcademicYearIds } },
      });
      await prisma.membership.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.rolePermission.deleteMany({
        where: { roleId: { in: createdRoleIds } },
      });
      await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      await prisma.school.deleteMany({
        where: { id: { in: createdSchoolIds } },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: createdOrganizationIds } },
      });
      await prisma.$disconnect();
    }
  });

  it('registers only school-scoped entitlement routes and keeps deferred route families absent', () => {
    const routes = listRegisteredRoutes();

    expect(routes).toEqual(
      expect.arrayContaining([
        'GET /api/v1/platform-admin/schools/:schoolId/entitlement',
        'PUT /api/v1/platform-admin/schools/:schoolId/entitlement',
      ]),
    );

    for (const route of [
      'GET /api/v1/platform-admin/entitlements',
      'GET /api/v1/platform-admin/subscriptions',
      'GET /api/v1/platform-admin/billing',
      'GET /api/v1/platform-admin/invoices',
      'GET /api/v1/platform-admin/payments',
      'GET /api/v1/platform-admin/features',
      'GET /api/v1/platform-admin/schools/:schoolId/features',
      'GET /api/v1/platform-admin/schools/:schoolId/seat-enforcement',
    ]) {
      expect(routes).not.toContain(route);
    }
  });

  it('reads a school with no entitlement as null plus current usage', async () => {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/platform-admin/schools/${schoolId}/entitlement`)
      .set('Authorization', `Bearer ${platformAccessToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      school: {
        schoolId,
        organizationId,
        name: `${TEST_PREFIX} School`,
        slug: `${TEST_PREFIX}-school`,
        status: 'active',
      },
      entitlement: null,
      studentSeatUsage: {
        used: 0,
        limit: null,
        remaining: null,
        isUnlimited: true,
        isOverLimit: false,
        calculation: 'active_students',
      },
    });
  });

  it('upserts entitlement and computes active student seat usage', async () => {
    await createUsageFixture();

    const response = await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/platform-admin/schools/${schoolId}/entitlement`)
      .set('Authorization', `Bearer ${platformAccessToken}`)
      .send({
        status: 'active',
        startsAt: '2026-06-01T00:00:00.000Z',
        endsAt: '2027-06-01T00:00:00.000Z',
        studentSeatLimit: 5,
        notes: 'Annual school entitlement',
      })
      .expect(200);

    expect(response.body).toMatchObject({
      entitlement: {
        entitlementId: expect.any(String),
        status: 'active',
        startsAt: '2026-06-01T00:00:00.000Z',
        endsAt: '2027-06-01T00:00:00.000Z',
        studentSeatLimit: 5,
        notes: 'Annual school entitlement',
      },
      studentSeatUsage: {
        used: 3,
        limit: 5,
        remaining: 2,
        isUnlimited: false,
        isOverLimit: false,
        calculation: 'active_students',
      },
    });

    await expect(
      prisma.schoolEntitlement.findUniqueOrThrow({
        where: { schoolId },
        select: {
          organizationId: true,
          status: true,
          studentSeatLimit: true,
        },
      }),
    ).resolves.toEqual({
      organizationId,
      status: SchoolEntitlementStatus.ACTIVE,
      studentSeatLimit: 5,
    });
  });

  it('updates entitlement status/date/seat limit and marks over-limit state', async () => {
    const response = await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/platform-admin/schools/${schoolId}/entitlement`)
      .set('Authorization', `Bearer ${platformAccessToken}`)
      .send({
        status: 'suspended',
        startsAt: '2026-07-01T00:00:00.000Z',
        endsAt: '2027-07-01T00:00:00.000Z',
        studentSeatLimit: 2,
        notes: 'Limit lowered for audit',
      })
      .expect(200);

    expect(response.body).toMatchObject({
      entitlement: {
        status: 'suspended',
        startsAt: '2026-07-01T00:00:00.000Z',
        endsAt: '2027-07-01T00:00:00.000Z',
        studentSeatLimit: 2,
      },
      studentSeatUsage: {
        used: 3,
        limit: 2,
        remaining: 0,
        isOverLimit: true,
      },
    });
  });

  it('rejects invalid date ranges, invalid seat limits, and archived schools', async () => {
    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/platform-admin/schools/${schoolId}/entitlement`)
      .set('Authorization', `Bearer ${platformAccessToken}`)
      .send({
        startsAt: '2027-06-01T00:00:00.000Z',
        endsAt: '2026-06-01T00:00:00.000Z',
      })
      .expect(422)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'platform.entitlement.invalid_date_range',
        );
      });

    for (const studentSeatLimit of [0, -1]) {
      await request(app.getHttpServer())
        .put(`${GLOBAL_PREFIX}/platform-admin/schools/${schoolId}/entitlement`)
        .set('Authorization', `Bearer ${platformAccessToken}`)
        .send({ studentSeatLimit })
        .expect(422)
        .expect((response) => {
          expect(response.body?.error?.code).toBe(
            'platform.entitlement.student_seat_limit_invalid',
          );
        });
    }

    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/platform-admin/schools/${schoolId}/entitlement`)
      .set('Authorization', `Bearer ${platformAccessToken}`)
      .send({ status: 'billing_active' })
      .expect(400)
      .expect((response) => {
        expect(response.body?.error?.code).toBe('validation.failed');
      });

    await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/platform-admin/schools/${archivedSchoolId}/entitlement`,
      )
      .set('Authorization', `Bearer ${platformAccessToken}`)
      .send({ status: 'active', studentSeatLimit: 10 })
      .expect(409)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'platform.entitlement.school_archived',
        );
      });
  });

  it('does not enforce the lowered seat limit on student or enrollment creation', async () => {
    const studentResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/students`)
      .set('Authorization', `Bearer ${schoolAdminAccessToken}`)
      .send({
        full_name_en: `${TEST_PREFIX} Extra Student`,
        dateOfBirth: '2015-05-10',
      })
      .expect(201);
    createdStudentIds.push(studentResponse.body.id);

    const enrollmentResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/enrollments`)
      .set('Authorization', `Bearer ${schoolAdminAccessToken}`)
      .send({
        studentId: studentResponse.body.id,
        academicYearId,
        classroomId,
        enrollmentDate: '2026-09-05',
      })
      .expect(201);
    createdEnrollmentIds.push(enrollmentResponse.body.enrollmentId);

    const entitlementResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/platform-admin/schools/${schoolId}/entitlement`)
      .set('Authorization', `Bearer ${platformAccessToken}`)
      .expect(200);

    expect(entitlementResponse.body.studentSeatUsage).toMatchObject({
      used: 4,
      limit: 2,
      remaining: 0,
      isOverLimit: true,
      calculation: 'active_students',
    });
  });

  it('audits entitlement mutations with sanitized metadata', async () => {
    const logs = await prisma.auditLog.findMany({
      where: {
        actorId: platformUserId,
        module: 'platform_admin',
        resourceType: 'school_entitlement',
        schoolId,
        outcome: AuditOutcome.SUCCESS,
      },
      select: {
        action: true,
        before: true,
        after: true,
        organizationId: true,
        schoolId: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    expect(logs.map((log) => log.action)).toEqual(
      expect.arrayContaining([
        'platform.entitlement.create',
        'platform.entitlement.update',
      ]),
    );
    expect(logs.some((log) => log.organizationId === organizationId)).toBe(
      true,
    );
    expect(logs.some((log) => log.schoolId === schoolId)).toBe(true);
    expect(
      logs.some((log) =>
        JSON.stringify(log.after).includes('studentSeatLimit'),
      ),
    ).toBe(true);

    const serialized = JSON.stringify(logs);
    for (const forbidden of [
      'passwordHash',
      'temporaryPassword',
      'token',
      'invoice',
      'payment',
      'Annual school entitlement',
      'Limit lowered for audit',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('includes entitlement counters in Platform Admin overview without billing analytics', async () => {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/platform-admin/overview`)
      .set('Authorization', `Bearer ${platformAccessToken}`)
      .expect(200);

    expect(response.body.entitlements).toMatchObject({
      total: expect.any(Number),
      active: expect.any(Number),
      trial: expect.any(Number),
      suspended: expect.any(Number),
      expired: expect.any(Number),
      archived: expect.any(Number),
      schoolsOverSeatLimit: expect.any(Number),
    });
    expect(response.body.entitlements.total).toBeGreaterThanOrEqual(1);
    expect(
      response.body.entitlements.schoolsOverSeatLimit,
    ).toBeGreaterThanOrEqual(1);
    expect(response.body.deferred).toMatchObject({
      entitlements: 'available',
      featureControl: 'deferred',
      billing: 'out_of_scope_v1',
    });
    expect(JSON.stringify(response.body)).not.toContain('revenue');
  });

  async function createTenantAndActors(): Promise<void> {
    const organization = await prisma.organization.create({
      data: {
        name: `${TEST_PREFIX} Organization`,
        slug: `${TEST_PREFIX}-org`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    organizationId = organization.id;
    createdOrganizationIds.push(organization.id);

    const [school, archivedSchool] = await Promise.all([
      prisma.school.create({
        data: {
          organizationId,
          name: `${TEST_PREFIX} School`,
          slug: `${TEST_PREFIX}-school`,
          status: SchoolStatus.ACTIVE,
        },
        select: { id: true },
      }),
      prisma.school.create({
        data: {
          organizationId,
          name: `${TEST_PREFIX} Archived School`,
          slug: `${TEST_PREFIX}-archived-school`,
          status: SchoolStatus.ARCHIVED,
        },
        select: { id: true },
      }),
    ]);
    schoolId = school.id;
    archivedSchoolId = archivedSchool.id;
    createdSchoolIds.push(school.id, archivedSchool.id);

    platformUserId = await createUser({
      email: `${TEST_PREFIX}-platform@moazez.local`,
      password: PLATFORM_PASSWORD,
      userType: UserType.PLATFORM_USER,
    });

    const schoolAdminRoleId = await createRoleWithPermissions({
      schoolId,
      key: `${TEST_PREFIX}-school-admin-role`,
      permissionCodes: SCHOOL_PERMISSIONS.map((item) => item.code),
    });
    const schoolAdminUserId = await createUser({
      email: `${TEST_PREFIX}-school-admin@moazez.local`,
      password: SCHOOL_PASSWORD,
      userType: UserType.SCHOOL_USER,
    });

    await prisma.membership.create({
      data: {
        userId: schoolAdminUserId,
        organizationId,
        schoolId,
        roleId: schoolAdminRoleId,
        userType: UserType.SCHOOL_USER,
        status: MembershipStatus.ACTIVE,
      },
    });

    const placement = await createAcademicPlacement();
    academicYearId = placement.academicYearId;
    classroomId = placement.classroomId;
  }

  async function createUsageFixture(): Promise<void> {
    if (createdStudentIds.length > 0) return;

    for (const label of ['Active A', 'Active B', 'Active C']) {
      const student = await createStudent(label, StudentStatus.ACTIVE);
      await createEnrollment(student.id, StudentEnrollmentStatus.ACTIVE);
    }

    const withdrawnEnrollmentStudent = await createStudent(
      'Historical Enrollment',
      StudentStatus.ACTIVE,
    );
    await createEnrollment(
      withdrawnEnrollmentStudent.id,
      StudentEnrollmentStatus.WITHDRAWN,
    );

    const withdrawnStudent = await createStudent(
      'Withdrawn Student',
      StudentStatus.WITHDRAWN,
    );
    await createEnrollment(withdrawnStudent.id, StudentEnrollmentStatus.ACTIVE);
  }

  async function createAcademicPlacement(): Promise<{
    academicYearId: string;
    classroomId: string;
  }> {
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId,
        nameAr: `${TEST_PREFIX} Year AR`,
        nameEn: `${TEST_PREFIX} Year`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-06-30T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    createdAcademicYearIds.push(academicYear.id);

    const stage = await prisma.stage.create({
      data: {
        schoolId,
        nameAr: `${TEST_PREFIX} Stage AR`,
        nameEn: `${TEST_PREFIX} Stage`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    createdStageIds.push(stage.id);

    const grade = await prisma.grade.create({
      data: {
        schoolId,
        stageId: stage.id,
        nameAr: `${TEST_PREFIX} Grade AR`,
        nameEn: `${TEST_PREFIX} Grade`,
        sortOrder: 1,
        capacity: 30,
      },
      select: { id: true },
    });
    createdGradeIds.push(grade.id);

    const section = await prisma.section.create({
      data: {
        schoolId,
        gradeId: grade.id,
        nameAr: `${TEST_PREFIX} Section AR`,
        nameEn: `${TEST_PREFIX} Section`,
        sortOrder: 1,
        capacity: 30,
      },
      select: { id: true },
    });
    createdSectionIds.push(section.id);

    const classroom = await prisma.classroom.create({
      data: {
        schoolId,
        sectionId: section.id,
        nameAr: `${TEST_PREFIX} Classroom AR`,
        nameEn: `${TEST_PREFIX} Classroom`,
        sortOrder: 1,
        capacity: 30,
      },
      select: { id: true },
    });
    createdClassroomIds.push(classroom.id);

    return { academicYearId: academicYear.id, classroomId: classroom.id };
  }

  async function createStudent(
    label: string,
    status: StudentStatus,
  ): Promise<{ id: string }> {
    const student = await prisma.student.create({
      data: {
        schoolId,
        organizationId,
        firstName: `${TEST_PREFIX} ${label}`,
        lastName: 'Student',
        status,
      },
      select: { id: true },
    });
    createdStudentIds.push(student.id);
    return student;
  }

  async function createEnrollment(
    studentId: string,
    status: StudentEnrollmentStatus,
  ): Promise<void> {
    const enrollment = await prisma.enrollment.create({
      data: {
        schoolId,
        studentId,
        academicYearId,
        classroomId,
        status,
        enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
        endedAt:
          status === StudentEnrollmentStatus.ACTIVE
            ? null
            : new Date('2026-10-01T00:00:00.000Z'),
        exitReason:
          status === StudentEnrollmentStatus.ACTIVE ? null : 'Historical row',
      },
      select: { id: true },
    });
    createdEnrollmentIds.push(enrollment.id);
  }

  async function ensurePermissionsAndPlatformRole(): Promise<void> {
    for (const item of [...PLATFORM_PERMISSIONS, ...SCHOOL_PERMISSIONS]) {
      await prisma.permission.upsert({
        where: { code: item.code },
        update: item,
        create: item,
      });
    }

    const platformRole = await prisma.role.findFirst({
      where: {
        key: 'platform_super_admin',
        schoolId: null,
        isSystem: true,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!platformRole) {
      throw new Error(
        'platform_super_admin system role not found - run `npm run seed` first.',
      );
    }

    const permissions = await prisma.permission.findMany({
      where: { code: { in: PLATFORM_PERMISSIONS.map((item) => item.code) } },
      select: { id: true },
    });
    await prisma.rolePermission.createMany({
      data: permissions.map((item) => ({
        roleId: platformRole.id,
        permissionId: item.id,
      })),
      skipDuplicates: true,
    });
  }

  async function createUser(params: {
    email: string;
    password: string;
    userType: UserType;
  }): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: params.email,
        firstName: 'Test',
        lastName: 'Actor',
        userType: params.userType,
        status: UserStatus.ACTIVE,
        passwordHash: await argon2.hash(params.password, ARGON2_OPTIONS),
      },
      select: { id: true },
    });
    createdUserIds.push(user.id);
    return user.id;
  }

  async function createRoleWithPermissions(params: {
    schoolId: string;
    key: string;
    permissionCodes: string[];
  }): Promise<string> {
    const role = await prisma.role.create({
      data: {
        schoolId: params.schoolId,
        key: params.key,
        name: params.key,
        isSystem: false,
      },
      select: { id: true },
    });
    createdRoleIds.push(role.id);

    const permissions = await prisma.permission.findMany({
      where: { code: { in: params.permissionCodes } },
      select: { id: true },
    });
    await prisma.rolePermission.createMany({
      data: permissions.map((item) => ({
        roleId: role.id,
        permissionId: item.id,
      })),
      skipDuplicates: true,
    });

    return role.id;
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

function permission(
  code: string,
  module: string,
  resource: string,
  action: string,
): {
  code: string;
  module: string;
  resource: string;
  action: string;
  description: string;
} {
  return {
    code,
    module,
    resource,
    action,
    description: `${code} test permission`,
  };
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
