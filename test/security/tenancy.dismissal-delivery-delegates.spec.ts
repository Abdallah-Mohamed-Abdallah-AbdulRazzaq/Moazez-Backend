import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
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
const PASSWORD = 'DismissalDelegateSecurity123!';
const TEST_RUN_ID = randomUUID().slice(0, 8);
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(90_000);

describe('DISMISSAL-DELIVERY-1B pickup-recipient route metadata and boundaries', () => {
  it('declares exact RequiredPermissions metadata', () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_METADATA,
        DismissalRequestsController.prototype.listPickupRecipients,
      ),
    ).toEqual(['dismissal.requests.deliver']);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_METADATA,
        DismissalRequestsController.prototype.deliverRequest,
      ),
    ).toEqual(['dismissal.requests.deliver']);
  });

  it('uses the required JwtAuth, ScopeResolver, Permissions guard chain', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, DismissalRequestsController)).toEqual([
      JwtAuthGuard,
      ScopeResolverGuard,
      PermissionsGuard,
    ]);
  });

  it('adds no permissions, seed changes, schema changes, migrations, or delegate account surfaces', () => {
    const permissionsSeed = readFileSync(
      'prisma/seeds/01-permissions.seed.ts',
      'utf8',
    );
    const rolesSeed = readFileSync('prisma/seeds/02-system-roles.seed.ts', 'utf8');
    const schemaSource = readFileSync('prisma/schema.prisma', 'utf8');
    const migrationNames = readdirSync('prisma/migrations');
    const parentPermissions = extractConstStringArray(rolesSeed, 'PARENT_PERMISSIONS');
    const teacherPermissions = extractConstStringArray(rolesSeed, 'TEACHER_PERMISSIONS');
    const studentPermissions = extractConstStringArray(rolesSeed, 'STUDENT_PERMISSIONS');
    const dismissalStaffPermissions = extractConstStringArray(
      rolesSeed,
      'DISMISSAL_STAFF_PERMISSIONS',
    );

    expect(permissionsSeed).toContain("code: 'dismissal.requests.deliver'");
    expect(permissionsSeed).not.toContain('dismissal.delivery');
    expect(dismissalStaffPermissions).toContain('dismissal.requests.deliver');
    expect(parentPermissions).not.toContain('dismissal.requests.deliver');
    expect(teacherPermissions).not.toContain('dismissal.requests.deliver');
    expect(studentPermissions).not.toContain('dismissal.requests.deliver');
    expect(schemaSource).not.toMatch(/model\s+DismissalPickupAuthorization\b/);
    expect(schemaSource).not.toMatch(/model\s+PickupDelegate\b/);
    expect(schemaSource).not.toContain('handoverReceiverGuardianId');
    expect(migrationNames).not.toContain(
      '20260705230000_dismissal_delivery_delegate_verification',
    );
    const tokenSurfaceBlock = schemaSource.match(
      /enum AppDeviceTokenSurface \{([\s\S]*?)\n\}/,
    )?.[1];
    expect(tokenSurfaceBlock).toBeTruthy();
    expect(tokenSurfaceBlock).not.toContain('DISMISSAL_STAFF');
  });
});

describe('DISMISSAL-DELIVERY-1B pickup-recipient tenancy and RBAC', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let organizationId: string;
  let schoolId: string;
  let classroomId: string;
  let gateId: string;
  let hiddenGateId: string;
  let parentUserId: string;
  let guardianId: string;
  let adminToken: string;
  let staffToken: string;
  let parentToken: string;
  let noPermissionToken: string;
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
    classroomId = (await createAcademicFixture()).classroomId;
    gateId = await createGate('VISIBLE');
    hiddenGateId = await createGate('HIDDEN');
    const noPermissionRole = await prisma.role.create({
      data: {
        schoolId,
        key: `dismissal-delegate-no-perm-${TEST_RUN_ID}`,
        name: 'Dismissal Delegate No Permission',
        isSystem: false,
      },
      select: { id: true },
    });

    const admin = await createUserWithMembership({
      email: `dismissal-delegate-sec-${TEST_RUN_ID}-admin@moazez.local`,
      roleId: schoolAdminRole.id,
      userType: UserType.SCHOOL_USER,
      firstName: 'Delegate',
      lastName: 'Admin',
    });
    const staff = await createUserWithMembership({
      email: `dismissal-delegate-sec-${TEST_RUN_ID}-staff@moazez.local`,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
      firstName: 'Delegate',
      lastName: 'Staff',
    });
    const parent = await createUserWithMembership({
      email: `dismissal-delegate-sec-${TEST_RUN_ID}-parent@moazez.local`,
      roleId: parentRole.id,
      userType: UserType.PARENT,
      firstName: 'Delegate',
      lastName: 'Parent',
    });
    const noPermission = await createUserWithMembership({
      email: `dismissal-delegate-sec-${TEST_RUN_ID}-noperm@moazez.local`,
      roleId: noPermissionRole.id,
      userType: UserType.SCHOOL_USER,
      firstName: 'No',
      lastName: 'Permission',
    });
    parentUserId = parent.userId;
    guardianId = await createGuardian(parentUserId);

    await prisma.dismissalSettings.create({
      data: {
        schoolId,
        enabled: true,
        requirePickupCode: false,
        allowDelegatePickup: false,
        defaultGateId: gateId,
      },
    });
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
    staffToken = await login(staff.email);
    parentToken = await login(parent.email);
    noPermissionToken = await login(noPermission.email);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.communicationNotificationPushAttempt.deleteMany({ where: { schoolId } });
      await prisma.communicationNotificationDelivery.deleteMany({ where: { schoolId } });
      await prisma.communicationNotification.deleteMany({ where: { schoolId } });
      await prisma.auditLog.deleteMany({ where: { schoolId } });
      await prisma.dismissalRequestEvent.deleteMany({ where: { schoolId } });
      await prisma.dismissalRequest.deleteMany({ where: { schoolId } });
      await prisma.dismissalStaffAssignment.deleteMany({ where: { schoolId } });
      await prisma.dismissalSettings.deleteMany({ where: { schoolId } });
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
      await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.membership.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      await prisma.role.deleteMany({
        where: {
          schoolId,
          key: { startsWith: `dismissal-delegate-no-perm-${TEST_RUN_ID}` },
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

  it('rejects unauthenticated and unauthorized recipient discovery', async () => {
    const requestId = await createRequest(gateId, 'Unauth');
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/${requestId}/pickup-recipients`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/${requestId}/pickup-recipients`)
      .set('Authorization', `Bearer ${noPermissionToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/${requestId}/pickup-recipients`)
      .set('Authorization', `Bearer ${parentToken}`)
      .expect(403);
  });

  it('allows school admin and assignment-visible dismissal staff to list recipients', async () => {
    const requestId = await createRequest(gateId, 'Visible');
    const adminResponse = await getPickupRecipients(adminToken, requestId).expect(200);
    expect(adminResponse.body.recipients[0].pickupRecipientToken).toEqual(
      expect.any(String),
    );
    expect(JSON.stringify(adminResponse.body)).not.toContain(guardianId);

    await getPickupRecipients(staffToken, requestId).expect(200);
    const hiddenRequestId = await createRequest(hiddenGateId, 'Hidden');
    const hidden = await getPickupRecipients(staffToken, hiddenRequestId).expect(404);
    expect(hidden.body?.error?.code).toBe('dismissal.delivery.not_found');
  });

  it('rejects tampered opaque recipient token at delivery', async () => {
    const requestId = await createRequest(gateId, 'Tamper');
    const token = (await getPickupRecipients(adminToken, requestId).expect(200)).body
      .recipients[0].pickupRecipientToken as string;
    expect(token).not.toContain(guardianId);
    expect(token).not.toContain(parentUserId);

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/requests/${requestId}/deliver`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ pickupRecipientToken: `${token.slice(0, -2)}xx` })
      .expect(422);
    expect(response.body?.error?.code).toBe(
      'dismissal.delivery.invalid_pickup_recipient',
    );
  });

  it('does not expose forbidden delegate-adjacent routes', async () => {
    const id = randomUUID();
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/pickup/delegates`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/requests/${id}/pickup-code/resend`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/requests/${id}/pickup-code/rotate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
    await request(app.getHttpServer()).get(`${GLOBAL_PREFIX}/pickup`).expect(404);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/waiting-students`)
      .expect(404);
  });

  function getPickupRecipients(token: string, requestId: string) {
    return request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/${requestId}/pickup-recipients`)
      .set('Authorization', `Bearer ${token}`);
  }

  async function createSchoolFixture() {
    const organization = await prisma.organization.create({
      data: {
        slug: `dismissal-delegate-sec-${TEST_RUN_ID}-org`,
        name: `Dismissal Delegate Security Org ${TEST_RUN_ID}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);
    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `dismissal-delegate-sec-${TEST_RUN_ID}-school`,
        name: `Dismissal Delegate Security School ${TEST_RUN_ID}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdSchoolIds.push(school.id);
    return { organizationId: organization.id, schoolId: school.id };
  }

  async function createAcademicFixture() {
    const year = await prisma.academicYear.create({
      data: {
        schoolId,
        nameAr: `delegate-sec-year-${TEST_RUN_ID}-ar`,
        nameEn: `Delegate Security Year ${TEST_RUN_ID}`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-06-30T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    const term = await prisma.term.create({
      data: {
        schoolId,
        academicYearId: year.id,
        nameAr: `delegate-sec-term-${TEST_RUN_ID}-ar`,
        nameEn: `Delegate Security Term ${TEST_RUN_ID}`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-01-15T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    const stage = await prisma.stage.create({
      data: {
        schoolId,
        nameAr: `delegate-sec-stage-${TEST_RUN_ID}-ar`,
        nameEn: `Delegate Security Stage ${TEST_RUN_ID}`,
      },
      select: { id: true },
    });
    const grade = await prisma.grade.create({
      data: {
        schoolId,
        stageId: stage.id,
        nameAr: `delegate-sec-grade-${TEST_RUN_ID}-ar`,
        nameEn: `Delegate Security Grade ${TEST_RUN_ID}`,
      },
      select: { id: true },
    });
    const section = await prisma.section.create({
      data: {
        schoolId,
        gradeId: grade.id,
        nameAr: `delegate-sec-section-${TEST_RUN_ID}-ar`,
        nameEn: `Delegate Security Section ${TEST_RUN_ID}`,
      },
      select: { id: true },
    });
    const classroom = await prisma.classroom.create({
      data: {
        schoolId,
        sectionId: section.id,
        nameAr: `delegate-sec-classroom-${TEST_RUN_ID}-ar`,
        nameEn: `Delegate Security Classroom ${TEST_RUN_ID}`,
      },
      select: { id: true },
    });
    return { classroomId: classroom.id, termId: term.id, yearId: year.id };
  }

  async function createGate(marker: string): Promise<string> {
    const gate = await prisma.dismissalGate.create({
      data: {
        schoolId,
        code: `DLG-SEC-${marker}-${TEST_RUN_ID}`,
        name: `Delegate Security Gate ${marker}`,
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

  async function createGuardian(userId: string): Promise<string> {
    const guardian = await prisma.guardian.create({
      data: {
        schoolId,
        organizationId,
        userId,
        firstName: 'Security',
        lastName: 'Guardian',
        relation: 'father',
        phone: '01090909090',
        canPickup: true,
        canReceiveNotifications: true,
      },
      select: { id: true },
    });
    return guardian.id;
  }

  async function createRequest(gateIdForRequest: string, firstName: string): Promise<string> {
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
        firstName,
        lastName: 'Delegate',
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
        gateId: gateIdForRequest,
        status: DismissalRequestStatus.READY,
        parentLatitude: 30.04442,
        parentLongitude: 31.235712,
        distanceMeters: 0,
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
