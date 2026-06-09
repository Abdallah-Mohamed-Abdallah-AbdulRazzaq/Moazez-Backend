import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
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
const TEST_PREFIX = `platform-admin-17f-${Date.now()}`;
const PLATFORM_PASSWORD = 'Platform17F!Pass';
const SCHOOL_PASSWORD = 'School17F!Pass';

const PLATFORM_PERMISSIONS = [
  permission('platform.overview.view', 'platform', 'overview', 'view'),
  permission('platform.entitlements.view', 'platform', 'entitlements', 'view'),
  permission(
    'platform.entitlements.manage',
    'platform',
    'entitlements',
    'manage',
  ),
  permission('platform.features.view', 'platform', 'features', 'view'),
  permission('platform.features.manage', 'platform', 'features', 'manage'),
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
  permission('students.lifecycle.manage', 'students', 'lifecycle', 'manage'),
  permission('admissions.leads.view', 'admissions', 'leads', 'view'),
  permission('admissions.leads.manage', 'admissions', 'leads', 'manage'),
  permission(
    'admissions.applications.view',
    'admissions',
    'applications',
    'view',
  ),
  permission(
    'admissions.applications.manage',
    'admissions',
    'applications',
    'manage',
  ),
  permission('admissions.tests.view', 'admissions', 'tests', 'view'),
  permission('admissions.tests.manage', 'admissions', 'tests', 'manage'),
  permission('admissions.interviews.view', 'admissions', 'interviews', 'view'),
  permission(
    'admissions.interviews.manage',
    'admissions',
    'interviews',
    'manage',
  ),
  permission('admissions.decisions.view', 'admissions', 'decisions', 'view'),
  permission(
    'admissions.decisions.manage',
    'admissions',
    'decisions',
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

type CreatedStudent = {
  id: string;
  enrollmentId?: string;
};

type EntitlementReadResponse = {
  entitlement: {
    status?: string;
    startsAt?: string | null;
    endsAt?: string | null;
    studentSeatLimit?: number | null;
  } | null;
  studentSeatUsage: {
    used: number;
    limit: number | null;
    remaining: number | null;
    isUnlimited: boolean;
    isOverLimit: boolean;
    calculation: string;
  };
};

jest.setTimeout(120000);

describe('Sprint 17F Platform Admin student seat limit enforcement (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let platformAccessToken: string;
  let schoolAdminAccessToken: string;
  let organizationId: string;
  let schoolId: string;
  let academicYearId: string;
  let gradeId: string;
  let classroomId: string;
  let schoolAdminEmail: string;
  let primaryStudent: CreatedStudent;
  let secondaryStudent: CreatedStudent;
  let leadPhoneSequence = 10_000_000;

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
  const createdLeadIds: string[] = [];
  const createdApplicationIds: string[] = [];
  const createdPlacementTestIds: string[] = [];
  const createdInterviewIds: string[] = [];
  const createdDecisionIds: string[] = [];

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
    schoolAdminAccessToken = await login(schoolAdminEmail, SCHOOL_PASSWORD);
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
      await prisma.admissionDecision.deleteMany({
        where: { id: { in: createdDecisionIds } },
      });
      await prisma.interview.deleteMany({
        where: { id: { in: createdInterviewIds } },
      });
      await prisma.placementTest.deleteMany({
        where: { id: { in: createdPlacementTestIds } },
      });
      await prisma.application.deleteMany({
        where: { id: { in: createdApplicationIds } },
      });
      await prisma.lead.deleteMany({ where: { id: { in: createdLeadIds } } });
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

  it('keeps billing, plan, invoice, payment, feature-enforcement, and login-blocking routes absent', async () => {
    const routes = listRegisteredRoutes();

    expect(routes).toEqual(
      expect.arrayContaining([
        'GET /api/v1/platform-admin/schools/:schoolId/entitlement',
        'PUT /api/v1/platform-admin/schools/:schoolId/entitlement',
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
      '/platform-admin/seat-enforcement',
      '/platform-admin/feature-enforcement',
      '/billing',
      '/finance',
      '/wallet',
      '/marketplace',
    ]) {
      expect(routes.some((route) => route.includes(forbidden))).toBe(false);
    }

    for (const route of ['billing', 'payments', 'invoices', 'plans']) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/platform-admin/${route}`)
        .set('Authorization', `Bearer ${platformAccessToken}`)
        .expect(404);
    }
  });

  it('configures a seat limit, reaches it through active enrollments, and blocks the next active seat only', async () => {
    await upsertEntitlement({
      status: 'active',
      studentSeatLimit: 2,
    });

    const initialEntitlement = await readEntitlement();
    expect(initialEntitlement.studentSeatUsage).toMatchObject({
      used: 0,
      limit: 2,
      remaining: 2,
      isUnlimited: false,
      isOverLimit: false,
      calculation: 'active_students',
    });

    primaryStudent = await createAndEnrollStudent('Limit One');
    secondaryStudent = await createAndEnrollStudent('Limit Two');

    await expect(countActiveStudentSeats()).resolves.toBe(2);

    const atLimitEntitlement = await readEntitlement();
    expect(atLimitEntitlement.studentSeatUsage).toMatchObject({
      used: 2,
      limit: 2,
      remaining: 0,
      isOverLimit: false,
      calculation: 'active_students',
    });

    const extraStudent = await createStudent('Limit Extra');
    const blockedEnrollment = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/enrollments`)
      .set('Authorization', `Bearer ${schoolAdminAccessToken}`)
      .send(enrollmentPayload(extraStudent.id, '2026-09-03'))
      .expect(409);

    expect(blockedEnrollment.body?.error).toMatchObject({
      code: 'platform.entitlement.student_seat_limit_exceeded',
      message: 'Student seat limit has been reached for this school.',
      details: {
        schoolId,
        limit: 2,
        used: 2,
        remaining: 0,
        calculation: 'active_students',
      },
    });
    for (const forbidden of [
      'invoice',
      'payment',
      'billing',
      'plan',
      'feature',
      'guardian',
      'Limit Extra',
    ]) {
      expect(
        JSON.stringify(blockedEnrollment.body).toLowerCase(),
      ).not.toContain(forbidden.toLowerCase());
    }

    await expect(
      prisma.enrollment.count({ where: { studentId: extraStudent.id } }),
    ).resolves.toBe(0);
    await expect(countActiveStudentSeats()).resolves.toBe(2);
  });

  it('marks lowered limits as over-limit without mutating students, updates, access, or withdrawals', async () => {
    const activeEnrollmentIdsBefore = await activeEnrollmentIds();

    await upsertEntitlement({
      status: 'suspended',
      startsAt: '2027-01-01T00:00:00.000Z',
      endsAt: '2027-12-31T00:00:00.000Z',
      studentSeatLimit: 1,
    });

    const loweredEntitlement = await readEntitlement();
    expect(loweredEntitlement.entitlement).toMatchObject({
      status: 'suspended',
      startsAt: '2027-01-01T00:00:00.000Z',
      endsAt: '2027-12-31T00:00:00.000Z',
      studentSeatLimit: 1,
    });
    expect(loweredEntitlement.studentSeatUsage).toMatchObject({
      used: 2,
      limit: 1,
      remaining: 0,
      isOverLimit: true,
      calculation: 'active_students',
    });

    await expect(activeEnrollmentIds()).resolves.toEqual(
      activeEnrollmentIdsBefore,
    );

    await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/students-guardians/students/${primaryStudent.id}`,
      )
      .set('Authorization', `Bearer ${schoolAdminAccessToken}`)
      .send({ first_name_en: `${TEST_PREFIX} Updated` })
      .expect(200)
      .expect((response) => {
        expect(response.body.id).toBe(primaryStudent.id);
      });

    const refreshedToken = await login(schoolAdminEmail, SCHOOL_PASSWORD);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/students-guardians/students`)
      .set('Authorization', `Bearer ${refreshedToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/enrollments/withdraw`)
      .set('Authorization', `Bearer ${schoolAdminAccessToken}`)
      .send({
        studentId: secondaryStudent.id,
        effectiveDate: '2026-10-01',
        reason: 'Family relocation',
        actionType: 'withdrawn',
      })
      .expect(200)
      .expect((response) => {
        expect(response.body.studentId).toBe(secondaryStudent.id);
        expect(response.body.actionType).toBe('withdrawn');
      });

    await expect(countActiveStudentSeats()).resolves.toBe(1);
  });

  it('does not introduce runtime feature enforcement for student record mutations', async () => {
    await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/platform-admin/schools/${schoolId}/features/students`,
      )
      .set('Authorization', `Bearer ${platformAccessToken}`)
      .send({
        enabled: false,
        source: 'platform',
        notes: 'Disabled in 17F to prove runtime enforcement stays deferred',
      })
      .expect(200);

    await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/students-guardians/students/${primaryStudent.id}`,
      )
      .set('Authorization', `Bearer ${schoolAdminAccessToken}`)
      .send({ family_name_en: 'FeatureDisabledButEditable' })
      .expect(200);
  });

  it('allows admissions intake and preview, then blocks admissions-backed enrollment at the target school limit without partial side effects', async () => {
    const lead = await createLead('At Limit Lead');
    const application = await createApplication({
      leadId: lead.id,
      label: 'At Limit Application',
    });

    expect(lead.id).toEqual(expect.any(String));
    expect(application.id).toEqual(expect.any(String));

    const acceptedFlow = await createAcceptedApplication(
      'Admissions Blocked Seat',
    );

    const preview = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/admissions/applications/${acceptedFlow.applicationId}/enroll`,
      )
      .set('Authorization', `Bearer ${schoolAdminAccessToken}`)
      .expect(200);

    expect(preview.body).toMatchObject({
      applicationId: acceptedFlow.applicationId,
      eligible: true,
      handoff: {
        enrollmentDraft: {
          requestedAcademicYearId: academicYearId,
          requestedGradeId: gradeId,
        },
      },
    });

    const student = await createStudent('Admissions Candidate');
    const sideEffectsBefore = await enrollmentHandoffSideEffectSnapshot(
      student.id,
    );

    const blockedHandoffEnrollment = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/enrollments`)
      .set('Authorization', `Bearer ${schoolAdminAccessToken}`)
      .send({
        ...enrollmentPayload(student.id, '2026-09-04'),
        applicationId: acceptedFlow.applicationId,
      })
      .expect(409);

    expect(blockedHandoffEnrollment.body?.error).toMatchObject({
      code: 'platform.entitlement.student_seat_limit_exceeded',
      details: {
        schoolId,
        limit: 1,
        used: 1,
        remaining: 0,
        calculation: 'active_students',
      },
    });
    expect(
      JSON.stringify(blockedHandoffEnrollment.body).toLowerCase(),
    ).not.toContain('guardian');

    await expect(
      enrollmentHandoffSideEffectSnapshot(student.id),
    ).resolves.toEqual(sideEffectsBefore);
    await expect(countActiveStudentSeats()).resolves.toBe(1);
  });

  it('keeps no-entitlement and null-limit schools unlimited for active seat additions', async () => {
    await prisma.schoolEntitlement.deleteMany({ where: { schoolId } });

    const noEntitlement = await readEntitlement();
    expect(noEntitlement.entitlement).toBeNull();
    expect(noEntitlement.studentSeatUsage).toMatchObject({
      limit: null,
      remaining: null,
      isUnlimited: true,
      calculation: 'active_students',
    });

    await createAndEnrollStudent('No Entitlement One', '2026-09-05');
    await createAndEnrollStudent('No Entitlement Two', '2026-09-06');

    await upsertEntitlement({
      status: 'expired',
      startsAt: '2025-01-01T00:00:00.000Z',
      endsAt: '2025-12-31T00:00:00.000Z',
      studentSeatLimit: null,
    });

    const nullLimit = await readEntitlement();
    expect(nullLimit.entitlement).toMatchObject({
      status: 'expired',
      studentSeatLimit: null,
    });
    expect(nullLimit.studentSeatUsage).toMatchObject({
      limit: null,
      remaining: null,
      isUnlimited: true,
      isOverLimit: false,
      calculation: 'active_students',
    });

    await createAndEnrollStudent('Null Limit One', '2026-09-07');
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

    const school = await prisma.school.create({
      data: {
        organizationId,
        name: `${TEST_PREFIX} School`,
        slug: `${TEST_PREFIX}-school`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    schoolId = school.id;
    createdSchoolIds.push(school.id);

    await createUser({
      email: `${TEST_PREFIX}-platform@moazez.local`,
      password: PLATFORM_PASSWORD,
      userType: UserType.PLATFORM_USER,
    });

    const schoolAdminRoleId = await createRoleWithPermissions({
      key: `${TEST_PREFIX}-school-admin-role`,
      permissionCodes: SCHOOL_PERMISSIONS.map((item) => item.code),
    });
    schoolAdminEmail = `${TEST_PREFIX}-school-admin@moazez.local`;
    const schoolAdminUserId = await createUser({
      email: schoolAdminEmail,
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
    gradeId = placement.gradeId;
    classroomId = placement.classroomId;
  }

  async function createAcademicPlacement(): Promise<{
    academicYearId: string;
    gradeId: string;
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

    return {
      academicYearId: academicYear.id,
      gradeId: grade.id,
      classroomId: classroom.id,
    };
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
    key: string;
    permissionCodes: string[];
  }): Promise<string> {
    const role = await prisma.role.create({
      data: {
        schoolId,
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

  async function upsertEntitlement(params: {
    status: 'active' | 'trial' | 'suspended' | 'expired' | 'archived';
    startsAt?: string | null;
    endsAt?: string | null;
    studentSeatLimit: number | null;
  }): Promise<void> {
    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/platform-admin/schools/${schoolId}/entitlement`)
      .set('Authorization', `Bearer ${platformAccessToken}`)
      .send(params)
      .expect(200);
  }

  async function readEntitlement(): Promise<EntitlementReadResponse> {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/platform-admin/schools/${schoolId}/entitlement`)
      .set('Authorization', `Bearer ${platformAccessToken}`)
      .expect(200);

    return response.body;
  }

  async function createStudent(label: string): Promise<CreatedStudent> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/students`)
      .set('Authorization', `Bearer ${schoolAdminAccessToken}`)
      .send({
        full_name_en: `${TEST_PREFIX} ${label}`,
        dateOfBirth: '2015-05-10',
      })
      .expect(201);

    createdStudentIds.push(response.body.id);
    return { id: response.body.id };
  }

  async function createAndEnrollStudent(
    label: string,
    enrollmentDate = '2026-09-01',
  ): Promise<CreatedStudent> {
    const student = await createStudent(label);
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/enrollments`)
      .set('Authorization', `Bearer ${schoolAdminAccessToken}`)
      .send(enrollmentPayload(student.id, enrollmentDate))
      .expect(201);

    createdEnrollmentIds.push(response.body.enrollmentId);
    return { id: student.id, enrollmentId: response.body.enrollmentId };
  }

  function enrollmentPayload(
    studentId: string,
    enrollmentDate: string,
  ): Record<string, string> {
    return {
      studentId,
      academicYearId,
      classroomId,
      enrollmentDate,
    };
  }

  async function createLead(label: string): Promise<{ id: string }> {
    leadPhoneSequence += 1;
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/admissions/leads`)
      .set('Authorization', `Bearer ${schoolAdminAccessToken}`)
      .send({
        studentName: `${TEST_PREFIX} ${label}`,
        primaryContactName: `${TEST_PREFIX} ${label} Parent`,
        phone: `+2010${String(leadPhoneSequence).padStart(8, '0')}`,
        email: `${TEST_PREFIX}-${label.toLowerCase().replace(/\s+/g, '-')}@example.test`,
        channel: 'Referral',
        notes: 'Seat limit should not block admissions intake',
      })
      .expect(201);

    createdLeadIds.push(response.body.id);
    return { id: response.body.id };
  }

  async function createApplication(params: {
    leadId: string;
    label: string;
  }): Promise<{ id: string }> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/admissions/applications`)
      .set('Authorization', `Bearer ${schoolAdminAccessToken}`)
      .send({
        leadId: params.leadId,
        studentName: `${TEST_PREFIX} ${params.label}`,
        requestedAcademicYearId: academicYearId,
        requestedGradeId: gradeId,
        source: 'referral',
      })
      .expect(201);

    createdApplicationIds.push(response.body.id);
    return { id: response.body.id };
  }

  async function createAcceptedApplication(
    label: string,
  ): Promise<{ applicationId: string }> {
    const lead = await createLead(label);
    const application = await createApplication({
      leadId: lead.id,
      label,
    });

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/admissions/applications/${application.id}/submit`)
      .set('Authorization', `Bearer ${schoolAdminAccessToken}`)
      .expect(200);

    const placementTest = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/admissions/tests`)
      .set('Authorization', `Bearer ${schoolAdminAccessToken}`)
      .send({
        applicationId: application.id,
        type: 'Placement',
        scheduledAt: '2026-04-26T10:00:00.000Z',
      })
      .expect(201);
    createdPlacementTestIds.push(placementTest.body.id);

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/admissions/tests/${placementTest.body.id}`)
      .set('Authorization', `Bearer ${schoolAdminAccessToken}`)
      .send({
        status: 'completed',
        score: 85,
        result: 'Ready for handoff',
      })
      .expect(200);

    const interview = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/admissions/interviews`)
      .set('Authorization', `Bearer ${schoolAdminAccessToken}`)
      .send({
        applicationId: application.id,
        scheduledAt: '2026-04-27T11:00:00.000Z',
        notes: 'Family interview',
      })
      .expect(201);
    createdInterviewIds.push(interview.body.id);

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/admissions/interviews/${interview.body.id}`)
      .set('Authorization', `Bearer ${schoolAdminAccessToken}`)
      .send({
        status: 'completed',
        notes: 'Family interview completed',
      })
      .expect(200);

    const decision = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/admissions/decisions`)
      .set('Authorization', `Bearer ${schoolAdminAccessToken}`)
      .send({
        applicationId: application.id,
        decision: 'accept',
        reason: 'Accepted for seat limit enforcement handoff',
      })
      .expect(201);
    createdDecisionIds.push(decision.body.id);

    return { applicationId: application.id };
  }

  async function countActiveStudentSeats(): Promise<number> {
    const seats = await prisma.enrollment.findMany({
      where: {
        schoolId,
        status: StudentEnrollmentStatus.ACTIVE,
        deletedAt: null,
        student: {
          status: StudentStatus.ACTIVE,
          deletedAt: null,
        },
      },
      distinct: ['studentId'],
      select: { studentId: true },
    });

    return seats.length;
  }

  async function activeEnrollmentIds(): Promise<string[]> {
    const rows = await prisma.enrollment.findMany({
      where: {
        schoolId,
        status: StudentEnrollmentStatus.ACTIVE,
        deletedAt: null,
        student: {
          status: StudentStatus.ACTIVE,
          deletedAt: null,
        },
      },
      orderBy: { id: 'asc' },
      select: { id: true },
    });

    return rows.map((row) => row.id);
  }

  async function enrollmentHandoffSideEffectSnapshot(
    studentId: string,
  ): Promise<{
    enrollmentCount: number;
    activeStudentEnrollmentCount: number;
    guardianCount: number;
    userCount: number;
  }> {
    const [
      enrollmentCount,
      activeStudentEnrollmentCount,
      guardianCount,
      userCount,
    ] = await Promise.all([
      prisma.enrollment.count({ where: { schoolId } }),
      prisma.enrollment.count({
        where: {
          schoolId,
          studentId,
          status: StudentEnrollmentStatus.ACTIVE,
          deletedAt: null,
        },
      }),
      prisma.guardian.count({ where: { schoolId } }),
      prisma.user.count(),
    ]);

    return {
      enrollmentCount,
      activeStudentEnrollmentCount,
      guardianCount,
      userCount,
    };
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
