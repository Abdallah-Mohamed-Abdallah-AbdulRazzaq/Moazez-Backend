import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  DismissalGateOperationalStatus,
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

const GLOBAL_PREFIX = '/api/v1';
const PASSWORD = 'DismissalGoldenSecurity123!';
const TEST_RUN_ID = randomUUID().slice(0, 8);
const SCHOOL_LATITUDE = 30.04442;
const SCHOOL_LONGITUDE = 31.235712;
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(180_000);

describe('DISMISSAL-E2E-1A full golden path security smoke', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let organizationId: string;
  let schoolId: string;
  let classroomId: string;
  let gateId: string;
  let parentUserId: string;
  let guardianId: string;
  let staffAssignedUserId: string;
  let parentToken: string;
  let staffAssignedToken: string;
  let staffUnassignedToken: string;
  let teacherToken: string;
  let studentToken: string;
  let activeRequestId: string;
  let activeChildId: string;
  const createdUserIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdOrganizationIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [parentRole, dismissalStaffRole, teacherRole, studentRole] =
      await Promise.all([
        findSystemRole('parent'),
        findSystemRole('dismissal_staff'),
        findSystemRole('teacher'),
        findSystemRole('student'),
      ]);

    const fixture = await createSchoolFixture();
    organizationId = fixture.organizationId;
    schoolId = fixture.schoolId;
    classroomId = (await createAcademicFixture()).classroomId;
    gateId = await createGate();

    const parent = await createUserWithMembership({
      email: `dismissal-golden-sec-${TEST_RUN_ID}-parent@moazez.local`,
      roleId: parentRole.id,
      userType: UserType.PARENT,
      firstName: 'Golden',
      lastName: 'Security Parent',
    });
    const staffAssigned = await createUserWithMembership({
      email: `dismissal-golden-sec-${TEST_RUN_ID}-staff-assigned@moazez.local`,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
      firstName: 'Assigned',
      lastName: 'Security Staff',
    });
    const staffUnassigned = await createUserWithMembership({
      email: `dismissal-golden-sec-${TEST_RUN_ID}-staff-unassigned@moazez.local`,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
      firstName: 'Unassigned',
      lastName: 'Security Staff',
    });
    const teacher = await createUserWithMembership({
      email: `dismissal-golden-sec-${TEST_RUN_ID}-teacher@moazez.local`,
      roleId: teacherRole.id,
      userType: UserType.TEACHER,
      firstName: 'Golden',
      lastName: 'Teacher',
    });
    const studentUser = await createUserWithMembership({
      email: `dismissal-golden-sec-${TEST_RUN_ID}-student@moazez.local`,
      roleId: studentRole.id,
      userType: UserType.STUDENT,
      firstName: 'Golden',
      lastName: 'Student User',
    });

    parentUserId = parent.userId;
    staffAssignedUserId = staffAssigned.userId;
    guardianId = await createGuardian({
      userId: parentUserId,
      firstName: 'Golden',
      lastName: 'Security Guardian',
      relation: 'father',
      canPickup: true,
    });

    await prisma.dismissalSettings.create({
      data: {
        schoolId,
        enabled: true,
        timezone: 'Africa/Cairo',
        schoolLatitude: SCHOOL_LATITUDE,
        schoolLongitude: SCHOOL_LONGITUDE,
        allowedRadiusMeters: 500,
        requestWindowStartLocal: '00:00',
        requestWindowEndLocal: '23:59',
        delayThresholdMinutes: 1,
        urgentThresholdMinutes: 2,
        requirePickupCode: true,
        allowDelegatePickup: true,
        allowParentCancelBeforeCalled: true,
        defaultGateId: gateId,
      },
    });
    await prisma.dismissalStaffAssignment.create({
      data: {
        schoolId,
        staffUserId: staffAssigned.userId,
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

    parentToken = await login(parent.email);
    staffAssignedToken = await login(staffAssigned.email);
    staffUnassignedToken = await login(staffUnassigned.email);
    teacherToken = await login(teacher.email);
    studentToken = await login(studentUser.email);

    activeChildId = (
      await createStudentFixture({
        firstName: 'Active',
        lastName: 'Security',
      })
    ).studentId;
    activeRequestId = (
      await createParentRequest({
        childId: activeChildId,
        clientRequestId: `golden-security-active-${TEST_RUN_ID}`,
      }).expect(201)
    ).body.request.id as string;
  });

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) {
      await prisma.communicationNotificationPushAttempt.deleteMany({
        where: { schoolId },
      });
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
      await prisma.schoolProfile.deleteMany({ where: { schoolId } });
      await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.membership.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      await prisma.school.deleteMany({ where: { id: { in: createdSchoolIds } } });
      await prisma.organization.deleteMany({
        where: { id: { in: createdOrganizationIds } },
      });
      await prisma.$disconnect();
    }
  });

  it('keeps forbidden shortcut/root routes absent', async () => {
    await request(app.getHttpServer()).get(`${GLOBAL_PREFIX}/pickup`).expect(404);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/waiting-students`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/notifications`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/smart-pickup/notifications`)
      .expect(404);
  });

  it('keeps Parent, Dismissal Staff, Teacher, and Student surfaces separated', async () => {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/active`)
      .set('Authorization', `Bearer ${parentToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/history`)
      .set('Authorization', `Bearer ${parentToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/${activeRequestId}/pickup-recipients`)
      .set('Authorization', `Bearer ${parentToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/requests/${activeRequestId}/deliver`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({})
      .expect(403);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/smart-pickup/requests`)
      .set('Authorization', `Bearer ${staffAssignedToken}`)
      .send({
        childId: activeChildId,
        gateId,
        latitude: SCHOOL_LATITUDE,
        longitude: SCHOOL_LONGITUDE,
        clientRequestId: `staff-forbidden-${TEST_RUN_ID}`,
      })
      .expect(403);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/smart-pickup/requests/${activeRequestId}/cancel`)
      .set('Authorization', `Bearer ${staffAssignedToken}`)
      .send({})
      .expect(403);

    for (const token of [teacherToken, studentToken]) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/dismissal/requests/active`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/dismissal/requests/history`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      await request(app.getHttpServer())
        .patch(`${GLOBAL_PREFIX}/dismissal/requests/${activeRequestId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'called' })
        .expect(403);
    }
  });

  it('keeps Dismissal Staff assignment scope enforced across golden-path operations', async () => {
    const active = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/active`)
      .set('Authorization', `Bearer ${staffUnassignedToken}`)
      .expect(200);
    expect(active.body.data.map((item: { id: string }) => item.id)).not.toContain(
      activeRequestId,
    );

    await expectSafe404(
      request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/dismissal/requests/${activeRequestId}`)
        .set('Authorization', `Bearer ${staffUnassignedToken}`),
    );
    await expectSafe404(
      request(app.getHttpServer())
        .patch(`${GLOBAL_PREFIX}/dismissal/requests/${activeRequestId}/status`)
        .set('Authorization', `Bearer ${staffUnassignedToken}`)
        .send({ status: 'called' }),
    );
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/waiting-students/${activeRequestId}/arrival`)
      .set('Authorization', `Bearer ${staffUnassignedToken}`)
      .send({})
      .expect(404);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/${activeRequestId}/pickup-recipients`)
      .set('Authorization', `Bearer ${staffUnassignedToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/requests/${activeRequestId}/deliver`)
      .set('Authorization', `Bearer ${staffUnassignedToken}`)
      .send({})
      .expect(404);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/history/${activeRequestId}`)
      .set('Authorization', `Bearer ${staffUnassignedToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/requests/${activeRequestId}/escalate`)
      .set('Authorization', `Bearer ${staffUnassignedToken}`)
      .send({ reason: 'other' })
      .expect(404);
  });

  it('keeps terminal transitions and pre-ready delivery protections intact', async () => {
    const flow = await createChildRequestWithPickupCode('Terminal Guard');

    const called = await patchStatus(flow.requestId, 'called').expect(200);
    expect(called.body.request.status).toBe('called');
    const cancelCalled = await cancelParent(flow.requestId).expect(409);
    expect(cancelCalled.body?.error?.code).toBe(
      'dismissal.request.cancel_not_allowed',
    );

    await patchStatus(flow.requestId, 'moving').expect(200);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/waiting-students/${flow.requestId}/arrival`)
      .set('Authorization', `Bearer ${staffAssignedToken}`)
      .send({})
      .expect(201);
    await patchStatus(flow.requestId, 'ready').expect(200);
    const cancelReady = await cancelParent(flow.requestId).expect(409);
    expect(cancelReady.body?.error?.code).toBe(
      'dismissal.request.cancel_not_allowed',
    );

    const pickupRecipientToken = await getPickupRecipientToken(flow.requestId);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/requests/${flow.requestId}/deliver`)
      .set('Authorization', `Bearer ${staffAssignedToken}`)
      .send({
        pickupRecipientToken,
        pickupCode: flow.pickupCode,
        note: 'Security terminal guard handover',
      })
      .expect(201);
    const cancelTerminal = await cancelParent(flow.requestId).expect(409);
    expect(cancelTerminal.body?.error?.code).toBe(
      'dismissal.request.already_terminal',
    );

    const terminalEscalation = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/requests/${flow.requestId}/escalate`)
      .set('Authorization', `Bearer ${staffAssignedToken}`)
      .send({ reason: 'other' })
      .expect(409);
    expect(terminalEscalation.body?.error?.code).toBe(
      'dismissal.escalation.terminal_request',
    );

    const terminalPatch = await createChildRequestWithPickupCode('Patch Guard');
    for (const status of ['handed_over', 'cancelled', 'expired']) {
      const response = await patchStatus(terminalPatch.requestId, status).expect(409);
      expect(response.body?.error?.code).toBe(
        'dismissal.request.terminal_status',
      );
    }

    const notReady = await createChildRequestWithPickupCode('Not Ready');
    const recipients = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/${notReady.requestId}/pickup-recipients`)
      .set('Authorization', `Bearer ${staffAssignedToken}`)
      .expect(409);
    expect(recipients.body?.error?.code).toBe('dismissal.delivery.not_ready');

    const delivery = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/requests/${notReady.requestId}/deliver`)
      .set('Authorization', `Bearer ${staffAssignedToken}`)
      .send({})
      .expect(409);
    expect(delivery.body?.error?.code).toBe('dismissal.delivery.not_ready');
  });

  async function createChildRequestWithPickupCode(
    label: string,
  ): Promise<{ requestId: string; pickupCode: string; childId: string }> {
    const child = await createStudentFixture({
      firstName: label.replace(/\s+/g, ''),
      lastName: 'Security',
    });
    const response = await createParentRequest({
      childId: child.studentId,
      clientRequestId: `golden-security-${label.replace(/\s+/g, '-').toLowerCase()}-${TEST_RUN_ID}`,
    }).expect(201);

    return {
      childId: child.studentId,
      requestId: response.body.request.id as string,
      pickupCode: response.body.pickup.pickupCode as string,
    };
  }

  function createParentRequest(params: {
    childId: string;
    clientRequestId: string;
  }) {
    return request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/smart-pickup/requests`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        childId: params.childId,
        gateId,
        latitude: SCHOOL_LATITUDE,
        longitude: SCHOOL_LONGITUDE,
        clientRequestId: params.clientRequestId,
      });
  }

  function patchStatus(requestId: string, status: string) {
    return request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/requests/${requestId}/status`)
      .set('Authorization', `Bearer ${staffAssignedToken}`)
      .send({ status });
  }

  function cancelParent(requestId: string) {
    return request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/smart-pickup/requests/${requestId}/cancel`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({});
  }

  async function getPickupRecipientToken(requestId: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/${requestId}/pickup-recipients`)
      .set('Authorization', `Bearer ${staffAssignedToken}`)
      .expect(200);

    return response.body.recipients[0].pickupRecipientToken as string;
  }

  async function createSchoolFixture(): Promise<{
    organizationId: string;
    schoolId: string;
  }> {
    const organization = await prisma.organization.create({
      data: {
        slug: `dismissal-golden-sec-${TEST_RUN_ID}-org`,
        name: `Dismissal Golden Security Org ${TEST_RUN_ID}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);

    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `dismissal-golden-sec-${TEST_RUN_ID}-school`,
        name: `Dismissal Golden Security School ${TEST_RUN_ID}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdSchoolIds.push(school.id);

    await prisma.schoolProfile.create({
      data: {
        schoolId: school.id,
        schoolName: `Dismissal Golden Security School ${TEST_RUN_ID}`,
        timezone: 'Africa/Cairo',
        latitude: SCHOOL_LATITUDE,
        longitude: SCHOOL_LONGITUDE,
        mapPlaceLabel: 'Golden Security Zone',
      },
    });

    return { organizationId: organization.id, schoolId: school.id };
  }

  async function createAcademicFixture(): Promise<{ classroomId: string }> {
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId,
        nameAr: `golden-sec-year-${TEST_RUN_ID}-ar`,
        nameEn: `Golden Security Year ${TEST_RUN_ID}`,
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
        nameAr: `golden-sec-term-${TEST_RUN_ID}-ar`,
        nameEn: `Golden Security Term ${TEST_RUN_ID}`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-01-31T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    expect(term.id).toBeTruthy();
    const stage = await prisma.stage.create({
      data: {
        schoolId,
        nameAr: `golden-sec-stage-${TEST_RUN_ID}-ar`,
        nameEn: `Golden Security Stage ${TEST_RUN_ID}`,
      },
      select: { id: true },
    });
    const grade = await prisma.grade.create({
      data: {
        schoolId,
        stageId: stage.id,
        nameAr: `golden-sec-grade-${TEST_RUN_ID}-ar`,
        nameEn: `Golden Security Grade ${TEST_RUN_ID}`,
      },
      select: { id: true },
    });
    const section = await prisma.section.create({
      data: {
        schoolId,
        gradeId: grade.id,
        nameAr: `golden-sec-section-${TEST_RUN_ID}-ar`,
        nameEn: `Golden Security Section ${TEST_RUN_ID}`,
      },
      select: { id: true },
    });
    const classroom = await prisma.classroom.create({
      data: {
        schoolId,
        sectionId: section.id,
        nameAr: `golden-sec-classroom-${TEST_RUN_ID}-ar`,
        nameEn: `Golden Security Classroom ${TEST_RUN_ID}`,
      },
      select: { id: true },
    });

    return { classroomId: classroom.id };
  }

  async function createGate(): Promise<string> {
    const gate = await prisma.dismissalGate.create({
      data: {
        schoolId,
        code: `GPS-${TEST_RUN_ID}`,
        name: 'Golden Security Gate',
        status: DismissalGateOperationalStatus.OPEN,
        isActive: true,
        sortOrder: 1,
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

  async function createGuardian(params: {
    userId: string | null;
    firstName: string;
    lastName: string;
    relation: string;
    canPickup: boolean;
  }): Promise<string> {
    const guardian = await prisma.guardian.create({
      data: {
        schoolId,
        organizationId,
        userId: params.userId,
        firstName: params.firstName,
        lastName: params.lastName,
        relation: params.relation,
        phone: `011${TEST_RUN_ID.slice(0, 6)}`,
        isPrimary: params.userId === parentUserId,
        canPickup: params.canPickup,
        canReceiveNotifications: true,
      },
      select: { id: true },
    });
    return guardian.id;
  }

  async function createStudentFixture(params: {
    firstName: string;
    lastName: string;
  }): Promise<{ studentId: string }> {
    const [year, term] = await Promise.all([
      prisma.academicYear.findFirstOrThrow({
        where: { schoolId },
        select: { id: true },
      }),
      prisma.term.findFirstOrThrow({
        where: { schoolId },
        select: { id: true },
      }),
    ]);
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
    await prisma.enrollment.create({
      data: {
        schoolId,
        studentId: student.id,
        academicYearId: year.id,
        termId: term.id,
        classroomId,
        status: StudentEnrollmentStatus.ACTIVE,
        enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    });
    return { studentId: student.id };
  }

  async function findSystemRole(key: string): Promise<{ id: string }> {
    const role = await prisma.role.findFirst({
      where: { key, schoolId: null, isSystem: true },
      select: { id: true },
    });
    if (!role) throw new Error(`${key} system role not found - run seed.`);
    return role;
  }

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: PASSWORD })
      .expect(200);

    return response.body.accessToken as string;
  }

  async function expectSafe404(
    pendingRequest: request.Test,
  ): Promise<void> {
    const response = await pendingRequest.expect(404);
    expect(response.body?.error?.code).toMatch(/^dismissal\./);
  }
});
