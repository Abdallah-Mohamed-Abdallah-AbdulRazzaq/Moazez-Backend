import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AuditOutcome,
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  SchoolEntitlementStatus,
  SchoolFeatureControlSource,
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
const TEST_PREFIX = `platform-admin-17e-${Date.now()}`;
const PASSWORD = 'Platform17E!Pass';

const PLATFORM_PERMISSIONS = [
  permission('platform.overview.view', 'platform', 'overview', 'view'),
  permission('platform.features.view', 'platform', 'features', 'view'),
  permission('platform.features.manage', 'platform', 'features', 'manage'),
  permission('platform.entitlements.view', 'platform', 'entitlements', 'view'),
  permission(
    'platform.entitlements.manage',
    'platform',
    'entitlements',
    'manage',
  ),
];

const SCHOOL_PERMISSIONS = [
  permission('dashboard.summary.view', 'dashboard', 'summary', 'view'),
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

describe('Sprint 17E Platform Admin feature control foundation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let platformUserId: string;
  let platformAccessToken: string;
  let schoolAdminAccessToken: string;
  let teacherAccessToken: string;
  let studentAccessToken: string;
  let parentAccessToken: string;
  let organizationId: string;
  let schoolId: string;
  let archivedSchoolId: string;
  let academicYearId: string;
  let termId: string;
  let classroomId: string;
  let studentId: string;
  let guardianId: string;

  const createdOrganizationIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdAcademicYearIds: string[] = [];
  const createdTermIds: string[] = [];
  const createdStageIds: string[] = [];
  const createdGradeIds: string[] = [];
  const createdSectionIds: string[] = [];
  const createdClassroomIds: string[] = [];
  const createdSubjectIds: string[] = [];
  const createdAllocationIds: string[] = [];
  const createdStudentIds: string[] = [];
  const createdGuardianIds: string[] = [];
  const createdStudentGuardianIds: string[] = [];
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
    );
    schoolAdminAccessToken = await login(
      `${TEST_PREFIX}-school-admin@moazez.local`,
    );
    teacherAccessToken = await login(`${TEST_PREFIX}-teacher@moazez.local`);
    studentAccessToken = await login(`${TEST_PREFIX}-student@moazez.local`);
    parentAccessToken = await login(`${TEST_PREFIX}-parent@moazez.local`);
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
      await prisma.schoolFeatureControl.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.schoolEntitlement.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.teacherSubjectAllocation.deleteMany({
        where: { id: { in: createdAllocationIds } },
      });
      await prisma.enrollment.deleteMany({
        where: { id: { in: createdEnrollmentIds } },
      });
      await prisma.studentGuardian.deleteMany({
        where: { id: { in: createdStudentGuardianIds } },
      });
      await prisma.guardian.deleteMany({
        where: { id: { in: createdGuardianIds } },
      });
      await prisma.student.deleteMany({
        where: { id: { in: createdStudentIds } },
      });
      await prisma.subject.deleteMany({
        where: { id: { in: createdSubjectIds } },
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
      await prisma.term.deleteMany({
        where: { id: { in: createdTermIds } },
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

  it('registers only the per-school feature-control routes and no billing or rollout surfaces', () => {
    const routes = listRegisteredRoutes();

    expect(routes).toEqual(
      expect.arrayContaining([
        'GET /api/v1/platform-admin/schools/:schoolId/features',
        'PUT /api/v1/platform-admin/schools/:schoolId/features',
        'PUT /api/v1/platform-admin/schools/:schoolId/features/:featureKey',
      ]),
    );

    for (const forbidden of [
      '/platform-admin/billing',
      '/platform-admin/invoices',
      '/platform-admin/payments',
      '/platform-admin/plans',
      '/platform-admin/rollouts',
      '/platform-admin/experiments',
      '/platform-admin/features',
      '/finance',
      '/wallet',
      '/marketplace',
    ]) {
      expect(routes.some((route) => route.includes(forbidden))).toBe(false);
    }
  });

  it('reads all known school features as disabled platform defaults without creating rows', async () => {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/platform-admin/schools/${schoolId}/features`)
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
      summary: {
        totalKnownFeatures: 15,
        configured: 0,
        enabled: 0,
        disabled: 15,
      },
      deferred: {
        runtimeEnforcement: 'deferred',
        planAutomation: 'deferred',
        billing: 'out_of_scope_v1',
        rollouts: 'deferred',
      },
    });
    expect(response.body.features).toHaveLength(15);
    expect(
      response.body.features.map(
        (feature: { featureKey: string }) => feature.featureKey,
      ),
    ).toEqual([
      'dashboard',
      'admissions',
      'students',
      'academics',
      'attendance',
      'grades',
      'homework',
      'reinforcement',
      'behavior',
      'communication',
      'teacher_app',
      'student_app',
      'parent_app',
      'applicant_portal',
      'schedule_timetable',
    ]);
    expect(
      response.body.features.every(
        (feature: { enabled: boolean; configured: boolean; source: string }) =>
          feature.enabled === false &&
          feature.configured === false &&
          feature.source === 'platform_default',
      ),
    ).toBe(true);

    await expect(
      prisma.schoolFeatureControl.count({ where: { schoolId } }),
    ).resolves.toBe(0);
  });

  it('enables and disables a single feature control', async () => {
    const enabled = await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/platform-admin/schools/${schoolId}/features/dashboard`)
      .set('Authorization', `Bearer ${platformAccessToken}`)
      .send({
        enabled: true,
        source: 'platform',
        notes: 'Enabled for launch',
      })
      .expect(200);

    expect(feature(enabled.body, 'dashboard')).toMatchObject({
      enabled: true,
      configured: true,
      source: 'platform',
      notes: 'Enabled for launch',
    });
    expect(enabled.body.summary).toMatchObject({
      configured: 1,
      enabled: 1,
      disabled: 14,
    });

    const disabled = await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/platform-admin/schools/${schoolId}/features/dashboard`)
      .set('Authorization', `Bearer ${platformAccessToken}`)
      .send({
        enabled: false,
        source: 'platform',
        notes: 'Temporarily disabled',
      })
      .expect(200);

    expect(feature(disabled.body, 'dashboard')).toMatchObject({
      enabled: false,
      configured: true,
      source: 'platform',
      notes: 'Temporarily disabled',
    });
    expect(disabled.body.summary).toMatchObject({
      configured: 1,
      enabled: 0,
      disabled: 15,
    });
  });

  it('bulk-updates multiple feature controls transactionally', async () => {
    const response = await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/platform-admin/schools/${schoolId}/features`)
      .set('Authorization', `Bearer ${platformAccessToken}`)
      .send({
        features: [
          {
            featureKey: 'dashboard',
            enabled: true,
            source: 'platform',
            notes: 'Enabled for launch',
          },
          {
            featureKey: 'teacher_app',
            enabled: false,
            source: 'platform',
            notes: 'Deferred until onboarding',
          },
          {
            featureKey: 'student_app',
            enabled: true,
            source: 'platform',
          },
        ],
      })
      .expect(200);

    expect(response.body.summary).toMatchObject({
      totalKnownFeatures: 15,
      configured: 3,
      enabled: 2,
      disabled: 13,
    });
    expect(feature(response.body, 'dashboard')).toMatchObject({
      enabled: true,
      configured: true,
    });
    expect(feature(response.body, 'teacher_app')).toMatchObject({
      enabled: false,
      configured: true,
    });
    expect(feature(response.body, 'student_app')).toMatchObject({
      enabled: true,
      configured: true,
    });

    await expect(
      prisma.schoolFeatureControl.findMany({
        where: { schoolId },
        select: {
          featureKey: true,
          organizationId: true,
          enabled: true,
          source: true,
        },
        orderBy: { featureKey: 'asc' },
      }),
    ).resolves.toEqual([
      {
        featureKey: 'dashboard',
        organizationId,
        enabled: true,
        source: SchoolFeatureControlSource.PLATFORM,
      },
      {
        featureKey: 'student_app',
        organizationId,
        enabled: true,
        source: SchoolFeatureControlSource.PLATFORM,
      },
      {
        featureKey: 'teacher_app',
        organizationId,
        enabled: false,
        source: SchoolFeatureControlSource.PLATFORM,
      },
    ]);
  });

  it('rejects unknown feature keys, duplicate bulk keys, archived schools, and out-of-scope fields', async () => {
    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/platform-admin/schools/${schoolId}/features/billing`)
      .set('Authorization', `Bearer ${platformAccessToken}`)
      .send({ enabled: true, source: 'platform' })
      .expect(422)
      .expect((response) => {
        expect(response.body?.error?.code).toBe('platform.feature.unknown');
      });

    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/platform-admin/schools/${schoolId}/features`)
      .set('Authorization', `Bearer ${platformAccessToken}`)
      .send({
        features: [
          { featureKey: 'dashboard', enabled: true },
          { featureKey: 'dashboard', enabled: false },
        ],
      })
      .expect(422)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'platform.feature.duplicate_key',
        );
      });

    await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/platform-admin/schools/${archivedSchoolId}/features/dashboard`,
      )
      .set('Authorization', `Bearer ${platformAccessToken}`)
      .send({ enabled: true, source: 'platform' })
      .expect(409)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'platform.feature.school_archived',
        );
      });

    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/platform-admin/schools/${schoolId}/features/grades`)
      .set('Authorization', `Bearer ${platformAccessToken}`)
      .send({
        enabled: true,
        source: 'platform',
        planId: 'out-of-scope',
      })
      .expect(400)
      .expect((response) => {
        expect(response.body?.error?.code).toBe('validation.failed');
      });
  });

  it('audits feature-control mutations with sanitized metadata', async () => {
    const logs = await prisma.auditLog.findMany({
      where: {
        actorId: platformUserId,
        module: 'platform_admin',
        schoolId,
        outcome: AuditOutcome.SUCCESS,
        resourceType: {
          in: ['school_feature_control', 'school_feature_controls'],
        },
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
        'platform.feature_control.create',
        'platform.feature_control.update',
        'platform.feature_control.enable',
        'platform.feature_control.disable',
        'platform.feature_controls.bulk_update',
      ]),
    );
    expect(logs.some((log) => log.organizationId === organizationId)).toBe(
      true,
    );
    expect(logs.some((log) => log.schoolId === schoolId)).toBe(true);
    expect(JSON.stringify(logs)).toContain('changedFeatureKeys');

    const serialized = JSON.stringify(logs);
    for (const forbidden of [
      'Enabled for launch',
      'Temporarily disabled',
      'Deferred until onboarding',
      'passwordHash',
      'temporaryPassword',
      'token',
      'invoice',
      'payment',
      'planId',
      'rolloutPercentage',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('includes feature counters in Platform Admin overview without billing analytics', async () => {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/platform-admin/overview`)
      .set('Authorization', `Bearer ${platformAccessToken}`)
      .expect(200);

    expect(response.body.features).toMatchObject({
      knownFeatures: 15,
      configuredSchools: expect.any(Number),
      enabledControls: expect.any(Number),
      disabledControls: expect.any(Number),
    });
    expect(response.body.features.configuredSchools).toBeGreaterThanOrEqual(1);
    expect(response.body.features.enabledControls).toBeGreaterThanOrEqual(2);
    expect(response.body.features.disabledControls).toBeGreaterThanOrEqual(1);
    expect(response.body.deferred).toMatchObject({
      featureControl: 'available',
      billing: 'out_of_scope_v1',
      advancedAnalytics: 'deferred',
    });

    for (const forbidden of ['revenue', 'invoice', 'payment', 'planCatalog']) {
      expect(JSON.stringify(response.body)).not.toContain(forbidden);
    }
  });

  it('keeps existing Platform Admin entitlement routes working', async () => {
    const readResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/platform-admin/schools/${schoolId}/entitlement`)
      .set('Authorization', `Bearer ${platformAccessToken}`)
      .expect(200);

    expect(readResponse.body.entitlement).toBeNull();

    const upsertResponse = await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/platform-admin/schools/${schoolId}/entitlement`)
      .set('Authorization', `Bearer ${platformAccessToken}`)
      .send({
        status: 'active',
        startsAt: '2026-06-01T00:00:00.000Z',
        endsAt: '2027-06-01T00:00:00.000Z',
        studentSeatLimit: 100,
      })
      .expect(200);

    expect(upsertResponse.body.entitlement).toMatchObject({
      status: 'active',
      studentSeatLimit: 100,
    });
    await expect(
      prisma.schoolEntitlement.findUniqueOrThrow({
        where: { schoolId },
        select: { status: true, studentSeatLimit: true },
      }),
    ).resolves.toEqual({
      status: SchoolEntitlementStatus.ACTIVE,
      studentSeatLimit: 100,
    });
  });

  it('does not enforce or block dashboard, teacher, student, or parent app routes', async () => {
    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/platform-admin/schools/${schoolId}/features`)
      .set('Authorization', `Bearer ${platformAccessToken}`)
      .send({
        features: [
          { featureKey: 'dashboard', enabled: false, source: 'platform' },
          { featureKey: 'teacher_app', enabled: false, source: 'platform' },
          { featureKey: 'student_app', enabled: false, source: 'platform' },
          { featureKey: 'parent_app', enabled: false, source: 'platform' },
        ],
      })
      .expect(200);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/summary`)
      .set('Authorization', `Bearer ${schoolAdminAccessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/home`)
      .set('Authorization', `Bearer ${teacherAccessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/home`)
      .set('Authorization', `Bearer ${studentAccessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/home`)
      .set('Authorization', `Bearer ${parentAccessToken}`)
      .expect(200);

    expect(studentId).toEqual(expect.any(String));
    expect(guardianId).toEqual(expect.any(String));
  });

  it('keeps billing, payment, invoice, rollout, experiment, and enforcement routes absent at runtime', async () => {
    for (const route of [
      'billing',
      'payments',
      'invoices',
      'plans',
      'rollouts',
      'experiments',
      'feature-enforcement',
    ]) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/platform-admin/${route}`)
        .set('Authorization', `Bearer ${platformAccessToken}`)
        .expect(404);
    }

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/platform-admin/schools/${schoolId}/features/dashboard/enforcement`,
      )
      .set('Authorization', `Bearer ${platformAccessToken}`)
      .expect(404);
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
      userType: UserType.PLATFORM_USER,
    });

    const schoolAdminRoleId = await createRoleWithPermissions({
      schoolId,
      key: `${TEST_PREFIX}-school-admin-role`,
      permissionCodes: SCHOOL_PERMISSIONS.map((item) => item.code),
    });
    const schoolAdminUserId = await createUser({
      email: `${TEST_PREFIX}-school-admin@moazez.local`,
      userType: UserType.SCHOOL_USER,
    });
    await createMembership({
      userId: schoolAdminUserId,
      roleId: schoolAdminRoleId,
      userType: UserType.SCHOOL_USER,
    });

    const placement = await createAcademicPlacement();
    academicYearId = placement.academicYearId;
    termId = placement.termId;
    classroomId = placement.classroomId;

    const teacherUserId = await createUser({
      email: `${TEST_PREFIX}-teacher@moazez.local`,
      userType: UserType.TEACHER,
    });
    await createMembership({
      userId: teacherUserId,
      roleId: await createRoleWithPermissions({
        schoolId,
        key: `${TEST_PREFIX}-teacher-role`,
        permissionCodes: [],
      }),
      userType: UserType.TEACHER,
    });
    await createTeacherAllocation(teacherUserId, placement.subjectId);

    const studentUserId = await createUser({
      email: `${TEST_PREFIX}-student@moazez.local`,
      userType: UserType.STUDENT,
    });
    await createMembership({
      userId: studentUserId,
      roleId: await createRoleWithPermissions({
        schoolId,
        key: `${TEST_PREFIX}-student-role`,
        permissionCodes: [],
      }),
      userType: UserType.STUDENT,
    });
    const student = await prisma.student.create({
      data: {
        schoolId,
        organizationId,
        userId: studentUserId,
        firstName: `${TEST_PREFIX} Student`,
        lastName: 'Learner',
        status: StudentStatus.ACTIVE,
      },
      select: { id: true },
    });
    studentId = student.id;
    createdStudentIds.push(student.id);
    const enrollment = await prisma.enrollment.create({
      data: {
        schoolId,
        studentId: student.id,
        academicYearId,
        termId,
        classroomId,
        status: StudentEnrollmentStatus.ACTIVE,
        enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
      },
      select: { id: true },
    });
    createdEnrollmentIds.push(enrollment.id);

    const parentUserId = await createUser({
      email: `${TEST_PREFIX}-parent@moazez.local`,
      userType: UserType.PARENT,
    });
    await createMembership({
      userId: parentUserId,
      roleId: await createRoleWithPermissions({
        schoolId,
        key: `${TEST_PREFIX}-parent-role`,
        permissionCodes: [],
      }),
      userType: UserType.PARENT,
    });
    const guardian = await prisma.guardian.create({
      data: {
        schoolId,
        organizationId,
        userId: parentUserId,
        firstName: `${TEST_PREFIX} Parent`,
        lastName: 'Guardian',
        phone: `+201${hashSuffix(`${TEST_PREFIX}-guardian`).slice(0, 9)}`,
        email: `${TEST_PREFIX}-guardian@example.test`,
        relation: 'father',
        isPrimary: true,
      },
      select: { id: true },
    });
    guardianId = guardian.id;
    createdGuardianIds.push(guardian.id);
    const studentGuardian = await prisma.studentGuardian.create({
      data: {
        schoolId,
        studentId: student.id,
        guardianId: guardian.id,
        isPrimary: true,
      },
      select: { id: true },
    });
    createdStudentGuardianIds.push(studentGuardian.id);
  }

  async function createAcademicPlacement(): Promise<{
    academicYearId: string;
    termId: string;
    classroomId: string;
    subjectId: string;
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

    const term = await prisma.term.create({
      data: {
        schoolId,
        academicYearId: academicYear.id,
        nameAr: `${TEST_PREFIX} Term AR`,
        nameEn: `${TEST_PREFIX} Term`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-01-15T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    createdTermIds.push(term.id);

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

    const subject = await prisma.subject.create({
      data: {
        schoolId,
        nameAr: `${TEST_PREFIX} Subject AR`,
        nameEn: `${TEST_PREFIX} Subject`,
        code: `${TEST_PREFIX}-subject`,
        isActive: true,
      },
      select: { id: true },
    });
    createdSubjectIds.push(subject.id);

    return {
      academicYearId: academicYear.id,
      termId: term.id,
      classroomId: classroom.id,
      subjectId: subject.id,
    };
  }

  async function createTeacherAllocation(
    teacherUserId: string,
    subjectId: string,
  ): Promise<void> {
    const allocation = await prisma.teacherSubjectAllocation.create({
      data: {
        schoolId,
        teacherUserId,
        subjectId,
        classroomId,
        termId,
      },
      select: { id: true },
    });
    createdAllocationIds.push(allocation.id);
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
    userType: UserType;
  }): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: params.email,
        firstName: 'Test',
        lastName: 'Actor',
        userType: params.userType,
        status: UserStatus.ACTIVE,
        passwordHash: await argon2.hash(PASSWORD, ARGON2_OPTIONS),
      },
      select: { id: true },
    });
    createdUserIds.push(user.id);
    return user.id;
  }

  async function createMembership(params: {
    userId: string;
    roleId: string;
    userType: UserType;
  }): Promise<void> {
    await prisma.membership.create({
      data: {
        userId: params.userId,
        organizationId,
        schoolId,
        roleId: params.roleId,
        userType: params.userType,
        status: MembershipStatus.ACTIVE,
      },
    });
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
    if (permissions.length > 0) {
      await prisma.rolePermission.createMany({
        data: permissions.map((item) => ({
          roleId: role.id,
          permissionId: item.id,
        })),
        skipDuplicates: true,
      });
    }

    return role.id;
  }

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: PASSWORD })
      .expect(200);

    return response.body.accessToken;
  }

  function feature(
    body: { features: Array<{ featureKey: string }> },
    featureKey: string,
  ): unknown {
    return body.features.find((item) => item.featureKey === featureKey);
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

  function hashSuffix(value: string): string {
    const hash = [...value].reduce(
      (current, char) => current + char.charCodeAt(0),
      0,
    );
    return String(hash).padEnd(9, '0');
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
