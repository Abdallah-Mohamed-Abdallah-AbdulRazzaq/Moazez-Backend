import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import {
  DismissalGateOperationalStatus,
  DismissalRequestEventType,
  DismissalRequestStatus,
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
import 'reflect-metadata';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { REQUIRED_PERMISSIONS_METADATA } from '../../src/common/decorators/required-permissions.decorator';
import { JwtAuthGuard } from '../../src/common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../src/common/guards/permissions.guard';
import { ScopeResolverGuard } from '../../src/common/guards/scope-resolver.guard';
import { DismissalRequestsController } from '../../src/modules/dismissal/requests/controller/dismissal-requests.controller';

const GLOBAL_PREFIX = '/api/v1';
const PASSWORD = 'DismissalHistorySecurity123!';
const TEST_RUN_ID = randomUUID().slice(0, 8);
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(120_000);

describe('DISMISSAL-HISTORY-1A route metadata and boundaries', () => {
  it('declares exact RequiredPermissions metadata for history and escalation routes', () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_METADATA,
        DismissalRequestsController.prototype.listRequestHistory,
      ),
    ).toEqual(['dismissal.requests.history.view']);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_METADATA,
        DismissalRequestsController.prototype.getRequestHistoryDetail,
      ),
    ).toEqual(['dismissal.requests.history.view']);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_METADATA,
        DismissalRequestsController.prototype.escalateRequest,
      ),
    ).toEqual(['dismissal.requests.escalate']);
  });

  it('declares the required JwtAuth, ScopeResolver, Permissions guard chain', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, DismissalRequestsController)).toEqual([
      JwtAuthGuard,
      ScopeResolverGuard,
      PermissionsGuard,
    ]);
  });

  it('uses existing dismissal history/escalation permissions without role leakage or seed expansion', () => {
    const rolesSeed = readFileSync(
      `${process.cwd()}/prisma/seeds/02-system-roles.seed.ts`,
      'utf8',
    );
    const permissionsSeed = readFileSync(
      `${process.cwd()}/prisma/seeds/01-permissions.seed.ts`,
      'utf8',
    );
    const dismissalStaffPermissions = extractConstStringArray(
      rolesSeed,
      'DISMISSAL_STAFF_PERMISSIONS',
    );
    const parentPermissions = extractConstStringArray(
      rolesSeed,
      'PARENT_PERMISSIONS',
    );
    const teacherPermissions = extractConstStringArray(
      rolesSeed,
      'TEACHER_PERMISSIONS',
    );
    const studentPermissions = extractConstStringArray(
      rolesSeed,
      'STUDENT_PERMISSIONS',
    );
    const dismissalPermissionCodes = [
      ...permissionsSeed.matchAll(/code: '(dismissal\.[^']+)'/g),
    ].map((match) => match[1]);

    expect(dismissalPermissionCodes).toHaveLength(14);
    expect(permissionsSeed).toContain("code: 'dismissal.requests.history.view'");
    expect(permissionsSeed).toContain("code: 'dismissal.requests.escalate'");
    expect(dismissalStaffPermissions).toEqual(
      expect.arrayContaining([
        'dismissal.requests.history.view',
        'dismissal.requests.escalate',
      ]),
    );
    expect(parentPermissions).not.toContain('dismissal.requests.history.view');
    expect(parentPermissions).not.toContain('dismissal.requests.escalate');
    expect(teacherPermissions).not.toContain('dismissal.requests.history.view');
    expect(teacherPermissions).not.toContain('dismissal.requests.escalate');
    expect(studentPermissions).not.toContain('dismissal.requests.history.view');
    expect(studentPermissions).not.toContain('dismissal.requests.escalate');
    expect(dismissalStaffPermissions).not.toContain('parent.smart_pickup.view');
    expect(dismissalStaffPermissions).not.toContain('parent.smart_pickup.request');
    expect(dismissalStaffPermissions).not.toContain('parent.smart_pickup.cancel');
  });

  it('adds only REQUEST_ESCALATED event enum and no forbidden status/device/realtime surfaces', () => {
    const schemaSource = readFileSync('prisma/schema.prisma', 'utf8');
    const migrationSource = readFileSync(
      'prisma/migrations/20260710135222_baseline_v1/migration.sql',
      'utf8',
    );
    const statusBlock = schemaSource.match(
      /enum DismissalRequestStatus \{([\s\S]*?)\n\}/,
    )?.[1];
    const tokenSurfaceBlock = schemaSource.match(
      /enum AppDeviceTokenSurface \{([\s\S]*?)\n\}/,
    )?.[1];
    const realtimeNames = readFileSync(
      'src/infrastructure/realtime/realtime-event-names.ts',
      'utf8',
    );

    expect(schemaSource).toContain('REQUEST_ESCALATED');
    expect(migrationSource).toContain(
      `CREATE TYPE "dismissal_request_event_type" AS ENUM ('REQUEST_CREATED', 'REQUEST_STATUS_CHANGED', 'REQUEST_ESCALATED')`,
    );
    expect(statusBlock).toBeTruthy();
    for (const forbiddenStatus of ['DELAYED', 'URGENT', 'ESCALATED', 'RESOLVED']) {
      expect(statusBlock).not.toContain(forbiddenStatus);
    }
    expect(tokenSurfaceBlock).toBeTruthy();
    expect(tokenSurfaceBlock).toContain('DISMISSAL_STAFF');
    expect(realtimeNames).not.toContain('ESCALATED');
    expect(realtimeNames).not.toContain('escalated');
  });
});

describe('DISMISSAL-HISTORY-1A tenancy and RBAC (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let organizationId: string;
  let schoolId: string;
  let classroomId: string;
  let gateId: string;
  let requestId: string;
  let adminToken: string;
  let noPermissionToken: string;
  let staffToken: string;
  let parentToken: string;
  let teacherToken: string;
  let studentToken: string;
  let parentUserId: string;
  let guardianId: string;
  const createdUserIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdOrganizationIds: string[] = [];
  const createdRoleIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [schoolAdminRole, dismissalStaffRole, parentRole, teacherRole, studentRole] =
      await Promise.all([
        prisma.role.findFirst({
          where: { key: 'school_admin', schoolId: null, isSystem: true },
          select: { id: true },
        }),
        prisma.role.findFirst({
          where: { key: 'dismissal_staff', schoolId: null, isSystem: true },
          select: { id: true },
        }),
        prisma.role.findFirst({
          where: { key: 'parent', schoolId: null, isSystem: true },
          select: { id: true },
        }),
        prisma.role.findFirst({
          where: { key: 'teacher', schoolId: null, isSystem: true },
          select: { id: true },
        }),
        prisma.role.findFirst({
          where: { key: 'student', schoolId: null, isSystem: true },
          select: { id: true },
        }),
      ]);
    if (
      !schoolAdminRole ||
      !dismissalStaffRole ||
      !parentRole ||
      !teacherRole ||
      !studentRole
    ) {
      throw new Error('Required system roles not found - run `npm run seed`.');
    }

    const fixture = await createSchoolFixture();
    organizationId = fixture.organizationId;
    schoolId = fixture.schoolId;
    const academic = await createAcademicFixture(schoolId);
    classroomId = academic.classroomId;
    gateId = await createGate();

    const noPermissionRole = await prisma.role.create({
      data: {
        schoolId,
        key: `dismissal-history-no-perm-${TEST_RUN_ID}`,
        name: 'Dismissal History No Permission',
        description: 'No dismissal history or escalation permissions',
        isSystem: false,
      },
      select: { id: true },
    });
    createdRoleIds.push(noPermissionRole.id);

    const admin = await createUserWithMembership({
      email: `dismissal-history-sec-${TEST_RUN_ID}-admin@moazez.local`,
      roleId: schoolAdminRole.id,
      userType: UserType.SCHOOL_USER,
      firstName: 'History',
      lastName: 'Admin',
    });
    const noPermission = await createUserWithMembership({
      email: `dismissal-history-sec-${TEST_RUN_ID}-noperm@moazez.local`,
      roleId: noPermissionRole.id,
      userType: UserType.SCHOOL_USER,
      firstName: 'No',
      lastName: 'Permission',
    });
    const staff = await createUserWithMembership({
      email: `dismissal-history-sec-${TEST_RUN_ID}-staff@moazez.local`,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
      firstName: 'Assigned',
      lastName: 'History',
    });
    const parent = await createUserWithMembership({
      email: `dismissal-history-sec-${TEST_RUN_ID}-parent@moazez.local`,
      roleId: parentRole.id,
      userType: UserType.PARENT,
      firstName: 'Parent',
      lastName: 'History',
    });
    const teacher = await createUserWithMembership({
      email: `dismissal-history-sec-${TEST_RUN_ID}-teacher@moazez.local`,
      roleId: teacherRole.id,
      userType: UserType.TEACHER,
      firstName: 'Teacher',
      lastName: 'History',
    });
    const studentUser = await createUserWithMembership({
      email: `dismissal-history-sec-${TEST_RUN_ID}-student@moazez.local`,
      roleId: studentRole.id,
      userType: UserType.STUDENT,
      firstName: 'Student',
      lastName: 'History',
    });
    parentUserId = parent.userId;
    guardianId = await createGuardian();
    requestId = await createRequest();

    await prisma.dismissalStaffAssignment.create({
      data: {
        schoolId,
        staffUserId: staff.userId,
        gateId,
        isActive: true,
      },
    });

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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

    adminToken = await login(admin.email);
    noPermissionToken = await login(noPermission.email);
    staffToken = await login(staff.email);
    parentToken = await login(parent.email);
    teacherToken = await login(teacher.email);
    studentToken = await login(studentUser.email);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.communicationNotificationPushAttempt.deleteMany({
        where: { schoolId },
      });
      await prisma.communicationNotificationDelivery.deleteMany({
        where: { schoolId },
      });
      await prisma.communicationNotification.deleteMany({ where: { schoolId } });
      await prisma.auditLog.deleteMany({ where: { schoolId } });
      await prisma.dismissalRequestEvent.deleteMany({ where: { schoolId } });
      await prisma.dismissalRequest.deleteMany({ where: { schoolId } });
      await prisma.dismissalStaffAssignment.deleteMany({ where: { schoolId } });
      await prisma.dismissalGate.deleteMany({ where: { schoolId } });
      await prisma.studentGuardian.deleteMany({ where: { schoolId } });
      await prisma.enrollment.deleteMany({ where: { schoolId } });
      await prisma.student.deleteMany({ where: { schoolId } });
      await prisma.guardian.deleteMany({ where: { schoolId } });
      await prisma.classroom.deleteMany({ where: { schoolId } });
      await prisma.section.deleteMany({ where: { schoolId } });
      await prisma.grade.deleteMany({ where: { schoolId } });
      await prisma.stage.deleteMany({ where: { schoolId } });
      await prisma.term.deleteMany({ where: { schoolId } });
      await prisma.academicYear.deleteMany({ where: { schoolId } });
      await prisma.membership.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      await prisma.school.deleteMany({ where: { id: { in: createdSchoolIds } } });
      await prisma.organization.deleteMany({
        where: { id: { in: createdOrganizationIds } },
      });
      await prisma.$disconnect();
    }
    if (app) await app.close();
  });

  it('rejects unauthenticated and unauthorized history/escalation calls', async () => {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/history`)
      .expect(401);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/requests/${requestId}/escalate`)
      .send({ reason: 'other' })
      .expect(401);

    await listHistory(noPermissionToken).expect(403);
    await getHistoryDetail(noPermissionToken, requestId).expect(403);
    await escalate(noPermissionToken, requestId).expect(403);

    for (const token of [parentToken, teacherToken, studentToken]) {
      await listHistory(token).expect(403);
      await getHistoryDetail(token, requestId).expect(403);
      await escalate(token, requestId).expect(403);
    }
  });

  it('allows school admin and assignment-scoped dismissal staff only', async () => {
    const adminList = await listHistory(adminToken).expect(200);
    expect(adminList.body.data.map((item: { id: string }) => item.id)).toContain(
      requestId,
    );

    const staffList = await listHistory(staffToken).expect(200);
    expect(staffList.body.data.map((item: { id: string }) => item.id)).toContain(
      requestId,
    );

    await getHistoryDetail(staffToken, requestId).expect(200);
    const escalation = await escalate(staffToken, requestId).expect(201);
    expect(escalation.body.escalation.changed).toBe(true);
  });

  it('keeps route ordering and forbidden root/deferred routes intact', async () => {
    await listHistory(adminToken).expect(200);
    await getHistoryDetail(adminToken, requestId).expect(200);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/history`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/requests/history`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/pickup`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/waiting-students`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/notifications`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/requests/${requestId}/resend-code`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/delegates/invitations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  function listHistory(token: string) {
    return request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/history`)
      .set('Authorization', `Bearer ${token}`);
  }

  function getHistoryDetail(token: string, id: string) {
    return request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/history/${id}`)
      .set('Authorization', `Bearer ${token}`);
  }

  function escalate(token: string, id: string) {
    return request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/requests/${id}/escalate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'other' });
  }

  async function createSchoolFixture(): Promise<{
    organizationId: string;
    schoolId: string;
  }> {
    const organization = await prisma.organization.create({
      data: {
        slug: `dismissal-history-sec-${TEST_RUN_ID}-org`,
        name: `Dismissal History Security Org ${TEST_RUN_ID}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);

    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `dismissal-history-sec-${TEST_RUN_ID}-school`,
        name: `Dismissal History Security School ${TEST_RUN_ID}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdSchoolIds.push(school.id);

    return { organizationId: organization.id, schoolId: school.id };
  }

  async function createAcademicFixture(targetSchoolId: string) {
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId: targetSchoolId,
        nameAr: `history-sec-year-${TEST_RUN_ID}-ar`,
        nameEn: `History Security Year ${TEST_RUN_ID}`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-06-30T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    const term = await prisma.term.create({
      data: {
        schoolId: targetSchoolId,
        academicYearId: academicYear.id,
        nameAr: `history-sec-term-${TEST_RUN_ID}-ar`,
        nameEn: `History Security Term ${TEST_RUN_ID}`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-01-15T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    const stage = await prisma.stage.create({
      data: {
        schoolId: targetSchoolId,
        nameAr: `history-sec-stage-${TEST_RUN_ID}-ar`,
        nameEn: `History Security Stage ${TEST_RUN_ID}`,
      },
      select: { id: true },
    });
    const grade = await prisma.grade.create({
      data: {
        schoolId: targetSchoolId,
        stageId: stage.id,
        nameAr: `history-sec-grade-${TEST_RUN_ID}-ar`,
        nameEn: `History Security Grade ${TEST_RUN_ID}`,
      },
      select: { id: true },
    });
    const section = await prisma.section.create({
      data: {
        schoolId: targetSchoolId,
        gradeId: grade.id,
        nameAr: `history-sec-section-${TEST_RUN_ID}-ar`,
        nameEn: `History Security Section ${TEST_RUN_ID}`,
      },
      select: { id: true },
    });
    const classroom = await prisma.classroom.create({
      data: {
        schoolId: targetSchoolId,
        sectionId: section.id,
        nameAr: `history-sec-classroom-${TEST_RUN_ID}-ar`,
        nameEn: `History Security Classroom ${TEST_RUN_ID}`,
      },
      select: { id: true },
    });

    return {
      academicYearId: academicYear.id,
      termId: term.id,
      classroomId: classroom.id,
    };
  }

  async function createGate(): Promise<string> {
    const gate = await prisma.dismissalGate.create({
      data: {
        schoolId,
        code: `HIST-SEC-${TEST_RUN_ID}`,
        name: 'History Security Gate',
        status: DismissalGateOperationalStatus.OPEN,
        isActive: true,
      },
      select: { id: true },
    });
    return gate.id;
  }

  async function createUserWithMembership(params: {
    email: string;
    roleId: string;
    userType: UserType;
    firstName: string;
    lastName: string;
  }): Promise<{ userId: string; email: string }> {
    const user = await prisma.user.create({
      data: {
        email: params.email,
        username: params.email,
        firstName: params.firstName,
        lastName: params.lastName,
        userType: params.userType,
        status: UserStatus.ACTIVE,
        passwordHash: await argon2.hash(PASSWORD, ARGON2_OPTIONS),
        memberships: {
          create: {
            schoolId,
            organizationId,
            roleId: params.roleId,
            status: MembershipStatus.ACTIVE,
            userType: params.userType,
          },
        },
      },
      select: { id: true, email: true },
    });
    createdUserIds.push(user.id);
    return { userId: user.id, email: user.email };
  }

  async function createGuardian(): Promise<string> {
    const guardian = await prisma.guardian.create({
      data: {
        schoolId,
        organizationId,
        userId: parentUserId,
        firstName: 'Security',
        lastName: 'Guardian',
        relation: 'guardian',
        phone: '0109333000',
        canPickup: true,
        canReceiveNotifications: true,
      },
      select: { id: true },
    });
    return guardian.id;
  }

  async function createRequest(): Promise<string> {
    const year = await prisma.academicYear.findFirstOrThrow({
      where: { schoolId },
      select: { id: true },
    });
    const term = await prisma.term.findFirst({
      where: { schoolId },
      select: { id: true },
    });
    const student = await prisma.student.create({
      data: {
        schoolId,
        organizationId,
        firstName: 'Security',
        lastName: 'Student',
        status: StudentStatus.ACTIVE,
      },
      select: { id: true },
    });
    await prisma.studentGuardian.create({
      data: {
        schoolId,
        studentId: student.id,
        guardianId,
        isPrimary: true,
      },
    });
    const enrollment = await prisma.enrollment.create({
      data: {
        schoolId,
        studentId: student.id,
        academicYearId: year.id,
        termId: term?.id,
        classroomId,
        status: StudentEnrollmentStatus.ACTIVE,
        enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
      },
      select: { id: true },
    });
    const dismissalRequest = await prisma.dismissalRequest.create({
      data: {
        schoolId,
        studentId: student.id,
        enrollmentId: enrollment.id,
        guardianId,
        requestedById: parentUserId,
        gateId,
        status: DismissalRequestStatus.REQUESTED,
        clientRequestId: `history-security-${TEST_RUN_ID}-${student.id}`,
        parentLatitude: 30.04442,
        parentLongitude: 31.235712,
        distanceMeters: 20,
        geofencePassed: true,
        requestedAt: new Date(Date.now() - 5 * 60_000),
      },
      select: { id: true },
    });
    await prisma.dismissalRequestEvent.create({
      data: {
        schoolId,
        requestId: dismissalRequest.id,
        type: DismissalRequestEventType.REQUEST_CREATED,
        actorUserId: parentUserId,
        statusTo: DismissalRequestStatus.REQUESTED,
      },
    });
    return dismissalRequest.id;
  }

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: PASSWORD })
      .expect(200);

    return response.body.accessToken as string;
  }
});

function extractConstStringArray(source: string, name: string): string[] {
  const pattern = new RegExp(`const ${name} = \\[([\\s\\S]*?)\\]`, 'm');
  const match = source.match(pattern);
  if (!match) throw new Error(`Could not find ${name}`);

  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
}
