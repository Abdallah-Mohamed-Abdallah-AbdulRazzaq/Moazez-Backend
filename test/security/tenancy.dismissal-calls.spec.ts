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
const PASSWORD = 'DismissalCallsSecurity123!';
const TEST_RUN_ID = randomUUID().slice(0, 8);
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(90_000);

describe('DISMISSAL-CALLS-1A route metadata and permission boundaries', () => {
  it('declares exact RequiredPermissions metadata for active queue routes', () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_METADATA,
        DismissalRequestsController.prototype.listActiveRequests,
      ),
    ).toEqual(['dismissal.requests.view']);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_METADATA,
        DismissalRequestsController.prototype.getRequestDetail,
      ),
    ).toEqual(['dismissal.requests.view']);
  });

  it('declares the required JwtAuth, ScopeResolver, Permissions guard chain', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, DismissalRequestsController)).toEqual([
      JwtAuthGuard,
      ScopeResolverGuard,
      PermissionsGuard,
    ]);
  });

  it('uses existing dismissal.requests.view permission without role leakage', () => {
    const rolesSeed = readFileSync(
      `${process.cwd()}/prisma/seeds/02-system-roles.seed.ts`,
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

    expect(dismissalStaffPermissions).toContain('dismissal.requests.view');
    expect(parentPermissions).not.toContain('dismissal.requests.view');
    expect(teacherPermissions).not.toContain('dismissal.requests.view');
    expect(studentPermissions).not.toContain('dismissal.requests.view');
    expect(parentPermissions).toContain('parent.smart_pickup.view');
    expect(parentPermissions).toContain('parent.smart_pickup.request');
    expect(parentPermissions).not.toContain('parent.smart_pickup.cancel');
  });

  it('does not add forbidden dismissal device-token or waiting-student surfaces', () => {
    const schemaSource = readFileSync('prisma/schema.prisma', 'utf8');

    const tokenSurfaceBlock = schemaSource.match(
      /enum AppDeviceTokenSurface \{([\s\S]*?)\n\}/,
    )?.[1];
    expect(tokenSurfaceBlock).toBeTruthy();
    expect(tokenSurfaceBlock).not.toContain('DISMISSAL_STAFF');
    expect(schemaSource).not.toMatch(/model\s+DismissalShift\b/);
    expect(schemaSource).not.toMatch(/model\s+DismissalWaitingStudent\b/);
  });
});

describe('DISMISSAL-CALLS-1A tenancy and RBAC (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let organizationId: string;
  let schoolId: string;
  let adminToken: string;
  let noPermissionToken: string;
  let staffToken: string;
  let parentUserId: string;
  let guardianId: string;
  let gateId: string;
  let otherGateId: string;
  let visibleRequestId: string;
  let hiddenRequestId: string;
  const createdUserIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdOrganizationIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [schoolAdminRole, dismissalStaffRole, parentRole] = await Promise.all([
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
    ]);
    if (!schoolAdminRole || !dismissalStaffRole || !parentRole) {
      throw new Error('Required system roles not found - run `npm run seed`.');
    }

    const fixture = await createSchoolFixture();
    organizationId = fixture.organizationId;
    schoolId = fixture.schoolId;
    const academic = await createAcademicFixture(schoolId);
    gateId = await createGate('VISIBLE', DismissalGateOperationalStatus.OPEN);
    otherGateId = await createGate('HIDDEN', DismissalGateOperationalStatus.OPEN);

    const noPermissionRole = await prisma.role.create({
      data: {
        schoolId,
        key: `dismissal-calls-no-perm-${TEST_RUN_ID}`,
        name: 'Dismissal Calls No Permission',
        description: 'No dismissal request permissions',
        isSystem: false,
      },
      select: { id: true },
    });

    const admin = await createUserWithMembership({
      email: `dismissal-calls-sec-${TEST_RUN_ID}-admin@moazez.local`,
      roleId: schoolAdminRole.id,
      userType: UserType.SCHOOL_USER,
      firstName: 'School',
      lastName: 'Admin',
    });
    const noPermission = await createUserWithMembership({
      email: `dismissal-calls-sec-${TEST_RUN_ID}-noperm@moazez.local`,
      roleId: noPermissionRole.id,
      userType: UserType.SCHOOL_USER,
      firstName: 'No',
      lastName: 'Permission',
    });
    const staff = await createUserWithMembership({
      email: `dismissal-calls-sec-${TEST_RUN_ID}-staff@moazez.local`,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
      firstName: 'Assigned',
      lastName: 'Staff',
    });
    const parent = await createUserWithMembership({
      email: `dismissal-calls-sec-${TEST_RUN_ID}-parent@moazez.local`,
      roleId: parentRole.id,
      userType: UserType.PARENT,
      firstName: 'Parent',
      lastName: 'Caller',
    });
    parentUserId = parent.userId;

    guardianId = await createGuardian();
    await prisma.dismissalStaffAssignment.create({
      data: {
        schoolId,
        staffUserId: staff.userId,
        gateId,
        isActive: true,
      },
    });

    visibleRequestId = await createRequest({
      classroomId: academic.classroomId,
      gateId,
      firstName: 'Visible',
      lastName: 'Queue',
    });
    hiddenRequestId = await createRequest({
      classroomId: academic.classroomId,
      gateId: otherGateId,
      firstName: 'Hidden',
      lastName: 'Queue',
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
  });

  afterAll(async () => {
    if (prisma) {
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
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      await prisma.role.deleteMany({
        where: {
          schoolId,
          key: { startsWith: `dismissal-calls-no-perm-${TEST_RUN_ID}` },
        },
      });
      await prisma.school.deleteMany({ where: { id: { in: createdSchoolIds } } });
      await prisma.organization.deleteMany({
        where: { id: { in: createdOrganizationIds } },
      });
      await prisma.$disconnect();
    }
    if (app) await app.close();
  });

  it('rejects unauthenticated active queue requests', async () => {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/active`)
      .expect(401);
  });

  it('forbids authenticated users without dismissal.requests.view', async () => {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/active`)
      .set('Authorization', `Bearer ${noPermissionToken}`)
      .expect(403);
  });

  it('allows school admin to access the current-school active queue', async () => {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/active`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body.data.map((item: { id: string }) => item.id)).toEqual(
      expect.arrayContaining([visibleRequestId, hiddenRequestId]),
    );
  });

  it('scopes DISMISSAL_STAFF queue and details by assignment', async () => {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/active`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);

    expect(response.body.data.map((item: { id: string }) => item.id)).toEqual([
      visibleRequestId,
    ]);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/${visibleRequestId}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/${hiddenRequestId}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(404);
  });

  it('does not expose deferred mutation, waiting-student, parent history, or root pickup routes', async () => {
    const id = randomUUID();
    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/requests/${id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/requests/${id}/call`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/requests/${id}/ready`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/requests/${id}/deliver`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/waiting-students`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/smart-pickup/recent-calls`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/smart-pickup/requests/${id}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
    await request(app.getHttpServer()).get(`${GLOBAL_PREFIX}/pickup`).expect(404);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/waiting-students`)
      .expect(404);
  });

  async function createSchoolFixture(): Promise<{
    organizationId: string;
    schoolId: string;
  }> {
    const organization = await prisma.organization.create({
      data: {
        slug: `dismissal-calls-sec-${TEST_RUN_ID}-org`,
        name: `Dismissal Calls Security Org ${TEST_RUN_ID}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);

    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `dismissal-calls-sec-${TEST_RUN_ID}-school`,
        name: `Dismissal Calls Security School ${TEST_RUN_ID}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdSchoolIds.push(school.id);

    return { organizationId: organization.id, schoolId: school.id };
  }

  async function createAcademicFixture(currentSchoolId: string) {
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId: currentSchoolId,
        nameAr: `calls-sec-year-${TEST_RUN_ID}-ar`,
        nameEn: `Calls Sec Year ${TEST_RUN_ID}`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-06-30T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    const term = await prisma.term.create({
      data: {
        schoolId: currentSchoolId,
        academicYearId: academicYear.id,
        nameAr: `calls-sec-term-${TEST_RUN_ID}-ar`,
        nameEn: `Calls Sec Term ${TEST_RUN_ID}`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-01-15T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    const stage = await prisma.stage.create({
      data: {
        schoolId: currentSchoolId,
        nameAr: `calls-sec-stage-${TEST_RUN_ID}-ar`,
        nameEn: 'Calls Security Stage',
      },
      select: { id: true },
    });
    const grade = await prisma.grade.create({
      data: {
        schoolId: currentSchoolId,
        stageId: stage.id,
        nameAr: `calls-sec-grade-${TEST_RUN_ID}-ar`,
        nameEn: 'Calls Security Grade',
      },
      select: { id: true },
    });
    const section = await prisma.section.create({
      data: {
        schoolId: currentSchoolId,
        gradeId: grade.id,
        nameAr: `calls-sec-section-${TEST_RUN_ID}-ar`,
        nameEn: 'Calls Security Section',
      },
      select: { id: true },
    });
    const classroom = await prisma.classroom.create({
      data: {
        schoolId: currentSchoolId,
        sectionId: section.id,
        nameAr: `calls-sec-classroom-${TEST_RUN_ID}-ar`,
        nameEn: 'Calls Security Classroom',
      },
      select: { id: true },
    });

    return {
      academicYearId: academicYear.id,
      termId: term.id,
      classroomId: classroom.id,
    };
  }

  async function createGate(
    code: string,
    status: DismissalGateOperationalStatus,
  ): Promise<string> {
    const gate = await prisma.dismissalGate.create({
      data: {
        schoolId,
        code: `${code}-${TEST_RUN_ID}`,
        name: `${code} Gate`,
        status,
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
        firstName: 'Calls Security',
        lastName: `Guardian ${TEST_RUN_ID}`,
        relation: 'guardian',
        phone: '0100000000',
        canPickup: true,
        canReceiveNotifications: true,
      },
      select: { id: true },
    });
    return guardian.id;
  }

  async function createRequest(params: {
    classroomId: string;
    gateId: string;
    firstName: string;
    lastName: string;
  }): Promise<string> {
    const year = await prisma.academicYear.findFirstOrThrow({
      where: { schoolId },
      select: { id: true },
    });
    const term = await prisma.term.findFirstOrThrow({
      where: { schoolId },
      select: { id: true },
    });
    const student = await prisma.student.create({
      data: {
        schoolId,
        organizationId,
        firstName: params.firstName,
        lastName: params.lastName,
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
        termId: term.id,
        classroomId: params.classroomId,
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
        gateId: params.gateId,
        status: DismissalRequestStatus.REQUESTED,
        clientRequestId: `calls-sec-${TEST_RUN_ID}-${student.id}`,
        parentLatitude: 30.04442,
        parentLongitude: 31.235712,
        distanceMeters: 10,
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

function extractConstStringArray(source: string, constName: string): string[] {
  const match = source.match(
    new RegExp(`const ${constName} = \\[([\\s\\S]*?)\\];`),
  );
  expect(match).not.toBeNull();

  return [...match![1].matchAll(/'([^']+)'/g)].map((item) => item[1]);
}
