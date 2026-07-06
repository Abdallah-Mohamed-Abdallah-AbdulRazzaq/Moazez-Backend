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
import { issuePickupCode } from '../../src/modules/dismissal/shared/pickup-code.service';

const GLOBAL_PREFIX = '/api/v1';
const PASSWORD = 'DismissalDeliverySecurity123!';
const TEST_RUN_ID = randomUUID().slice(0, 8);
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(90_000);

describe('DISMISSAL-DELIVERY-1A route metadata and schema boundaries', () => {
  it('declares exact RequiredPermissions metadata for delivery routes', () => {
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

  it('declares the required JwtAuth, ScopeResolver, Permissions guard chain', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, DismissalRequestsController)).toEqual([
      JwtAuthGuard,
      ScopeResolverGuard,
      PermissionsGuard,
    ]);
  });

  it('uses existing dismissal.requests.deliver permission without role leakage', () => {
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

    expect(permissionsSeed).toContain("code: 'dismissal.requests.deliver'");
    expect(permissionsSeed).not.toContain('dismissal.delivery');
    expect(dismissalStaffPermissions).toContain('dismissal.requests.deliver');
    expect(parentPermissions).not.toContain('dismissal.requests.deliver');
    expect(teacherPermissions).not.toContain('dismissal.requests.deliver');
    expect(studentPermissions).not.toContain('dismissal.requests.deliver');
  });

  it('adds only expected delivery fields and migration without forbidden surfaces', () => {
    const schemaSource = readFileSync('prisma/schema.prisma', 'utf8');
    const migrationNames = readdirSync('prisma/migrations');
    const migrationSource = readFileSync(
      'prisma/migrations/20260705170000_dismissal_delivery_handover/migration.sql',
      'utf8',
    );

    for (const field of [
      'pickupCodeHash',
      'pickupCodeSalt',
      'pickupCodeIssuedAt',
      'pickupCodeVerifiedAt',
      'handedOverAt',
      'handedOverById',
      'handoverReceiverName',
      'handoverReceiverRelation',
      'handoverNote',
      'DismissalRequestHandedOverBy',
    ]) {
      expect(schemaSource).toContain(field);
    }
    expect(migrationNames).toContain('20260705170000_dismissal_delivery_handover');
    expect(migrationSource).toContain('pickup_code_hash');
    expect(migrationSource).toContain('handed_over_by_id');
    expect(migrationSource).not.toMatch(/CREATE TABLE|CREATE TYPE|ALTER TYPE/i);
    expect(schemaSource).not.toMatch(/model\s+DismissalDelivery\b/);
    expect(schemaSource).not.toMatch(/model\s+PickupCode\b/);

    const tokenSurfaceBlock = schemaSource.match(
      /enum AppDeviceTokenSurface \{([\s\S]*?)\n\}/,
    )?.[1];
    expect(tokenSurfaceBlock).toBeTruthy();
    expect(tokenSurfaceBlock).not.toContain('DISMISSAL_STAFF');
  });
});

describe('DISMISSAL-DELIVERY-1A tenancy and RBAC (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let organizationId: string;
  let schoolId: string;
  let classroomId: string;
  let gateId: string;
  let otherGateId: string;
  let parentUserId: string;
  let guardianId: string;
  let adminToken: string;
  let noPermissionToken: string;
  let staffToken: string;
  let parentToken: string;
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
    otherGateId = await createGate('HIDDEN');

    const noPermissionRole = await prisma.role.create({
      data: {
        schoolId,
        key: `dismissal-delivery-no-perm-${TEST_RUN_ID}`,
        name: 'Dismissal Delivery No Permission',
        description: 'No dismissal delivery permission',
        isSystem: false,
      },
      select: { id: true },
    });

    const admin = await createUserWithMembership({
      email: `dismissal-delivery-sec-${TEST_RUN_ID}-admin@moazez.local`,
      roleId: schoolAdminRole.id,
      userType: UserType.SCHOOL_USER,
      firstName: 'School',
      lastName: 'Admin',
    });
    const noPermission = await createUserWithMembership({
      email: `dismissal-delivery-sec-${TEST_RUN_ID}-noperm@moazez.local`,
      roleId: noPermissionRole.id,
      userType: UserType.SCHOOL_USER,
      firstName: 'No',
      lastName: 'Permission',
    });
    const staff = await createUserWithMembership({
      email: `dismissal-delivery-sec-${TEST_RUN_ID}-staff@moazez.local`,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
      firstName: 'Assigned',
      lastName: 'Staff',
    });
    const parent = await createUserWithMembership({
      email: `dismissal-delivery-sec-${TEST_RUN_ID}-parent@moazez.local`,
      roleId: parentRole.id,
      userType: UserType.PARENT,
      firstName: 'Parent',
      lastName: 'Caller',
    });
    parentUserId = parent.userId;

    guardianId = await createGuardian();
    await prisma.dismissalSettings.create({
      data: {
        schoolId,
        enabled: true,
        requirePickupCode: false,
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
    noPermissionToken = await login(noPermission.email);
    staffToken = await login(staff.email);
    parentToken = await login(parent.email);
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
      await prisma.membership.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      await prisma.role.deleteMany({
        where: {
          schoolId,
          key: { startsWith: `dismissal-delivery-no-perm-${TEST_RUN_ID}` },
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

  it('rejects unauthenticated and unauthorized delivery requests', async () => {
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/requests/${randomUUID()}/deliver`)
      .send({})
      .expect(401);

    const requestId = await createRequest({ gateId, firstName: 'NoPerm' });
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/requests/${requestId}/deliver`)
      .set('Authorization', `Bearer ${noPermissionToken}`)
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/requests/${requestId}/deliver`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({})
      .expect(403);
  });

  it('allows school admin to deliver current-school READY requests', async () => {
    const requestId = await createRequest({ gateId, firstName: 'Admin' });
    const pickupRecipientToken = await getPickupRecipientToken(
      adminToken,
      requestId,
    );
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/requests/${requestId}/deliver`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ pickupRecipientToken })
      .expect(201);

    expect(response.body.delivery).toEqual(
      expect.objectContaining({
        id: requestId,
        status: 'handed_over',
        pickupCodeVerified: false,
        pickupRecipientVerified: true,
      }),
    );
    expect(response.body.delivery.pickupCode).toBeUndefined();
    expect(response.body.delivery.pickupRecipientToken).toBeUndefined();
  });

  it('assignment-scopes DISMISSAL_STAFF delivery', async () => {
    const visibleRequestId = await createRequest({
      gateId,
      firstName: 'Visible',
    });
    const hiddenRequestId = await createRequest({
      gateId: otherGateId,
      firstName: 'Hidden',
    });

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/requests/${visibleRequestId}/deliver`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        pickupRecipientToken: await getPickupRecipientToken(
          staffToken,
          visibleRequestId,
        ),
      })
      .expect(201);

    const hidden = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/requests/${hiddenRequestId}/deliver`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({})
      .expect(404);
    expect(hidden.body?.error?.code).toBe('dismissal.delivery.not_found');
  });

  it('does not leak raw pickup code into staff/admin response, event, or audit payloads', async () => {
    await prisma.dismissalSettings.update({
      where: { schoolId },
      data: { requirePickupCode: true },
    });
    const issued = issuePickupCode();
    const requestId = await createRequest({
      gateId,
      firstName: 'Code',
      pickupCodeHash: issued.hash,
      pickupCodeSalt: issued.salt,
      pickupCodeIssuedAt: issued.issuedAt,
    });

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/requests/${requestId}/deliver`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        pickupCode: issued.code,
        pickupRecipientToken: await getPickupRecipientToken(
          adminToken,
          requestId,
        ),
        note: 'Safe handover',
      })
      .expect(201);
    expect(response.body.delivery.pickupCode).toBeUndefined();
    expect(response.body.delivery.pickupRecipientToken).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain(issued.code);

    const event = await prisma.dismissalRequestEvent.findFirstOrThrow({
      where: {
        requestId,
        type: DismissalRequestEventType.REQUEST_STATUS_CHANGED,
      },
      select: { note: true, metadata: true },
    });
    expect(JSON.stringify(event)).not.toContain(issued.code);
    expect(event.metadata).toEqual({
      pickupRecipientVerified: true,
      pickupRecipientSource: 'guardian_link',
    });

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        resourceId: requestId,
        action: 'dismissal.request.delivered',
      },
      select: { before: true, after: true },
    });
    expect(JSON.stringify(audit)).not.toContain(issued.code);

    await prisma.dismissalSettings.update({
      where: { schoolId },
      data: { requirePickupCode: false },
    });
  });

  it('does not expose forbidden deferred delivery-adjacent routes', async () => {
    const id = randomUUID();
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/requests/${id}/call`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/requests/${id}/ready`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/waiting-students/${id}/ready`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/waiting-students/${id}/deliver`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
    await request(app.getHttpServer()).get(`${GLOBAL_PREFIX}/pickup`).expect(404);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/waiting-students`)
      .expect(404);
  });

  async function createSchoolFixture() {
    const organization = await prisma.organization.create({
      data: {
        slug: `dismissal-delivery-sec-${TEST_RUN_ID}-org`,
        name: `Dismissal Delivery Security Org ${TEST_RUN_ID}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);

    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `dismissal-delivery-sec-${TEST_RUN_ID}-school`,
        name: `Dismissal Delivery Security School ${TEST_RUN_ID}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdSchoolIds.push(school.id);

    return { organizationId: organization.id, schoolId: school.id };
  }

  async function createAcademicFixture() {
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId,
        nameAr: `delivery-sec-year-${TEST_RUN_ID}-ar`,
        nameEn: `Delivery Sec Year ${TEST_RUN_ID}`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-06-30T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    const term = await prisma.term.create({
      data: {
        schoolId,
        academicYearId: academicYear.id,
        nameAr: `delivery-sec-term-${TEST_RUN_ID}-ar`,
        nameEn: `Delivery Sec Term ${TEST_RUN_ID}`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-01-15T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    const stage = await prisma.stage.create({
      data: {
        schoolId,
        nameAr: `delivery-sec-stage-${TEST_RUN_ID}-ar`,
        nameEn: 'Delivery Security Stage',
      },
      select: { id: true },
    });
    const grade = await prisma.grade.create({
      data: {
        schoolId,
        stageId: stage.id,
        nameAr: `delivery-sec-grade-${TEST_RUN_ID}-ar`,
        nameEn: 'Delivery Security Grade',
      },
      select: { id: true },
    });
    const section = await prisma.section.create({
      data: {
        schoolId,
        gradeId: grade.id,
        nameAr: `delivery-sec-section-${TEST_RUN_ID}-ar`,
        nameEn: 'Delivery Security Section',
      },
      select: { id: true },
    });
    const classroom = await prisma.classroom.create({
      data: {
        schoolId,
        sectionId: section.id,
        nameAr: `delivery-sec-classroom-${TEST_RUN_ID}-ar`,
        nameEn: 'Delivery Security Classroom',
      },
      select: { id: true },
    });

    return {
      academicYearId: academicYear.id,
      termId: term.id,
      classroomId: classroom.id,
    };
  }

  async function createGate(code: string): Promise<string> {
    const gate = await prisma.dismissalGate.create({
      data: {
        schoolId,
        code: `${code}-${TEST_RUN_ID}`,
        name: `${code} Gate`,
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
        firstName: 'Delivery Security',
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
    gateId: string;
    firstName: string;
    pickupCodeHash?: string | null;
    pickupCodeSalt?: string | null;
    pickupCodeIssuedAt?: Date | null;
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
        lastName: 'Delivery',
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
        gateId: params.gateId,
        status: DismissalRequestStatus.READY,
        clientRequestId: null,
        parentLatitude: 30.04442,
        parentLongitude: 31.235712,
        distanceMeters: 10,
        geofencePassed: true,
        requestedAt: new Date(Date.now() - 5 * 60_000),
        pickupCodeHash: params.pickupCodeHash ?? null,
        pickupCodeSalt: params.pickupCodeSalt ?? null,
        pickupCodeIssuedAt: params.pickupCodeIssuedAt ?? null,
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

  async function getPickupRecipientToken(
    token: string,
    requestId: string,
  ): Promise<string> {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/${requestId}/pickup-recipients`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(JSON.stringify(response.body)).not.toContain('guardianId');
    expect(JSON.stringify(response.body)).not.toContain('studentGuardianId');
    expect(JSON.stringify(response.body)).not.toContain('0100000000');
    expect(response.body.recipients[0]?.pickupRecipientToken).toEqual(
      expect.any(String),
    );

    return response.body.recipients[0].pickupRecipientToken as string;
  }
});

function extractConstStringArray(source: string, constName: string): string[] {
  const match = source.match(
    new RegExp(`const ${constName} = \\[([\\s\\S]*?)\\];`),
  );
  expect(match).not.toBeNull();

  return [...match![1].matchAll(/'([^']+)'/g)].map((item) => item[1]);
}
