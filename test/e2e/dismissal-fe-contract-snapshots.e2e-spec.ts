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
const PASSWORD = 'DismissalFeContract123!';
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

describe('DISMISSAL-FE-CONTRACT-1A representative contract snapshots (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let organizationId: string;
  let schoolId: string;
  let classroomId: string;
  let gateId: string;
  let parentUserId: string;
  let guardianId: string;
  let primaryChildId: string;
  let cancelChildId: string;
  let adminToken: string;
  let parentToken: string;
  let staffToken: string;
  const createdUserIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdOrganizationIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [schoolAdminRole, parentRole, dismissalStaffRole] = await Promise.all([
      prisma.role.findFirst({
        where: { key: 'school_admin', schoolId: null, isSystem: true },
        select: { id: true },
      }),
      prisma.role.findFirst({
        where: { key: 'parent', schoolId: null, isSystem: true },
        select: { id: true },
      }),
      prisma.role.findFirst({
        where: { key: 'dismissal_staff', schoolId: null, isSystem: true },
        select: { id: true },
      }),
    ]);
    if (!schoolAdminRole || !parentRole || !dismissalStaffRole) {
      throw new Error('Required system roles not found - run `npm run seed`.');
    }

    const fixture = await createSchoolFixture();
    organizationId = fixture.organizationId;
    schoolId = fixture.schoolId;
    classroomId = (await createAcademicFixture()).classroomId;
    gateId = await createGate();

    const admin = await createUserWithMembership({
      email: `fe-contract-${TEST_RUN_ID}-admin@moazez.local`,
      roleId: schoolAdminRole.id,
      userType: UserType.SCHOOL_USER,
      firstName: 'Contract',
      lastName: 'Admin',
    });
    const parent = await createUserWithMembership({
      email: `fe-contract-${TEST_RUN_ID}-parent@moazez.local`,
      roleId: parentRole.id,
      userType: UserType.PARENT,
      firstName: 'Contract',
      lastName: 'Parent',
    });
    const staff = await createUserWithMembership({
      email: `fe-contract-${TEST_RUN_ID}-staff@moazez.local`,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
      firstName: 'Contract',
      lastName: 'Staff',
    });
    parentUserId = parent.userId;
    guardianId = await createGuardian({
      userId: parentUserId,
      firstName: 'Contract',
      lastName: 'Guardian',
      relation: 'father',
      canPickup: true,
    });
    const delegateGuardianId = await createGuardian({
      userId: null,
      firstName: 'Trusted',
      lastName: 'Delegate',
      relation: 'relative',
      canPickup: true,
    });
    primaryChildId = (
      await createStudentFixture({
        firstName: 'Primary',
        lastName: 'Contract',
        extraGuardianIds: [delegateGuardianId],
      })
    ).studentId;
    cancelChildId = (
      await createStudentFixture({
        firstName: 'Cancel',
        lastName: 'Contract',
      })
    ).studentId;

    await prisma.dismissalSettings.create({
      data: {
        schoolId,
        enabled: true,
        timezone: 'Africa/Cairo',
        schoolLatitude: SCHOOL_LATITUDE,
        schoolLongitude: SCHOOL_LONGITUDE,
        allowedRadiusMeters: 150,
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
    parentToken = await login(parent.email);
    staffToken = await login(staff.email);
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

  it('verifies representative Parent and Dismissal response shapes, status casing, and no-leak rules', async () => {
    const readiness = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/smart-pickup`)
      .set('Authorization', `Bearer ${parentToken}`)
      .expect(200);
    expect(readiness.body).toMatchObject({
      enabled: true,
      status: {
        enabled: true,
        configured: true,
        requestWindowOpen: true,
        canRequestNow: true,
      },
      policy: {
        pickupCodeRequired: true,
        parentCancelBeforeCalledAllowed: true,
        delegatePickupAllowed: true,
      },
      summary: {
        childCount: 2,
        availableGateCount: 1,
      },
    });
    expect(readiness.body.children[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        displayName: expect.any(String),
        canRequestPickup: true,
        activeRequest: null,
      }),
    );
    assertNoForbiddenFields(readiness.body);

    const create = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/smart-pickup/requests`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        childId: primaryChildId,
        gateId,
        latitude: SCHOOL_LATITUDE,
        longitude: SCHOOL_LONGITUDE,
        clientRequestId: `fe-contract-primary-${TEST_RUN_ID}`,
      })
      .expect(201);
    const requestId = create.body.request.id as string;
    const pickupCode = create.body.request.pickup.code as string;
    expect(create.body.request).toMatchObject({
      id: expect.any(String),
      status: 'requested',
      isActive: true,
      isTerminal: false,
      canCancel: true,
      canTrack: true,
      pickup: {
        codeRequired: true,
        codeIssued: true,
        code: expect.stringMatching(/^\d{6}$/),
      },
    });
    expect(create.body.pickup.pickupCode).toEqual(pickupCode);
    assertNoForbiddenFields(create.body, { allowRawPickupCode: true });

    const retry = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/smart-pickup/requests`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        childId: primaryChildId,
        gateId,
        latitude: SCHOOL_LATITUDE,
        longitude: SCHOOL_LONGITUDE,
        clientRequestId: `fe-contract-primary-${TEST_RUN_ID}`,
      })
      .expect(201);
    expect(retry.body.request.id).toBe(requestId);
    expect(JSON.stringify(retry.body)).not.toContain(pickupCode);
    expect(retry.body.request.pickup).not.toHaveProperty('code');
    expect(retry.body.pickup).not.toHaveProperty('pickupCode');
    assertNoForbiddenFields(retry.body);

    const recentBefore = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/smart-pickup/recent-calls`)
      .set('Authorization', `Bearer ${parentToken}`)
      .expect(200);
    expect(recentBefore.body.data[0]).toEqual(
      expect.objectContaining({
        id: requestId,
        status: 'requested',
        isActive: true,
        isTerminal: false,
        canCancel: true,
      }),
    );
    assertNoForbiddenFields(recentBefore.body);

    const activeQueue = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/active`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(activeQueue.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: requestId,
          status: 'requested',
          waitMinutes: expect.any(Number),
          signals: expect.objectContaining({
            delayed: expect.any(Boolean),
            urgent: expect.any(Boolean),
          }),
          child: expect.objectContaining({ id: primaryChildId }),
          gate: expect.objectContaining({ id: gateId, status: 'open' }),
        }),
      ]),
    );
    assertNoForbiddenFields(activeQueue.body);

    const detail = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/${requestId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(detail.body.request.timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'request_created', statusTo: 'requested' }),
      ]),
    );
    assertNoForbiddenFields(detail.body);

    const escalation = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/requests/${requestId}/escalate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'parent_waiting', note: 'Contract escalation' })
      .expect(201);
    expect(escalation.body.escalation).toMatchObject({
      requestId,
      changed: true,
      escalated: true,
      reason: 'parent_waiting',
    });
    assertNoForbiddenFields(escalation.body);

    const called = await patchStatus(requestId, 'called').expect(200);
    expect(called.body.request).toMatchObject({
      id: requestId,
      status: 'called',
      previousStatus: 'requested',
      changed: true,
    });
    assertNoForbiddenFields(called.body);

    const waiting = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/waiting-students`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(waiting.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: requestId,
          status: 'called',
          arrivalState: 'called',
        }),
      ]),
    );
    assertNoForbiddenFields(waiting.body);

    const arrival = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/waiting-students/${requestId}/arrival`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ note: 'Arrived at gate' })
      .expect(201);
    expect(arrival.body.student).toMatchObject({
      id: requestId,
      status: 'at_gate',
      previousStatus: 'called',
      changed: true,
      arrivalState: 'arrived',
    });
    assertNoForbiddenFields(arrival.body);

    await patchStatus(requestId, 'ready').expect(200);

    const recipients = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/${requestId}/pickup-recipients`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(recipients.body).toMatchObject({
      request: { id: requestId, status: 'ready' },
      policy: {
        delegatePickupAllowed: true,
        pickupCodeRequired: true,
      },
    });
    expect(recipients.body.recipients[0]).toEqual(
      expect.objectContaining({
        pickupRecipientToken: expect.any(String),
        displayName: expect.any(String),
        canPickup: true,
      }),
    );
    assertNoForbiddenFields(recipients.body, { allowPickupRecipientToken: true });
    const pickupRecipientToken = recipients.body.recipients[0]
      .pickupRecipientToken as string;

    const delivered = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/requests/${requestId}/deliver`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ pickupRecipientToken, pickupCode, note: 'Contract handover' })
      .expect(201);
    expect(delivered.body.delivery).toMatchObject({
      id: requestId,
      status: 'handed_over',
      previousStatus: 'ready',
      pickupCodeVerified: true,
      pickupRecipientVerified: true,
      receiver: {
        verified: true,
        source: 'guardian_link',
      },
    });
    assertNoForbiddenFields(delivered.body);
    expect(JSON.stringify(delivered.body)).not.toContain(pickupRecipientToken);
    expect(JSON.stringify(delivered.body)).not.toContain(pickupCode);

    const notifications = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/notifications`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    expect(notifications.body.summary.totalCount).toBeGreaterThanOrEqual(1);
    expect(notifications.body.data[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        type: expect.stringMatching(/^request_/),
        title: expect.any(String),
        body: expect.any(String),
        readAt: null,
      }),
    );
    assertNoForbiddenFields(notifications.body);

    const notificationId = notifications.body.data[0].id as string;
    const readOne = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/notifications/${notificationId}/read`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    expect(readOne.body.notification).toMatchObject({
      id: notificationId,
      readAt: expect.any(String),
    });
    assertNoForbiddenFields(readOne.body);

    const readAll = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/notifications/read-all`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    expect(readAll.body.updatedCount).toEqual(expect.any(Number));

    const historyList = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/history`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(historyList.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: requestId,
          status: 'handed_over',
          isTerminal: true,
          escalation: expect.objectContaining({
            escalated: true,
            reason: 'parent_waiting',
          }),
        }),
      ]),
    );
    assertNoForbiddenFields(historyList.body);

    const historyDetail = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/history/${requestId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(historyDetail.body.request.timeline.map((item: { type: string }) => item.type))
      .toEqual(expect.arrayContaining([
        'request_created',
        'request_status_changed',
        'request_escalated',
      ]));
    assertNoForbiddenFields(historyDetail.body);

    const cancelCreate = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/smart-pickup/requests`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        childId: cancelChildId,
        gateId,
        latitude: SCHOOL_LATITUDE,
        longitude: SCHOOL_LONGITUDE,
        clientRequestId: `fe-contract-cancel-${TEST_RUN_ID}`,
      })
      .expect(201);
    const cancelRequestId = cancelCreate.body.request.id as string;

    const cancel = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/smart-pickup/requests/${cancelRequestId}/cancel`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({ note: 'Cancel contract check' })
      .expect(201);
    expect(cancel.body.request).toMatchObject({
      id: cancelRequestId,
      status: 'cancelled',
      previousStatus: 'requested',
      changed: true,
      isActive: false,
      isTerminal: true,
      canCancel: false,
      canTrack: false,
      cancelledAt: expect.any(String),
    });
    assertNoForbiddenFields(cancel.body);
    expect(JSON.stringify(cancel.body)).not.toContain('pickupCode');

    const recentAfter = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/smart-pickup/recent-calls`)
      .set('Authorization', `Bearer ${parentToken}`)
      .expect(200);
    expect(recentAfter.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: requestId, status: 'handed_over' }),
        expect.objectContaining({ id: cancelRequestId, status: 'cancelled' }),
      ]),
    );
    expect(JSON.stringify(recentAfter.body)).not.toContain('pickupRecipientToken');
    expect(JSON.stringify(recentAfter.body)).not.toContain('handoverReceiverName');
    assertNoForbiddenFields(recentAfter.body);
  });

  function patchStatus(requestId: string, status: string) {
    return request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/requests/${requestId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status, note: `Set ${status}` });
  }

  async function createSchoolFixture(): Promise<{
    organizationId: string;
    schoolId: string;
  }> {
    const organization = await prisma.organization.create({
      data: {
        slug: `fe-contract-${TEST_RUN_ID}-org`,
        name: `FE Contract Org ${TEST_RUN_ID}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);

    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `fe-contract-${TEST_RUN_ID}-school`,
        name: `FE Contract School ${TEST_RUN_ID}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdSchoolIds.push(school.id);

    await prisma.schoolProfile.create({
      data: {
        schoolId: school.id,
        schoolName: `FE Contract School ${TEST_RUN_ID}`,
        timezone: 'Africa/Cairo',
        latitude: SCHOOL_LATITUDE,
        longitude: SCHOOL_LONGITUDE,
        mapPlaceLabel: 'FE Contract Zone',
      },
    });

    return { organizationId: organization.id, schoolId: school.id };
  }

  async function createAcademicFixture(): Promise<{ classroomId: string }> {
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId,
        nameAr: `fe-year-${TEST_RUN_ID}-ar`,
        nameEn: `FE Contract Year ${TEST_RUN_ID}`,
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
        nameAr: `fe-term-${TEST_RUN_ID}-ar`,
        nameEn: `FE Contract Term ${TEST_RUN_ID}`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-01-31T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    const stage = await prisma.stage.create({
      data: {
        schoolId,
        nameAr: `fe-stage-${TEST_RUN_ID}-ar`,
        nameEn: `FE Contract Stage ${TEST_RUN_ID}`,
      },
      select: { id: true },
    });
    const grade = await prisma.grade.create({
      data: {
        schoolId,
        stageId: stage.id,
        nameAr: `fe-grade-${TEST_RUN_ID}-ar`,
        nameEn: `FE Contract Grade ${TEST_RUN_ID}`,
      },
      select: { id: true },
    });
    const section = await prisma.section.create({
      data: {
        schoolId,
        gradeId: grade.id,
        nameAr: `fe-section-${TEST_RUN_ID}-ar`,
        nameEn: `FE Contract Section ${TEST_RUN_ID}`,
      },
      select: { id: true },
    });
    const classroom = await prisma.classroom.create({
      data: {
        schoolId,
        sectionId: section.id,
        nameAr: `fe-classroom-${TEST_RUN_ID}-ar`,
        nameEn: `FE Contract Classroom ${TEST_RUN_ID}`,
      },
      select: { id: true },
    });

    return { classroomId: classroom.id };
  }

  async function createGate(): Promise<string> {
    const gate = await prisma.dismissalGate.create({
      data: {
        schoolId,
        code: `FE-${TEST_RUN_ID}`,
        name: 'FE Contract Gate',
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
        phone: `010${TEST_RUN_ID.slice(0, 6)}`,
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
    extraGuardianIds?: string[];
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
    await prisma.studentGuardian.createMany({
      data: [guardianId, ...(params.extraGuardianIds ?? [])].map(
        (studentGuardianId, index) => ({
          schoolId,
          studentId: student.id,
          guardianId: studentGuardianId,
          isPrimary: index === 0,
        }),
      ),
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

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: PASSWORD })
      .expect(200);

    return response.body.accessToken as string;
  }
});

function assertNoForbiddenFields(
  payload: unknown,
  options: {
    allowPickupRecipientToken?: boolean;
    allowRawPickupCode?: boolean;
  } = {},
): void {
  const forbiddenKeys = new Set([
    'schoolId',
    'organizationId',
    'membershipId',
    'roleId',
    'guardianId',
    'guardianUserId',
    'studentGuardianId',
    'userId',
    'applicationId',
    'enrollmentId',
    'requestedById',
    'actorUserId',
    'staffUserId',
    'handedOverById',
    'assignmentId',
    'eventId',
    'parentLatitude',
    'parentLongitude',
    'distanceMeters',
    'geofencePassed',
    'clientRequestId',
    'deletedAt',
    'metadata',
    'pickupCodeHash',
    'pickupCodeSalt',
  ]);
  if (!options.allowPickupRecipientToken) {
    forbiddenKeys.add('pickupRecipientToken');
  }
  if (!options.allowRawPickupCode) {
    forbiddenKeys.add('pickupCode');
  }

  visit(payload);

  function visit(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const child of value) visit(child);
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      expect(forbiddenKeys.has(key)).toBe(false);
      visit(child);
    }
  }
}
