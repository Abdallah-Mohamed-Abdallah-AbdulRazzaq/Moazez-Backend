import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AppDeviceTokenSurface,
  CommunicationNotificationDeliveryChannel,
  CommunicationNotificationDeliveryStatus,
  CommunicationNotificationSourceModule,
  CommunicationNotificationType,
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
import { FirebasePushProvider } from '../../src/infrastructure/push/firebase/firebase-push.provider';
import { CommunicationNotificationPushDeliveryService } from '../../src/modules/communication/application/communication-notification-push-delivery.service';
import { CommunicationNotificationPushQueueService } from '../../src/modules/communication/application/communication-notification-push-queue.service';
import { ExpireDismissalRequestsUseCase } from '../../src/modules/dismissal/requests/application/expire-dismissal-requests.use-case';

const GLOBAL_PREFIX = '/api/v1';
const PASSWORD = 'DismissalPush123!';
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

type PushQueueMock = Pick<
  CommunicationNotificationPushQueueService,
  'enqueueNotificationPushDelivery'
> & {
  enqueueNotificationPushDelivery: jest.Mock;
};

type FirebasePushProviderMock = Pick<FirebasePushProvider, 'sendBatch'> & {
  sendBatch: jest.Mock;
};

describe('DISMISSAL-NOTIFICATIONS-1B push delivery and device tokens (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let pushQueue: PushQueueMock;
  let firebasePushProvider: FirebasePushProviderMock;
  let pushDeliveryService: CommunicationNotificationPushDeliveryService;
  let expiryUseCase: ExpireDismissalRequestsUseCase;

  let organizationId: string;
  let crossOrganizationId: string;
  let schoolId: string;
  let crossSchoolId: string;
  let classroomId: string;
  let gateId: string;
  let alternateGateId: string;
  let crossGateId: string;
  let parentUserId: string;
  let parentGuardianId: string;
  let staffAssignedId: string;
  let staffUnassignedId: string;
  let adminToken: string;
  let parentToken: string;
  let staffAssignedToken: string;
  let teacherToken: string;
  let studentToken: string;
  const createdUserIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdOrganizationIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [
      schoolAdminRole,
      parentRole,
      dismissalStaffRole,
      teacherRole,
      studentRole,
    ] = await Promise.all([
      findSystemRole('school_admin'),
      findSystemRole('parent'),
      findSystemRole('dismissal_staff'),
      findSystemRole('teacher'),
      findSystemRole('student'),
    ]);

    const fixture = await createSchoolFixture('a');
    const crossFixture = await createSchoolFixture('b');
    organizationId = fixture.organizationId;
    schoolId = fixture.schoolId;
    crossOrganizationId = crossFixture.organizationId;
    crossSchoolId = crossFixture.schoolId;

    classroomId = (await createAcademicFixture(schoolId, 'a')).classroomId;
    await createAcademicFixture(crossSchoolId, 'b');
    gateId = await createGate(schoolId, `PUSH-A-${TEST_RUN_ID}`, 'Main Gate');
    alternateGateId = await createGate(
      schoolId,
      `PUSH-ALT-${TEST_RUN_ID}`,
      'Alternate Gate',
    );
    crossGateId = await createGate(
      crossSchoolId,
      `PUSH-B-${TEST_RUN_ID}`,
      'Cross Gate',
    );
    await createDismissalSettings(schoolId, gateId);
    await createDismissalSettings(crossSchoolId, crossGateId);

    const admin = await createUserWithMembership({
      email: `dismissal-push-${TEST_RUN_ID}-admin@moazez.local`,
      schoolId,
      organizationId,
      roleId: schoolAdminRole.id,
      userType: UserType.SCHOOL_USER,
      firstName: 'Push',
      lastName: 'Admin',
    });
    const parent = await createUserWithMembership({
      email: `dismissal-push-${TEST_RUN_ID}-parent@moazez.local`,
      schoolId,
      organizationId,
      roleId: parentRole.id,
      userType: UserType.PARENT,
      firstName: 'Push',
      lastName: 'Parent',
    });
    const staffAssigned = await createUserWithMembership({
      email: `dismissal-push-${TEST_RUN_ID}-staff@moazez.local`,
      schoolId,
      organizationId,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
      firstName: 'Assigned',
      lastName: 'Staff',
    });
    const staffUnassigned = await createUserWithMembership({
      email: `dismissal-push-${TEST_RUN_ID}-unassigned@moazez.local`,
      schoolId,
      organizationId,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
      firstName: 'Unassigned',
      lastName: 'Staff',
    });
    const teacher = await createUserWithMembership({
      email: `dismissal-push-${TEST_RUN_ID}-teacher@moazez.local`,
      schoolId,
      organizationId,
      roleId: teacherRole.id,
      userType: UserType.TEACHER,
      firstName: 'Push',
      lastName: 'Teacher',
    });
    const studentUser = await createUserWithMembership({
      email: `dismissal-push-${TEST_RUN_ID}-student@moazez.local`,
      schoolId,
      organizationId,
      roleId: studentRole.id,
      userType: UserType.STUDENT,
      firstName: 'Push',
      lastName: 'Student',
    });

    parentUserId = parent.userId;
    staffAssignedId = staffAssigned.userId;
    staffUnassignedId = staffUnassigned.userId;
    parentGuardianId = await createGuardian({
      schoolId,
      organizationId,
      userId: parentUserId,
    });

    await prisma.dismissalStaffAssignment.create({
      data: {
        schoolId,
        staffUserId: staffAssignedId,
        gateId,
        isActive: true,
      },
    });

    pushQueue = {
      enqueueNotificationPushDelivery: jest.fn().mockResolvedValue(undefined),
    };
    firebasePushProvider = {
      sendBatch: jest.fn().mockResolvedValue(sentPushResult()),
    };
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CommunicationNotificationPushQueueService)
      .useValue(pushQueue)
      .overrideProvider(FirebasePushProvider)
      .useValue(firebasePushProvider)
      .compile();

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

    pushDeliveryService = app.get(CommunicationNotificationPushDeliveryService);
    expiryUseCase = app.get(ExpireDismissalRequestsUseCase);
    adminToken = await login(admin.email);
    parentToken = await login(parent.email);
    staffAssignedToken = await login(staffAssigned.email);
    teacherToken = await login(teacher.email);
    studentToken = await login(studentUser.email);
  });

  beforeEach(async () => {
    await clearRuntimeState();
    pushQueue.enqueueNotificationPushDelivery.mockClear();
    firebasePushProvider.sendBatch.mockClear();
    firebasePushProvider.sendBatch.mockResolvedValue(sentPushResult());
  });

  afterAll(async () => {
    try {
      const schoolIds = [schoolId, crossSchoolId].filter(Boolean);
      await clearRuntimeState();
      await prisma.appDeviceToken.deleteMany({
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
      await prisma.enrollment.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.student.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.guardian.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.classroom.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.section.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.grade.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.stage.deleteMany({ where: { schoolId: { in: schoolIds } } });
      await prisma.term.deleteMany({ where: { schoolId: { in: schoolIds } } });
      await prisma.academicYear.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.membership.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      await prisma.school.deleteMany({ where: { id: { in: createdSchoolIds } } });
      await prisma.organization.deleteMany({
        where: { id: { in: createdOrganizationIds } },
      });
    } finally {
      await app?.close();
      await prisma.$disconnect();
    }
  });

  it('registers Dismissal Staff device tokens idempotently and rejects non-staff actors', async () => {
    const token = `staff-token-${TEST_RUN_ID}-same`;
    const first = await registerDismissalStaffToken(token).expect(201);
    const second = await registerDismissalStaffToken(token).expect(201);

    expect(first.body).toMatchObject({
      deviceTokenId: expect.any(String),
      appSurface: 'dismissal_staff',
      platform: 'ios',
      isActive: true,
    });
    expect(second.body.deviceTokenId).toBe(first.body.deviceTokenId);
    expect(JSON.stringify(first.body)).not.toContain(token);

    await expect(
      prisma.appDeviceToken.findUniqueOrThrow({
        where: { id: first.body.deviceTokenId },
        select: { appSurface: true, userId: true, schoolId: true },
      }),
    ).resolves.toEqual({
      appSurface: AppDeviceTokenSurface.DISMISSAL_STAFF,
      userId: staffAssignedId,
      schoolId,
    });

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/notifications/device-tokens`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send(registerTokenBody(`parent-denied-${TEST_RUN_ID}`))
      .expect(403)
      .expect((response) => {
        expect(JSON.stringify(response.body)).toContain(
          'dismissal.notification.invalid_actor_type',
        );
      });
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/notifications/device-tokens`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send(registerTokenBody(`teacher-denied-${TEST_RUN_ID}`))
      .expect(403);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/notifications/device-tokens`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send(registerTokenBody(`student-denied-${TEST_RUN_ID}`))
      .expect(403);
  });

  it('enqueues and sends safe staff push for request create and cancel without duplicates', async () => {
    await registerDismissalStaffToken(`staff-token-${TEST_RUN_ID}-created`).expect(
      201,
    );
    const child = await createChild({
      firstName: 'Staff',
      lastName: 'Push',
    });
    const clientRequestId = randomUUID();

    const created = await createParentRequest(child.studentId, clientRequestId)
      .expect(201);
    const requestId = created.body.request.id as string;

    expect(pushQueue.enqueueNotificationPushDelivery).toHaveBeenCalledTimes(1);
    await expectPushDeliveryCount({
      recipientUserId: staffAssignedId,
      type: CommunicationNotificationType.DISMISSAL_REQUEST_CREATED,
      expected: 1,
    });
    await expectPushDeliveryCount({
      recipientUserId: staffUnassignedId,
      type: CommunicationNotificationType.DISMISSAL_REQUEST_CREATED,
      expected: 0,
    });

    await processPushDelivery({
      recipientUserId: staffAssignedId,
      type: CommunicationNotificationType.DISMISSAL_REQUEST_CREATED,
      requestId,
      expectedData: {
        module: 'dismissal',
        surface: 'dismissal_staff',
        type: 'request_created',
        requestId,
        status: 'requested',
        screen: 'dismissal.notifications',
      },
    });

    await createParentRequest(child.studentId, clientRequestId).expect(201);
    await expectPushDeliveryCount({
      recipientUserId: staffAssignedId,
      type: CommunicationNotificationType.DISMISSAL_REQUEST_CREATED,
      expected: 1,
    });

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/smart-pickup/requests/${requestId}/cancel`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({ note: 'changed plans' })
      .expect(201);
    await expectPushDeliveryCount({
      recipientUserId: staffAssignedId,
      type: CommunicationNotificationType.DISMISSAL_REQUEST_CANCELLED,
      expected: 1,
    });

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/smart-pickup/requests/${requestId}/cancel`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({})
      .expect(201);
    await expectPushDeliveryCount({
      recipientUserId: staffAssignedId,
      type: CommunicationNotificationType.DISMISSAL_REQUEST_CANCELLED,
      expected: 1,
    });

    const noMatchChild = await createChild({
      firstName: 'No',
      lastName: 'Match',
    });
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/smart-pickup/requests`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        childId: noMatchChild.studentId,
        gateId: alternateGateId,
        latitude: SCHOOL_LATITUDE,
        longitude: SCHOOL_LONGITUDE,
        clientRequestId: randomUUID(),
      })
      .expect(201);
    await expectPushDeliveryCount({
      recipientUserId: staffAssignedId,
      type: CommunicationNotificationType.DISMISSAL_REQUEST_CREATED,
      expected: 1,
    });
  });

  it('enqueues and sends safe parent push for status, delivery, and expiry events', async () => {
    await createChild({ firstName: 'Parent', lastName: 'Token' });
    await registerParentToken(`parent-token-${TEST_RUN_ID}`).expect(201);
    const calledRequestId = await createRequestViaParent('Called');

    await patchStatus(calledRequestId, 'called').expect(200);
    await processPushDelivery({
      recipientUserId: parentUserId,
      type: CommunicationNotificationType.DISMISSAL_REQUEST_CALLED,
      requestId: calledRequestId,
      expectedData: {
        module: 'parent_smart_pickup',
        surface: 'parent',
        type: 'request_called',
        requestId: calledRequestId,
        status: 'called',
        screen: 'parent.smart_pickup.recent_calls',
      },
    });

    await patchStatus(calledRequestId, 'called').expect(200);
    await expectPushDeliveryCount({
      recipientUserId: parentUserId,
      type: CommunicationNotificationType.DISMISSAL_REQUEST_CALLED,
      expected: 1,
    });

    const readyRequestId = await createRequestViaParent('Ready');
    await patchStatus(readyRequestId, 'called').expect(200);
    await patchStatus(readyRequestId, 'at_gate').expect(200);
    await patchStatus(readyRequestId, 'ready').expect(200);
    await processPushDelivery({
      recipientUserId: parentUserId,
      type: CommunicationNotificationType.DISMISSAL_REQUEST_READY,
      requestId: readyRequestId,
      expectedData: {
        module: 'parent_smart_pickup',
        surface: 'parent',
        type: 'request_ready',
        requestId: readyRequestId,
        status: 'ready',
        screen: 'parent.smart_pickup.recent_calls',
      },
    });

    const deliveredRequest = await createRequestViaParentWithPickupCode(
      'Delivered',
    );
    await patchStatus(deliveredRequest.id, 'called').expect(200);
    await patchStatus(deliveredRequest.id, 'at_gate').expect(200);
    await patchStatus(deliveredRequest.id, 'ready').expect(200);
    const pickupRecipientToken = await getPickupRecipientToken(deliveredRequest.id);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/requests/${deliveredRequest.id}/deliver`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        pickupCode: deliveredRequest.pickupCode,
        pickupRecipientToken,
      })
      .expect(201);
    await processPushDelivery({
      recipientUserId: parentUserId,
      type: CommunicationNotificationType.DISMISSAL_REQUEST_HANDED_OVER,
      requestId: deliveredRequest.id,
      forbiddenText: [deliveredRequest.pickupCode, pickupRecipientToken],
      expectedData: {
        module: 'parent_smart_pickup',
        surface: 'parent',
        type: 'request_handed_over',
        requestId: deliveredRequest.id,
        status: 'handed_over',
        screen: 'parent.smart_pickup.recent_calls',
      },
    });

    const expiredRequestId = await createDirectRequest({
      label: 'Expired',
      status: DismissalRequestStatus.REQUESTED,
      requestedAt: new Date(Date.now() - 10 * 60_000),
    });
    await expiryUseCase.runOnce({ now: new Date(), batchSize: 25 });
    await processPushDelivery({
      recipientUserId: parentUserId,
      type: CommunicationNotificationType.DISMISSAL_REQUEST_EXPIRED,
      requestId: expiredRequestId,
      expectedData: {
        module: 'parent_smart_pickup',
        surface: 'parent',
        type: 'request_expired',
        requestId: expiredRequestId,
        status: 'expired',
        screen: 'parent.smart_pickup.recent_calls',
      },
    });
    await expiryUseCase.runOnce({ now: new Date(), batchSize: 25 });
    await expectPushDeliveryCount({
      recipientUserId: parentUserId,
      type: CommunicationNotificationType.DISMISSAL_REQUEST_EXPIRED,
      expected: 1,
    });

    const beforeReadDeliveryCount = await currentSchoolPushDeliveryCount();
    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/notifications/read-all`)
      .set('Authorization', `Bearer ${staffAssignedToken}`)
      .expect(200);
    await expect(currentSchoolPushDeliveryCount()).resolves.toBe(
      beforeReadDeliveryCount,
    );
  });

  it('does not roll back notification creation when provider marks a token invalid', async () => {
    const registered = await registerDismissalStaffToken(
      `staff-invalid-${TEST_RUN_ID}`,
    ).expect(201);
    const child = await createChild({
      firstName: 'Invalid',
      lastName: 'Token',
    });
    const created = await createParentRequest(child.studentId, randomUUID()).expect(
      201,
    );
    const requestId = created.body.request.id as string;
    firebasePushProvider.sendBatch.mockResolvedValueOnce({
      status: 'failed',
      provider: 'firebase_fcm',
      successCount: 0,
      failureCount: 1,
      results: [
        {
          tokenIndex: 0,
          status: 'failed',
          errorCode: 'fcm/registration-token-not-registered',
          errorMessage: 'Firebase push send failed',
        },
      ],
    });

    await processPushDelivery({
      recipientUserId: staffAssignedId,
      type: CommunicationNotificationType.DISMISSAL_REQUEST_CREATED,
      requestId,
      skipProviderPayloadAssertion: true,
    });

    await expectPushDeliveryCount({
      recipientUserId: staffAssignedId,
      type: CommunicationNotificationType.DISMISSAL_REQUEST_CREATED,
      expected: 1,
    });
    await expect(
      prisma.appDeviceToken.findUniqueOrThrow({
        where: { id: registered.body.deviceTokenId },
        select: { isActive: true, revokedAt: true, lastFailureCode: true },
      }),
    ).resolves.toMatchObject({
      isActive: false,
      revokedAt: expect.any(Date),
      lastFailureCode: 'fcm/registration-token-not-registered',
    });
  });

  function registerDismissalStaffToken(token: string) {
    return request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/notifications/device-tokens`)
      .set('Authorization', `Bearer ${staffAssignedToken}`)
      .send(registerTokenBody(token));
  }

  function registerParentToken(token: string) {
    return request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/notifications/device-tokens`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send(registerTokenBody(token));
  }

  function registerTokenBody(token: string) {
    return {
      token,
      platform: 'ios',
      deviceId: `device-${token}`,
      appVersion: '1.0.0',
      locale: 'en',
      timezone: 'Africa/Cairo',
    };
  }

  function createParentRequest(childId: string, clientRequestId: string) {
    return request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/smart-pickup/requests`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        childId,
        gateId,
        latitude: SCHOOL_LATITUDE,
        longitude: SCHOOL_LONGITUDE,
        clientRequestId,
      });
  }

  async function createRequestViaParent(label: string): Promise<string> {
    const child = await createChild({ firstName: 'Parent', lastName: label });
    const response = await createParentRequest(child.studentId, randomUUID()).expect(
      201,
    );
    return response.body.request.id as string;
  }

  async function createRequestViaParentWithPickupCode(
    label: string,
  ): Promise<{ id: string; pickupCode: string }> {
    const child = await createChild({ firstName: 'Parent', lastName: label });
    const response = await createParentRequest(child.studentId, randomUUID()).expect(
      201,
    );
    return {
      id: response.body.request.id as string,
      pickupCode: response.body.pickup.pickupCode as string,
    };
  }

  function patchStatus(requestId: string, status: string) {
    return request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/requests/${requestId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status });
  }

  async function getPickupRecipientToken(requestId: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/${requestId}/pickup-recipients`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    return response.body.recipients[0].pickupRecipientToken as string;
  }

  async function processPushDelivery(params: {
    recipientUserId: string;
    type: CommunicationNotificationType;
    requestId: string;
    expectedData?: Record<string, string>;
    forbiddenText?: string[];
    skipProviderPayloadAssertion?: boolean;
  }): Promise<void> {
    const delivery =
      await prisma.communicationNotificationDelivery.findFirstOrThrow({
        where: {
          schoolId,
          channel: CommunicationNotificationDeliveryChannel.PUSH,
          notification: {
            recipientUserId: params.recipientUserId,
            sourceModule: CommunicationNotificationSourceModule.DISMISSAL,
            sourceType: 'dismissal_request',
            sourceId: params.requestId,
            type: params.type,
          },
        },
        select: { id: true },
      });

    const result = await pushDeliveryService.processDelivery({
      schoolId,
      deliveryId: delivery.id,
    });
    expect(['sent', 'failed', 'skipped']).toContain(result.status);

    if (params.skipProviderPayloadAssertion) return;
    const payload = firebasePushProvider.sendBatch.mock.calls.at(-1)?.[0];
    expect(payload).toBeDefined();
    expect(payload.data).toMatchObject({
      notificationId: expect.any(String),
      ...(params.expectedData ?? {}),
    });
    expect(payload.notification).toMatchObject({
      title: expect.any(String),
      body: expect.any(String),
    });
    expectNoForbiddenPushPayload(payload, params.forbiddenText ?? []);
  }

  async function expectPushDeliveryCount(params: {
    recipientUserId: string;
    type: CommunicationNotificationType;
    expected: number;
  }): Promise<void> {
    await expect(
      prisma.communicationNotificationDelivery.count({
        where: {
          schoolId,
          channel: CommunicationNotificationDeliveryChannel.PUSH,
          notification: {
            recipientUserId: params.recipientUserId,
            sourceModule: CommunicationNotificationSourceModule.DISMISSAL,
            type: params.type,
          },
        },
      }),
    ).resolves.toBe(params.expected);
  }

  function currentSchoolPushDeliveryCount(): Promise<number> {
    return prisma.communicationNotificationDelivery.count({
      where: {
        schoolId,
        channel: CommunicationNotificationDeliveryChannel.PUSH,
      },
    });
  }

  async function clearRuntimeState(): Promise<void> {
    const schoolIds = [schoolId, crossSchoolId].filter(Boolean);
    await prisma.communicationNotificationPushAttempt.deleteMany({
      where: { schoolId: { in: schoolIds } },
    });
    await prisma.communicationNotificationDelivery.deleteMany({
      where: { schoolId: { in: schoolIds } },
    });
    await prisma.communicationNotification.deleteMany({
      where: { schoolId: { in: schoolIds } },
    });
    await prisma.dismissalRequestEvent.deleteMany({
      where: { schoolId: { in: schoolIds } },
    });
    await prisma.dismissalRequest.deleteMany({
      where: { schoolId: { in: schoolIds } },
    });
    await prisma.appDeviceToken.deleteMany({
      where: { schoolId: { in: schoolIds } },
    });
    await prisma.auditLog.deleteMany({ where: { schoolId: { in: schoolIds } } });
    await prisma.studentGuardian.deleteMany({
      where: { schoolId: { in: schoolIds } },
    });
    await prisma.enrollment.deleteMany({
      where: { schoolId: { in: schoolIds } },
    });
    await prisma.student.deleteMany({
      where: { schoolId: { in: schoolIds } },
    });
  }

  async function createSchoolFixture(label: string) {
    const organization = await prisma.organization.create({
      data: {
        slug: `dismissal-push-${TEST_RUN_ID}-org-${label}`,
        name: `Dismissal Push Org ${label}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);

    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `dismissal-push-${TEST_RUN_ID}-school-${label}`,
        name: `Dismissal Push School ${label}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdSchoolIds.push(school.id);

    return { organizationId: organization.id, schoolId: school.id };
  }

  async function createAcademicFixture(schoolIdValue: string, label: string) {
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId: schoolIdValue,
        nameAr: `push-year-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Push Year ${label}`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-06-30T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    const term = await prisma.term.create({
      data: {
        schoolId: schoolIdValue,
        academicYearId: academicYear.id,
        nameAr: `push-term-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Push Term ${label}`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-01-15T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    expect(term.id).toBeTruthy();
    const stage = await prisma.stage.create({
      data: {
        schoolId: schoolIdValue,
        nameAr: `push-stage-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Push Stage ${label}`,
      },
      select: { id: true },
    });
    const grade = await prisma.grade.create({
      data: {
        schoolId: schoolIdValue,
        stageId: stage.id,
        nameAr: `push-grade-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Push Grade ${label}`,
      },
      select: { id: true },
    });
    const section = await prisma.section.create({
      data: {
        schoolId: schoolIdValue,
        gradeId: grade.id,
        nameAr: `push-section-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Push Section ${label}`,
      },
      select: { id: true },
    });
    const classroom = await prisma.classroom.create({
      data: {
        schoolId: schoolIdValue,
        sectionId: section.id,
        nameAr: `push-classroom-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Push Classroom ${label}`,
      },
      select: { id: true },
    });
    return { classroomId: classroom.id };
  }

  async function createGate(schoolIdValue: string, code: string, name: string) {
    const gate = await prisma.dismissalGate.create({
      data: {
        schoolId: schoolIdValue,
        code,
        name,
        status: DismissalGateOperationalStatus.OPEN,
        isActive: true,
      },
      select: { id: true },
    });
    return gate.id;
  }

  async function createDismissalSettings(
    schoolIdValue: string,
    gateIdValue: string,
  ): Promise<void> {
    await prisma.dismissalSettings.create({
      data: {
        schoolId: schoolIdValue,
        enabled: true,
        timezone: 'Africa/Cairo',
        schoolLatitude: SCHOOL_LATITUDE,
        schoolLongitude: SCHOOL_LONGITUDE,
        allowedRadiusMeters: 500,
        requestWindowStartLocal: '00:00',
        requestWindowEndLocal: '23:59',
        delayThresholdMinutes: 1,
        urgentThresholdMinutes: 2,
        expiryThresholdMinutes: 1,
        requirePickupCode: true,
        allowDelegatePickup: true,
        allowParentCancelBeforeCalled: true,
        defaultGateId: gateIdValue,
      },
    });
  }

  async function createUserWithMembership(params: {
    email: string;
    schoolId: string;
    organizationId: string;
    roleId: string;
    userType: UserType;
    firstName: string;
    lastName: string;
  }) {
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
    userId: string;
  }) {
    const guardian = await prisma.guardian.create({
      data: {
        schoolId: params.schoolId,
        organizationId: params.organizationId,
        userId: params.userId,
        firstName: 'Push',
        lastName: 'Guardian',
        relation: 'guardian',
        phone: `010-${TEST_RUN_ID}`,
        canPickup: true,
        canReceiveNotifications: true,
      },
      select: { id: true },
    });
    return guardian.id;
  }

  async function createChild(params: { firstName: string; lastName: string }) {
    const [academicYear, term] = await Promise.all([
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
        guardianId: parentGuardianId,
        isPrimary: true,
      },
    });
    const enrollment = await prisma.enrollment.create({
      data: {
        schoolId,
        studentId: student.id,
        academicYearId: academicYear.id,
        termId: term.id,
        classroomId,
        status: StudentEnrollmentStatus.ACTIVE,
        enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
      },
      select: { id: true },
    });
    return { studentId: student.id, enrollmentId: enrollment.id };
  }

  async function createDirectRequest(params: {
    label: string;
    status: DismissalRequestStatus;
    requestedAt?: Date;
  }): Promise<string> {
    const child = await createChild({
      firstName: 'Direct',
      lastName: params.label,
    });
    const dismissalRequest = await prisma.dismissalRequest.create({
      data: {
        schoolId,
        studentId: child.studentId,
        enrollmentId: child.enrollmentId,
        guardianId: parentGuardianId,
        requestedById: parentUserId,
        gateId,
        status: params.status,
        clientRequestId: `push-direct-${TEST_RUN_ID}-${randomUUID()}`,
        parentLatitude: SCHOOL_LATITUDE,
        parentLongitude: SCHOOL_LONGITUDE,
        distanceMeters: 0,
        geofencePassed: true,
        requestedAt: params.requestedAt ?? new Date(),
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
});

function sentPushResult() {
  return {
    status: 'sent',
    provider: 'firebase_fcm',
    successCount: 1,
    failureCount: 0,
    results: [
      {
        tokenIndex: 0,
        status: 'sent',
        providerMessageId: 'firebase-message-1',
      },
    ],
  };
}

function expectNoForbiddenPushPayload(
  payload: unknown,
  forbiddenText: string[],
): void {
  const json = JSON.stringify(payload);
  for (const forbiddenKey of [
    'schoolId',
    'organizationId',
    'membershipId',
    'roleId',
    'guardianId',
    'studentGuardianId',
    'studentUserId',
    'studentApplicationId',
    'enrollmentId',
    'requestedById',
    'actorUserId',
    'staffUserId',
    'assignmentId',
    'pickupCode',
    'pickupCodeHash',
    'pickupCodeSalt',
    'pickupRecipientToken',
    'parentLatitude',
    'parentLongitude',
    'distanceMeters',
    'geofencePassed',
    'clientRequestId',
    'deletedAt',
    'rawMetadata',
    'socketRoom',
    'socketId',
    'tokenHash',
    'tokenCiphertext',
  ]) {
    expect(json).not.toContain(`"${forbiddenKey}"`);
  }
  for (const forbidden of forbiddenText) {
    expect(json).not.toContain(forbidden);
  }
}
