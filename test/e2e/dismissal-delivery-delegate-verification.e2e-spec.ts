import { createHmac, randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AuditOutcome,
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
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { RealtimePublisherService } from '../../src/infrastructure/realtime/realtime-publisher.service';
import { issuePickupCode } from '../../src/modules/dismissal/shared/pickup-code.service';

const GLOBAL_PREFIX = '/api/v1';
const PASSWORD = 'DismissalDelegateVerification123!';
const TEST_RUN_ID = randomUUID().slice(0, 8);
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(120_000);

describe('DISMISSAL-DELIVERY-1B pickup delegate verification (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let realtimePublisher: RealtimePublisherService;
  let publishSpy: jest.SpyInstance;
  let organizationAId: string;
  let organizationBId: string;
  let schoolAId: string;
  let schoolBId: string;
  let classroomAId: string;
  let classroomBId: string;
  let gateAId: string;
  let otherGateAId: string;
  let gateBId: string;
  let adminAToken: string;
  let adminBToken: string;
  let staffToken: string;
  let parentToken: string;
  let parentAId: string;
  let parentBId: string;
  let guardianAId: string;
  let guardianBId: string;
  let delegateGuardianId: string;
  let blockedGuardianId: string;
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

    const schoolA = await createSchoolFixture('a');
    const schoolB = await createSchoolFixture('b');
    organizationAId = schoolA.organizationId;
    schoolAId = schoolA.schoolId;
    organizationBId = schoolB.organizationId;
    schoolBId = schoolB.schoolId;
    classroomAId = (await createAcademicFixture('a', schoolAId)).classroomId;
    classroomBId = (await createAcademicFixture('b', schoolBId)).classroomId;
    gateAId = await createGate(schoolAId, 'A', DismissalGateOperationalStatus.OPEN);
    otherGateAId = await createGate(
      schoolAId,
      'HIDDEN',
      DismissalGateOperationalStatus.OPEN,
    );
    gateBId = await createGate(schoolBId, 'B', DismissalGateOperationalStatus.OPEN);

    const adminA = await createUserWithMembership({
      email: `dismissal-delegate-${TEST_RUN_ID}-admin-a@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: schoolAdminRole.id,
      userType: UserType.SCHOOL_USER,
      firstName: 'Delegate',
      lastName: 'Admin A',
    });
    const adminB = await createUserWithMembership({
      email: `dismissal-delegate-${TEST_RUN_ID}-admin-b@moazez.local`,
      schoolId: schoolBId,
      organizationId: organizationBId,
      roleId: schoolAdminRole.id,
      userType: UserType.SCHOOL_USER,
      firstName: 'Delegate',
      lastName: 'Admin B',
    });
    const staff = await createUserWithMembership({
      email: `dismissal-delegate-${TEST_RUN_ID}-staff@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
      firstName: 'Delegate',
      lastName: 'Staff',
    });
    const parentA = await createUserWithMembership({
      email: `dismissal-delegate-${TEST_RUN_ID}-parent-a@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: parentRole.id,
      userType: UserType.PARENT,
      firstName: 'Requesting',
      lastName: 'Parent',
    });
    const parentB = await createUserWithMembership({
      email: `dismissal-delegate-${TEST_RUN_ID}-parent-b@moazez.local`,
      schoolId: schoolBId,
      organizationId: organizationBId,
      roleId: parentRole.id,
      userType: UserType.PARENT,
      firstName: 'Cross',
      lastName: 'Parent',
    });
    parentAId = parentA.userId;
    parentBId = parentB.userId;

    guardianAId = await createGuardian({
      schoolId: schoolAId,
      organizationId: organizationAId,
      userId: parentAId,
      firstName: 'Requesting',
      lastName: 'Guardian',
      relation: 'father',
      phone: '01011112222',
      canPickup: true,
    });
    guardianBId = await createGuardian({
      schoolId: schoolBId,
      organizationId: organizationBId,
      userId: parentBId,
      firstName: 'Cross',
      lastName: 'Guardian',
      relation: 'mother',
      phone: '01033334444',
      canPickup: true,
    });
    delegateGuardianId = await createGuardian({
      schoolId: schoolAId,
      organizationId: organizationAId,
      userId: null,
      firstName: 'Trusted',
      lastName: 'Delegate',
      relation: 'relative',
      phone: '01055556666',
      canPickup: true,
    });
    blockedGuardianId = await createGuardian({
      schoolId: schoolAId,
      organizationId: organizationAId,
      userId: null,
      firstName: 'Blocked',
      lastName: 'Guardian',
      relation: 'guardian',
      phone: '01077778888',
      canPickup: false,
    });

    await prisma.dismissalSettings.createMany({
      data: [
        {
          schoolId: schoolAId,
          enabled: true,
          requirePickupCode: false,
          allowDelegatePickup: false,
          defaultGateId: gateAId,
        },
        {
          schoolId: schoolBId,
          enabled: true,
          requirePickupCode: false,
          allowDelegatePickup: true,
          defaultGateId: gateBId,
        },
      ],
    });
    await prisma.dismissalStaffAssignment.create({
      data: {
        schoolId: schoolAId,
        staffUserId: staff.userId,
        gateId: gateAId,
        isActive: true,
      },
    });

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    realtimePublisher = moduleRef.get(RealtimePublisherService);
    publishSpy = jest
      .spyOn(realtimePublisher, 'publishToUser')
      .mockImplementation(() => undefined);

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

    adminAToken = await login(adminA.email);
    adminBToken = await login(adminB.email);
    staffToken = await login(staff.email);
    parentToken = await login(parentA.email);
  });

  afterAll(async () => {
    publishSpy?.mockRestore();
    if (prisma) {
      const schoolIds = [schoolAId, schoolBId].filter(Boolean);
      await prisma.communicationNotificationPushAttempt.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.communicationNotificationDelivery.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.communicationNotification.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.auditLog.deleteMany({ where: { schoolId: { in: schoolIds } } });
      await prisma.dismissalRequestEvent.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.dismissalRequest.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.dismissalStaffAssignment.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.dismissalSettings.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.dismissalGate.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.studentGuardian.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.enrollment.deleteMany({ where: { schoolId: { in: schoolIds } } });
      await prisma.student.deleteMany({ where: { schoolId: { in: schoolIds } } });
      await prisma.guardian.deleteMany({ where: { schoolId: { in: schoolIds } } });
      await prisma.classroom.deleteMany({ where: { schoolId: { in: schoolIds } } });
      await prisma.section.deleteMany({ where: { schoolId: { in: schoolIds } } });
      await prisma.grade.deleteMany({ where: { schoolId: { in: schoolIds } } });
      await prisma.stage.deleteMany({ where: { schoolId: { in: schoolIds } } });
      await prisma.term.deleteMany({ where: { schoolId: { in: schoolIds } } });
      await prisma.academicYear.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
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
    if (app) await app.close();
  });

  it('lists only requesting guardian when delegate pickup is disabled', async () => {
    await setDelegatePolicy(false);
    const requestId = await createReadyRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      classroomId: classroomAId,
      gateId: gateAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      additionalGuardianIds: [delegateGuardianId, blockedGuardianId],
      firstName: 'RequesterOnly',
    });

    const response = await getPickupRecipients(adminAToken, requestId).expect(200);
    expect(response.body.policy).toEqual({
      delegatePickupAllowed: false,
      pickupCodeRequired: false,
    });
    expect(response.body.recipients).toHaveLength(1);
    expect(response.body.recipients[0]).toEqual(
      expect.objectContaining({
        displayName: 'Requesting Guardian',
        relation: 'father',
        isRequestingGuardian: true,
        canPickup: true,
        maskedPhone: null,
        pickupRecipientToken: expect.any(String),
      }),
    );
    assertNoRecipientLeak(response.body);
  });

  it('lists eligible delegates only when delegate pickup is enabled', async () => {
    await setDelegatePolicy(true);
    const requestId = await createReadyRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      classroomId: classroomAId,
      gateId: gateAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      additionalGuardianIds: [delegateGuardianId, blockedGuardianId],
      firstName: 'DelegateAllowed',
    });

    const response = await getPickupRecipients(adminAToken, requestId).expect(200);
    expect(response.body.recipients.map((item: { displayName: string }) => item.displayName)).toEqual([
      'Requesting Guardian',
      'Trusted Delegate',
    ]);
    expect(JSON.stringify(response.body)).not.toContain('Blocked Guardian');
    assertNoRecipientLeak(response.body);
  });

  it('enforces ready status, school scope, deletion, terminal state, and staff assignment visibility on recipient discovery', async () => {
    const requestedId = await createReadyRequest({
      status: DismissalRequestStatus.REQUESTED,
      schoolId: schoolAId,
      organizationId: organizationAId,
      classroomId: classroomAId,
      gateId: gateAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      firstName: 'NotReady',
    });
    const terminalId = await createReadyRequest({
      status: DismissalRequestStatus.HANDED_OVER,
      schoolId: schoolAId,
      organizationId: organizationAId,
      classroomId: classroomAId,
      gateId: gateAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      firstName: 'Terminal',
    });
    const deletedId = await createReadyRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      classroomId: classroomAId,
      gateId: gateAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      deletedAt: new Date(),
      firstName: 'Deleted',
    });
    const hiddenFromStaffId = await createReadyRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      classroomId: classroomAId,
      gateId: otherGateAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      firstName: 'Hidden',
    });
    const crossSchoolId = await createReadyRequest({
      schoolId: schoolBId,
      organizationId: organizationBId,
      classroomId: classroomBId,
      gateId: gateBId,
      guardianId: guardianBId,
      requestedById: parentBId,
      firstName: 'Cross',
    });

    const notReady = await getPickupRecipients(adminAToken, requestedId).expect(409);
    expect(notReady.body?.error?.code).toBe('dismissal.delivery.not_ready');
    for (const requestId of [terminalId, deletedId, crossSchoolId]) {
      const response = await getPickupRecipients(adminAToken, requestId).expect(404);
      expect(response.body?.error?.code).toBe('dismissal.delivery.not_found');
    }
    const hidden = await getPickupRecipients(staffToken, hiddenFromStaffId).expect(404);
    expect(hidden.body?.error?.code).toBe('dismissal.delivery.not_found');
    await getPickupRecipients(staffToken, requestedId).expect(409);
  });

  it('delivers with the requesting guardian token and stores verified receiver fields', async () => {
    await setDelegatePolicy(false);
    const requestId = await createReadyRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      classroomId: classroomAId,
      gateId: gateAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      firstName: 'Verified',
    });
    const token = await getPickupRecipientToken(adminAToken, requestId);

    const response = await deliver(adminAToken, requestId, {
      pickupRecipientToken: token,
      receiverName: 'Spoofed Receiver',
      receiverRelation: 'spoofed',
      note: ' Verified handover ',
    }).expect(400);
    expect(response.body?.error?.code).toBe('validation.failed');

    const success = await deliver(adminAToken, requestId, {
      pickupRecipientToken: token,
      note: ' Verified handover ',
    }).expect(201);
    expect(success.body.delivery).toEqual(
      expect.objectContaining({
        id: requestId,
        status: 'handed_over',
        pickupRecipientVerified: true,
        receiver: {
          name: 'Requesting Guardian',
          relation: 'father',
          verified: true,
          source: 'guardian_link',
        },
      }),
    );
    assertNoDeliveryLeak(success.body);

    const stored = await prisma.dismissalRequest.findUniqueOrThrow({
      where: { id: requestId },
      select: {
        status: true,
        handoverReceiverName: true,
        handoverReceiverRelation: true,
      },
    });
    expect(stored).toEqual({
      status: DismissalRequestStatus.HANDED_OVER,
      handoverReceiverName: 'Requesting Guardian',
      handoverReceiverRelation: 'father',
    });
  });

  it('allows non-requesting canPickup guardian only when delegate pickup is enabled', async () => {
    await setDelegatePolicy(true);
    const requestId = await createReadyRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      classroomId: classroomAId,
      gateId: gateAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      additionalGuardianIds: [delegateGuardianId],
      firstName: 'DelegateDeliver',
    });
    const delegateToken = await getPickupRecipientToken(adminAToken, requestId, 1);

    await setDelegatePolicy(false);
    const rejected = await deliver(adminAToken, requestId, {
      pickupRecipientToken: delegateToken,
    }).expect(403);
    expect(rejected.body?.error?.code).toBe(
      'dismissal.delivery.pickup_recipient_not_allowed',
    );
    await expect(getRequestStatus(requestId)).resolves.toBe(
      DismissalRequestStatus.READY,
    );

    await setDelegatePolicy(true);
    const delivered = await deliver(adminAToken, requestId, {
      pickupRecipientToken: delegateToken,
    }).expect(201);
    expect(delivered.body.delivery.receiver).toEqual({
      name: 'Trusted Delegate',
      relation: 'relative',
      verified: true,
      source: 'guardian_link',
    });
  });

  it('rejects missing, cross-request, cross-school, tampered, expired, and stale recipient tokens without side effects', async () => {
    await setDelegatePolicy(true);
    const requestId = await createReadyRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      classroomId: classroomAId,
      gateId: gateAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      additionalGuardianIds: [delegateGuardianId],
      firstName: 'TokenReject',
    });
    const otherRequestId = await createReadyRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      classroomId: classroomAId,
      gateId: gateAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      firstName: 'OtherToken',
    });
    const crossSchoolId = await createReadyRequest({
      schoolId: schoolBId,
      organizationId: organizationBId,
      classroomId: classroomBId,
      gateId: gateBId,
      guardianId: guardianBId,
      requestedById: parentBId,
      firstName: 'CrossToken',
    });

    await expectFailedDeliveryWithoutSideEffects({
      requestId,
      body: {},
      expectedStatus: 422,
      expectedCode: 'dismissal.delivery.pickup_recipient_required',
    });

    await expectFailedDeliveryWithoutSideEffects({
      requestId,
      body: {
        pickupRecipientToken: await getPickupRecipientToken(
          adminAToken,
          otherRequestId,
        ),
      },
      expectedStatus: 422,
      expectedCode: 'dismissal.delivery.invalid_pickup_recipient',
    });

    await expectFailedDeliveryWithoutSideEffects({
      requestId,
      body: {
        pickupRecipientToken: await getPickupRecipientToken(
          adminBToken,
          crossSchoolId,
        ),
      },
      expectedStatus: 422,
      expectedCode: 'dismissal.delivery.invalid_pickup_recipient',
    });

    const validToken = await getPickupRecipientToken(adminAToken, requestId);
    const tamperedToken = makeNonCanonicalPickupRecipientToken(validToken);
    await expectFailedDeliveryWithoutSideEffects({
      requestId,
      body: { pickupRecipientToken: tamperedToken },
      expectedStatus: 422,
      expectedCode: 'dismissal.delivery.invalid_pickup_recipient',
    });

    await expectFailedDeliveryWithoutSideEffects({
      requestId,
      body: { pickupRecipientToken: makeExpiredPickupRecipientToken(validToken) },
      expectedStatus: 422,
      expectedCode: 'dismissal.delivery.pickup_recipient_expired',
    });

    const delegateToken = await getPickupRecipientToken(adminAToken, requestId, 1);
    await prisma.guardian.update({
      where: { id: delegateGuardianId },
      data: { canPickup: false },
    });
    await expectFailedDeliveryWithoutSideEffects({
      requestId,
      body: { pickupRecipientToken: delegateToken },
      expectedStatus: 403,
      expectedCode: 'dismissal.delivery.pickup_recipient_not_allowed',
    });
    await prisma.guardian.update({
      where: { id: delegateGuardianId },
      data: { canPickup: true },
    });
  });

  it('still requires pickup code when policy requires it', async () => {
    await prisma.dismissalSettings.update({
      where: { schoolId: schoolAId },
      data: { requirePickupCode: true, allowDelegatePickup: false },
    });
    const issued = issuePickupCode();
    const requestId = await createReadyRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      classroomId: classroomAId,
      gateId: gateAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      firstName: 'CodeRequired',
      pickupCodeHash: issued.hash,
      pickupCodeSalt: issued.salt,
      pickupCodeIssuedAt: issued.issuedAt,
    });
    const token = await getPickupRecipientToken(adminAToken, requestId);
    const missingCode = await deliver(adminAToken, requestId, {
      pickupRecipientToken: token,
    }).expect(422);
    expect(missingCode.body?.error?.code).toBe(
      'dismissal.delivery.pickup_code_required',
    );

    await deliver(adminAToken, requestId, {
      pickupRecipientToken: token,
      pickupCode: issued.code,
    }).expect(201);
    await prisma.dismissalSettings.update({
      where: { schoolId: schoolAId },
      data: { requirePickupCode: false },
    });
  });

  it('keeps delivered requests out of active queue, waiting students, and parent recent calls internals', async () => {
    await setDelegatePolicy(false);
    const requestId = await createReadyRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      classroomId: classroomAId,
      gateId: gateAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      firstName: 'PostDelivery',
    });
    await deliver(adminAToken, requestId, {
      pickupRecipientToken: await getPickupRecipientToken(adminAToken, requestId),
    }).expect(201);

    const active = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/active`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);
    expect(active.body.data.map((item: { id: string }) => item.id)).not.toContain(
      requestId,
    );
    const waiting = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/waiting-students`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);
    expect(waiting.body.data.map((item: { id: string }) => item.id)).not.toContain(
      requestId,
    );
    const recent = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/smart-pickup/recent-calls`)
      .set('Authorization', `Bearer ${parentToken}`)
      .expect(200);
    const recentItem = recent.body.data.find((item: { id: string }) => item.id === requestId);
    expect(recentItem).toEqual(expect.objectContaining({ status: 'handed_over' }));
    expect(JSON.stringify(recentItem)).not.toContain('pickupRecipient');
    expect(JSON.stringify(recentItem)).not.toContain('guardianId');
  });

  function getPickupRecipients(token: string, requestId: string) {
    return request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/${requestId}/pickup-recipients`)
      .set('Authorization', `Bearer ${token}`);
  }

  async function getPickupRecipientToken(
    token: string,
    requestId: string,
    index = 0,
  ): Promise<string> {
    const response = await getPickupRecipients(token, requestId).expect(200);
    assertNoRecipientLeak(response.body);
    expect(response.body.recipients[index]?.pickupRecipientToken).toEqual(
      expect.any(String),
    );
    return response.body.recipients[index].pickupRecipientToken as string;
  }

  function deliver(token: string, requestId: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/requests/${requestId}/deliver`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  async function expectFailedDeliveryWithoutSideEffects(params: {
    requestId: string;
    body: Record<string, unknown>;
    expectedStatus: number;
    expectedCode: string;
  }) {
    const eventsBefore = await countStatusEvents(params.requestId);
    const auditsBefore = await countDeliveryAudits(params.requestId);
    const notificationsBefore = await prisma.communicationNotification.count({
      where: { schoolId: schoolAId, sourceId: params.requestId },
    });
    const publishesBefore = publishSpy.mock.calls.length;

    const response = await deliver(adminAToken, params.requestId, params.body).expect(
      params.expectedStatus,
    );
    expect(response.body?.error?.code).toBe(params.expectedCode);
    await expect(getRequestStatus(params.requestId)).resolves.toBe(
      DismissalRequestStatus.READY,
    );
    await expect(countStatusEvents(params.requestId)).resolves.toBe(eventsBefore);
    await expect(countDeliveryAudits(params.requestId)).resolves.toBe(auditsBefore);
    await expect(
      prisma.communicationNotification.count({
        where: { schoolId: schoolAId, sourceId: params.requestId },
      }),
    ).resolves.toBe(notificationsBefore);
    expect(publishSpy.mock.calls.length).toBe(publishesBefore);
  }

  async function countStatusEvents(requestId: string): Promise<number> {
    return prisma.dismissalRequestEvent.count({
      where: {
        requestId,
        type: DismissalRequestEventType.REQUEST_STATUS_CHANGED,
      },
    });
  }

  async function countDeliveryAudits(requestId: string): Promise<number> {
    return prisma.auditLog.count({
      where: {
        resourceId: requestId,
        action: 'dismissal.request.delivered',
        outcome: AuditOutcome.SUCCESS,
      },
    });
  }

  async function getRequestStatus(
    requestId: string,
  ): Promise<DismissalRequestStatus> {
    const requestRecord = await prisma.dismissalRequest.findUniqueOrThrow({
      where: { id: requestId },
      select: { status: true },
    });
    return requestRecord.status;
  }

  async function setDelegatePolicy(allowDelegatePickup: boolean): Promise<void> {
    await prisma.dismissalSettings.update({
      where: { schoolId: schoolAId },
      data: { allowDelegatePickup, requirePickupCode: false },
    });
  }

  async function createReadyRequest(params: {
    schoolId: string;
    organizationId: string;
    classroomId: string;
    gateId: string;
    guardianId: string;
    requestedById: string;
    firstName: string;
    status?: DismissalRequestStatus;
    additionalGuardianIds?: string[];
    deletedAt?: Date | null;
    pickupCodeHash?: string | null;
    pickupCodeSalt?: string | null;
    pickupCodeIssuedAt?: Date | null;
  }): Promise<string> {
    const year = await prisma.academicYear.findFirstOrThrow({
      where: { schoolId: params.schoolId },
      select: { id: true },
    });
    const term = await prisma.term.findFirstOrThrow({
      where: { schoolId: params.schoolId },
      select: { id: true },
    });
    const student = await prisma.student.create({
      data: {
        schoolId: params.schoolId,
        organizationId: params.organizationId,
        firstName: params.firstName,
        lastName: 'Delivery',
        status: StudentStatus.ACTIVE,
      },
      select: { id: true },
    });
    await prisma.studentGuardian.createMany({
      data: [params.guardianId, ...(params.additionalGuardianIds ?? [])].map(
        (guardianId, index) => ({
          schoolId: params.schoolId,
          studentId: student.id,
          guardianId,
          isPrimary: index === 0,
        }),
      ),
    });
    const enrollment = await prisma.enrollment.create({
      data: {
        schoolId: params.schoolId,
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
        schoolId: params.schoolId,
        studentId: student.id,
        enrollmentId: enrollment.id,
        guardianId: params.guardianId,
        requestedById: params.requestedById,
        gateId: params.gateId,
        status: params.status ?? DismissalRequestStatus.READY,
        parentLatitude: 30.04442,
        parentLongitude: 31.235712,
        distanceMeters: 0,
        geofencePassed: true,
        requestedAt: new Date(Date.now() - 5 * 60_000),
        deletedAt: params.deletedAt ?? null,
        pickupCodeHash: params.pickupCodeHash ?? null,
        pickupCodeSalt: params.pickupCodeSalt ?? null,
        pickupCodeIssuedAt: params.pickupCodeIssuedAt ?? null,
      },
      select: { id: true },
    });
    await prisma.dismissalRequestEvent.create({
      data: {
        schoolId: params.schoolId,
        requestId: dismissalRequest.id,
        type: DismissalRequestEventType.REQUEST_CREATED,
        actorUserId: params.requestedById,
        statusTo: DismissalRequestStatus.REQUESTED,
      },
    });
    return dismissalRequest.id;
  }

  async function createSchoolFixture(label: string): Promise<{
    organizationId: string;
    schoolId: string;
  }> {
    const organization = await prisma.organization.create({
      data: {
        slug: `dismissal-delegate-${TEST_RUN_ID}-org-${label}`,
        name: `Dismissal Delegate Org ${label}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);

    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `dismissal-delegate-${TEST_RUN_ID}-school-${label}`,
        name: `Dismissal Delegate School ${label}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdSchoolIds.push(school.id);

    return { organizationId: organization.id, schoolId: school.id };
  }

  async function createAcademicFixture(label: string, schoolId: string) {
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId,
        nameAr: `delegate-year-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Delegate Year ${label}`,
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
        nameAr: `delegate-term-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Delegate Term ${label}`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-01-15T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    const stage = await prisma.stage.create({
      data: {
        schoolId,
        nameAr: `delegate-stage-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Delegate Stage ${label}`,
      },
      select: { id: true },
    });
    const grade = await prisma.grade.create({
      data: {
        schoolId,
        stageId: stage.id,
        nameAr: `delegate-grade-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Delegate Grade ${label}`,
      },
      select: { id: true },
    });
    const section = await prisma.section.create({
      data: {
        schoolId,
        gradeId: grade.id,
        nameAr: `delegate-section-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Delegate Section ${label}`,
      },
      select: { id: true },
    });
    const classroom = await prisma.classroom.create({
      data: {
        schoolId,
        sectionId: section.id,
        nameAr: `delegate-classroom-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Delegate Classroom ${label}`,
      },
      select: { id: true },
    });

    return { classroomId: classroom.id, termId: term.id };
  }

  async function createGate(
    schoolId: string,
    marker: string,
    status: DismissalGateOperationalStatus,
  ): Promise<string> {
    const gate = await prisma.dismissalGate.create({
      data: {
        schoolId,
        code: `DLG-${marker}-${TEST_RUN_ID}`,
        name: `Delegate Gate ${marker}`,
        status,
        isActive: true,
      },
      select: { id: true },
    });
    return gate.id;
  }

  async function createUserWithMembership(params: {
    email: string;
    schoolId: string;
    organizationId: string;
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
            schoolId: params.schoolId,
            organizationId: params.organizationId,
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
    schoolId: string;
    organizationId: string;
    userId: string | null;
    firstName: string;
    lastName: string;
    relation: string;
    phone: string;
    canPickup: boolean;
  }): Promise<string> {
    const guardian = await prisma.guardian.create({
      data: {
        schoolId: params.schoolId,
        organizationId: params.organizationId,
        userId: params.userId,
        firstName: params.firstName,
        lastName: params.lastName,
        relation: params.relation,
        phone: params.phone,
        canPickup: params.canPickup,
        canReceiveNotifications: true,
      },
      select: { id: true },
    });
    return guardian.id;
  }

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: PASSWORD })
      .expect(200);

    return response.body.accessToken as string;
  }
});

function assertNoRecipientLeak(body: unknown): void {
  const serialized = JSON.stringify(body);
  expect(serialized).not.toContain('guardianId');
  expect(serialized).not.toContain('studentGuardianId');
  expect(serialized).not.toContain('requestedById');
  expect(serialized).not.toContain('schoolId');
  expect(serialized).not.toContain('01011112222');
  expect(serialized).not.toContain('01033334444');
  expect(serialized).not.toContain('01055556666');
  expect(serialized).not.toContain('01077778888');
}

function assertNoDeliveryLeak(body: unknown): void {
  const serialized = JSON.stringify(body);
  expect(serialized).not.toContain('pickupRecipientToken');
  expect(serialized).not.toContain('guardianId');
  expect(serialized).not.toContain('studentGuardianId');
  expect(serialized).not.toContain('requestedById');
  expect(serialized).not.toContain('schoolId');
  expect(serialized).not.toContain('pickupCodeHash');
  expect(serialized).not.toContain('pickupCodeSalt');
}

function makeExpiredPickupRecipientToken(token: string): string {
  const [body] = token.split('.');
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
    issuedAt: number;
  };
  payload.issuedAt -= 16 * 60;
  const expiredBody = Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64url',
  );
  const signature = createHmac('sha256', process.env.JWT_ACCESS_SECRET ?? '')
    .update(expiredBody)
    .digest('base64url');

  return `${expiredBody}.${signature}`;
}

function makeNonCanonicalPickupRecipientToken(token: string): string {
  const [body, signature] = token.split('.');
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const lastCharacter = signature.at(-1);
  const lastCharacterIndex = lastCharacter
    ? alphabet.indexOf(lastCharacter)
    : -1;

  if (lastCharacterIndex < 0 || (lastCharacterIndex & 0b11) !== 0) {
    throw new Error(
      'Expected a canonical unpadded SHA-256 Base64URL signature',
    );
  }

  const aliasedSignature = `${signature.slice(0, -1)}${alphabet[lastCharacterIndex + 1]}`;
  expect(aliasedSignature).not.toBe(signature);
  expect(Buffer.from(aliasedSignature, 'base64url')).toEqual(
    Buffer.from(signature, 'base64url'),
  );

  return `${body}.${aliasedSignature}`;
}
