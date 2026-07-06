import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  CommunicationNotificationType,
  CommunicationNotificationSourceModule,
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
import { REALTIME_SERVER_EVENTS } from '../../src/infrastructure/realtime/realtime-event-names';
import { RealtimePublisherService } from '../../src/infrastructure/realtime/realtime-publisher.service';

const GLOBAL_PREFIX = '/api/v1';
const PASSWORD = 'DismissalGoldenPath123!';
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

type PublishSpy = jest.SpyInstance<
  boolean,
  [schoolId: string, userId: string, eventName: string, payload: unknown]
>;

describe('DISMISSAL-E2E-1A full golden path smoke suite (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let organizationId: string;
  let schoolId: string;
  let classroomId: string;
  let gateId: string;
  let parentUserId: string;
  let guardianId: string;
  let staffUserId: string;
  let primaryChildId: string;
  let cancelChildId: string;
  let escalationChildId: string;
  let parentToken: string;
  let staffToken: string;
  const createdUserIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdOrganizationIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [parentRole, dismissalStaffRole] = await Promise.all([
      findSystemRole('parent'),
      findSystemRole('dismissal_staff'),
    ]);

    const fixture = await createSchoolFixture();
    organizationId = fixture.organizationId;
    schoolId = fixture.schoolId;
    classroomId = (await createAcademicFixture()).classroomId;
    gateId = await createGate();

    const parent = await createUserWithMembership({
      email: `dismissal-golden-${TEST_RUN_ID}-parent@moazez.local`,
      roleId: parentRole.id,
      userType: UserType.PARENT,
      firstName: 'Golden',
      lastName: 'Parent',
    });
    const staff = await createUserWithMembership({
      email: `dismissal-golden-${TEST_RUN_ID}-staff@moazez.local`,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
      firstName: 'Golden',
      lastName: 'Staff',
    });
    parentUserId = parent.userId;
    staffUserId = staff.userId;

    guardianId = await createGuardian({
      userId: parentUserId,
      firstName: 'Golden',
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
        lastName: 'Golden',
        extraGuardianIds: [delegateGuardianId],
      })
    ).studentId;
    cancelChildId = (
      await createStudentFixture({
        firstName: 'Cancel',
        lastName: 'Golden',
      })
    ).studentId;
    escalationChildId = (
      await createStudentFixture({
        firstName: 'Escalate',
        lastName: 'Golden',
      })
    ).studentId;

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
        staffUserId,
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

  it('runs the complete parent request to verified handover golden path', async () => {
    const spy = publisherSpy();
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
      schoolZone: {
        latitude: SCHOOL_LATITUDE,
        longitude: SCHOOL_LONGITUDE,
        radiusMeters: 500,
        source: 'settings',
      },
      summary: {
        availableGateCount: 1,
      },
    });
    expect(readiness.body.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: primaryChildId,
          canRequestPickup: true,
          pickupEligible: true,
          activeRequest: null,
        }),
      ]),
    );
    expect(readiness.body.gates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: gateId, status: 'open', isActive: true }),
      ]),
    );
    assertNoForbiddenFields(readiness.body);

    const create = await createParentRequest({
      childId: primaryChildId,
      clientRequestId: `golden-primary-${TEST_RUN_ID}`,
    }).expect(201);
    const requestId = create.body.request.id as string;
    const pickupCode = create.body.pickup.pickupCode as string;
    expect(create.body.request).toMatchObject({
      id: requestId,
      status: 'requested',
      isActive: true,
      isTerminal: false,
      canCancel: true,
      canTrack: true,
      child: { id: primaryChildId },
      gate: { id: gateId, status: 'open' },
      pickup: {
        codeRequired: true,
        codeIssued: true,
        code: expect.stringMatching(/^\d{6}$/),
      },
    });
    expect(pickupCode).toMatch(/^\d{6}$/);
    assertNoForbiddenFields(create.body, { allowRawPickupCode: true });
    expectPublished(
      spy,
      staffUserId,
      REALTIME_SERVER_EVENTS.DISMISSAL_REQUEST_CREATED,
    );
    expectPublished(spy, staffUserId, REALTIME_SERVER_EVENTS.DISMISSAL_QUEUE_CHANGED);
    expectPublished(
      spy,
      parentUserId,
      REALTIME_SERVER_EVENTS.PARENT_SMART_PICKUP_REQUEST_CHANGED,
    );
    expectPublished(
      spy,
      staffUserId,
      REALTIME_SERVER_EVENTS.DISMISSAL_NOTIFICATION_CREATED,
    );
    expectNoForbiddenPublishedPayloads(spy, pickupCode);

    const createdNotificationCount = await countNotifications({
      type: CommunicationNotificationType.DISMISSAL_REQUEST_CREATED,
      sourceId: requestId,
      recipientUserId: staffUserId,
    });
    expect(createdNotificationCount).toBe(1);
    const createdEventCount = await countRequestEvents(
      requestId,
      DismissalRequestEventType.REQUEST_CREATED,
    );
    expect(createdEventCount).toBe(1);

    spy.mockClear();
    const retry = await createParentRequest({
      childId: primaryChildId,
      clientRequestId: `golden-primary-${TEST_RUN_ID}`,
    }).expect(201);
    expect(retry.body.request.id).toBe(requestId);
    expect(JSON.stringify(retry.body)).not.toContain(pickupCode);
    expect(retry.body.request.pickup).not.toHaveProperty('code');
    expect(retry.body.pickup).not.toHaveProperty('pickupCode');
    assertNoForbiddenFields(retry.body);
    expect(spy).not.toHaveBeenCalled();
    await expect(
      countRequestEvents(requestId, DismissalRequestEventType.REQUEST_CREATED),
    ).resolves.toBe(createdEventCount);
    await expect(
      countNotifications({
        type: CommunicationNotificationType.DISMISSAL_REQUEST_CREATED,
        sourceId: requestId,
        recipientUserId: staffUserId,
      }),
    ).resolves.toBe(createdNotificationCount);

    const activeQueue = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/active`)
      .set('Authorization', `Bearer ${staffToken}`)
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
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    expect(detail.body.request).toMatchObject({
      id: requestId,
      status: 'requested',
    });
    expect(detail.body.request.timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'request_created', statusTo: 'requested' }),
      ]),
    );
    assertNoForbiddenFields(detail.body);

    spy.mockClear();
    const called = await patchStatus(requestId, 'called').expect(200);
    expect(called.body.request).toMatchObject({
      id: requestId,
      status: 'called',
      previousStatus: 'requested',
      changed: true,
    });
    assertNoForbiddenFields(called.body);
    expectStatusRealtime(spy, requestId, 'called');
    expectNoForbiddenPublishedPayloads(spy, pickupCode);
    await expectStatusEvent(requestId, DismissalRequestStatus.CALLED);
    await expectAudit('dismissal.request.status_changed', requestId);
    await expect(
      countNotifications({
        type: CommunicationNotificationType.DISMISSAL_REQUEST_CALLED,
        sourceId: requestId,
        recipientUserId: parentUserId,
      }),
    ).resolves.toBe(1);

    spy.mockClear();
    const moving = await patchStatus(requestId, 'moving').expect(200);
    expect(moving.body.request).toMatchObject({
      id: requestId,
      status: 'moving',
      previousStatus: 'called',
      changed: true,
    });
    assertNoForbiddenFields(moving.body);
    expectStatusRealtime(spy, requestId, 'moving');
    expectNoForbiddenPublishedPayloads(spy, pickupCode);
    await expectStatusEvent(requestId, DismissalRequestStatus.MOVING);

    const movingWaiting = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/waiting-students`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    expect(movingWaiting.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: requestId,
          status: 'moving',
          child: expect.objectContaining({ id: primaryChildId }),
          gate: expect.objectContaining({ id: gateId }),
        }),
      ]),
    );
    assertNoForbiddenFields(movingWaiting.body);

    spy.mockClear();
    const arrival = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/waiting-students/${requestId}/arrival`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ note: 'Golden path arrival' })
      .expect(201);
    expect(arrival.body.student).toMatchObject({
      id: requestId,
      status: 'at_gate',
      previousStatus: 'moving',
      changed: true,
      arrivalState: 'arrived',
    });
    assertNoForbiddenFields(arrival.body);
    expectPublished(
      spy,
      staffUserId,
      REALTIME_SERVER_EVENTS.DISMISSAL_REQUEST_ARRIVAL_CONFIRMED,
    );
    expectPublished(spy, staffUserId, REALTIME_SERVER_EVENTS.DISMISSAL_QUEUE_CHANGED);
    expectPublished(
      spy,
      parentUserId,
      REALTIME_SERVER_EVENTS.PARENT_SMART_PICKUP_REQUEST_CHANGED,
    );
    expectNoForbiddenPublishedPayloads(spy, pickupCode);
    await expectStatusEvent(requestId, DismissalRequestStatus.AT_GATE);
    await expectAudit('dismissal.waiting_student.arrival_confirmed', requestId);

    const atGateWaiting = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/waiting-students`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    expect(atGateWaiting.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: requestId, status: 'at_gate' }),
      ]),
    );
    assertNoForbiddenFields(atGateWaiting.body);

    spy.mockClear();
    const ready = await patchStatus(requestId, 'ready').expect(200);
    expect(ready.body.request).toMatchObject({
      id: requestId,
      status: 'ready',
      previousStatus: 'at_gate',
      changed: true,
    });
    assertNoForbiddenFields(ready.body);
    expectStatusRealtime(spy, requestId, 'ready');
    expectNoForbiddenPublishedPayloads(spy, pickupCode);
    await expectStatusEvent(requestId, DismissalRequestStatus.READY);
    await expect(
      countNotifications({
        type: CommunicationNotificationType.DISMISSAL_REQUEST_READY,
        sourceId: requestId,
        recipientUserId: parentUserId,
      }),
    ).resolves.toBe(1);

    const recentReady = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/smart-pickup/recent-calls`)
      .set('Authorization', `Bearer ${parentToken}`)
      .expect(200);
    expect(recentReady.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: requestId,
          status: 'ready',
          isActive: true,
          isTerminal: false,
        }),
      ]),
    );
    assertNoForbiddenFields(recentReady.body);

    const recipients = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/${requestId}/pickup-recipients`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    expect(recipients.body).toMatchObject({
      request: { id: requestId, status: 'ready' },
      policy: {
        delegatePickupAllowed: true,
        pickupCodeRequired: true,
      },
    });
    expect(recipients.body.recipients.length).toBeGreaterThanOrEqual(2);
    expect(recipients.body.recipients[0]).toEqual(
      expect.objectContaining({
        pickupRecipientToken: expect.any(String),
        displayName: expect.any(String),
        canPickup: true,
      }),
    );
    expect(JSON.stringify(recipients.body)).not.toContain('010');
    assertNoForbiddenFields(recipients.body, { allowPickupRecipientToken: true });
    const pickupRecipientToken = recipients.body.recipients[0]
      .pickupRecipientToken as string;

    spy.mockClear();
    const delivered = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/requests/${requestId}/deliver`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ pickupRecipientToken, pickupCode, note: 'Golden path handover' })
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
    expect(delivered.body.delivery.handedOverAt).toEqual(expect.any(String));
    assertNoForbiddenFields(delivered.body);
    expect(JSON.stringify(delivered.body)).not.toContain(pickupRecipientToken);
    expect(JSON.stringify(delivered.body)).not.toContain(pickupCode);
    expectPublished(
      spy,
      staffUserId,
      REALTIME_SERVER_EVENTS.DISMISSAL_REQUEST_DELIVERED,
    );
    expectPublished(spy, staffUserId, REALTIME_SERVER_EVENTS.DISMISSAL_QUEUE_CHANGED);
    expectPublished(
      spy,
      parentUserId,
      REALTIME_SERVER_EVENTS.PARENT_SMART_PICKUP_REQUEST_CHANGED,
    );
    expectNoForbiddenPublishedPayloads(spy, pickupCode);
    await expectStatusEvent(requestId, DismissalRequestStatus.HANDED_OVER);
    await expectAudit('dismissal.request.delivered', requestId);
    await expect(
      countNotifications({
        type: CommunicationNotificationType.DISMISSAL_REQUEST_HANDED_OVER,
        sourceId: requestId,
        recipientUserId: parentUserId,
      }),
    ).resolves.toBe(1);

    const activeAfterDelivery = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/active`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    expect(activeAfterDelivery.body.data.map((item: { id: string }) => item.id)).not.toContain(
      requestId,
    );
    assertNoForbiddenFields(activeAfterDelivery.body);

    const waitingAfterDelivery = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/waiting-students`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    expect(waitingAfterDelivery.body.data.map((item: { id: string }) => item.id)).not.toContain(
      requestId,
    );
    assertNoForbiddenFields(waitingAfterDelivery.body);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/${requestId}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(404);

    const recentAfterHandover = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/smart-pickup/recent-calls`)
      .set('Authorization', `Bearer ${parentToken}`)
      .expect(200);
    expect(recentAfterHandover.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: requestId,
          status: 'handed_over',
          isTerminal: true,
          isActive: false,
          canCancel: false,
          canTrack: false,
          handedOverAt: expect.any(String),
        }),
      ]),
    );
    expect(JSON.stringify(recentAfterHandover.body)).not.toContain('handoverReceiverName');
    expect(JSON.stringify(recentAfterHandover.body)).not.toContain('pickupRecipientToken');
    expect(JSON.stringify(recentAfterHandover.body)).not.toContain(pickupCode);
    assertNoForbiddenFields(recentAfterHandover.body);

    const historyList = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/history`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    expect(historyList.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: requestId,
          status: 'handed_over',
          isTerminal: true,
          wait: expect.objectContaining({
            minutes: expect.any(Number),
            delayed: expect.any(Boolean),
            urgent: expect.any(Boolean),
          }),
        }),
      ]),
    );
    assertNoForbiddenFields(historyList.body);

    const historyDetail = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/history/${requestId}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    const timelineTypes = historyDetail.body.request.timeline.map(
      (item: { type: string }) => item.type,
    );
    expect(timelineTypes).toEqual(
      expect.arrayContaining(['request_created', 'request_status_changed']),
    );
    expect(
      historyDetail.body.request.timeline.some(
        (item: { statusTo: string | null }) => item.statusTo === 'handed_over',
      ),
    ).toBe(true);
    assertNoForbiddenFields(historyDetail.body);

    const notifications = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/notifications`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    expect(notifications.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'request_created',
          title: expect.any(String),
          body: expect.any(String),
        }),
      ]),
    );
    assertNoForbiddenFields(notifications.body);
    spy.mockRestore();
  });

  it('smokes idempotent escalation on a separate active request', async () => {
    const create = await createParentRequest({
      childId: escalationChildId,
      clientRequestId: `golden-escalation-${TEST_RUN_ID}`,
    }).expect(201);
    const requestId = create.body.request.id as string;
    assertNoForbiddenFields(create.body, { allowRawPickupCode: true });

    const notificationCountBefore = await prisma.communicationNotification.count({
      where: { schoolId },
    });
    const spy = publisherSpy();
    spy.mockClear();
    const escalation = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/requests/${requestId}/escalate`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ reason: 'parent_waiting', note: 'Golden path escalation' })
      .expect(201);
    expect(escalation.body.escalation).toMatchObject({
      requestId,
      changed: true,
      escalated: true,
      reason: 'parent_waiting',
      escalatedAt: expect.any(String),
    });
    expect(escalation.body.request).toMatchObject({
      id: requestId,
      status: 'requested',
      isActive: true,
      isTerminal: false,
    });
    assertNoForbiddenFields(escalation.body);
    expect(spy).not.toHaveBeenCalled();
    await expect(
      countRequestEvents(requestId, DismissalRequestEventType.REQUEST_ESCALATED),
    ).resolves.toBe(1);
    await expectAudit('dismissal.request.escalated', requestId);
    await expect(
      prisma.communicationNotification.count({ where: { schoolId } }),
    ).resolves.toBe(notificationCountBefore);

    const historyDetail = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/history/${requestId}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    expect(historyDetail.body.request.escalation).toEqual(
      expect.objectContaining({
        escalated: true,
        reason: 'parent_waiting',
      }),
    );
    expect(historyDetail.body.request.timeline.map((item: { type: string }) => item.type)).toContain(
      'request_escalated',
    );
    assertNoForbiddenFields(historyDetail.body);

    spy.mockClear();
    const retry = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/requests/${requestId}/escalate`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ reason: 'manual_follow_up' })
      .expect(201);
    expect(retry.body.escalation.changed).toBe(false);
    assertNoForbiddenFields(retry.body);
    expect(spy).not.toHaveBeenCalled();
    await expect(
      countRequestEvents(requestId, DismissalRequestEventType.REQUEST_ESCALATED),
    ).resolves.toBe(1);
    await expect(
      prisma.auditLog.count({
        where: {
          schoolId,
          action: 'dismissal.request.escalated',
          resourceId: requestId,
        },
      }),
    ).resolves.toBe(1);
    spy.mockRestore();
  });

  it('smokes parent cancel before called as the alternate terminal path', async () => {
    const create = await createParentRequest({
      childId: cancelChildId,
      clientRequestId: `golden-cancel-${TEST_RUN_ID}`,
    }).expect(201);
    const requestId = create.body.request.id as string;
    assertNoForbiddenFields(create.body, { allowRawPickupCode: true });

    const spy = publisherSpy();
    spy.mockClear();
    const cancel = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/smart-pickup/requests/${requestId}/cancel`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({ note: 'Golden path cancel' })
      .expect(201);
    expect(cancel.body.request).toMatchObject({
      id: requestId,
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
    expectPublished(
      spy,
      staffUserId,
      REALTIME_SERVER_EVENTS.DISMISSAL_REQUEST_CANCELLED,
    );
    expectPublished(spy, staffUserId, REALTIME_SERVER_EVENTS.DISMISSAL_QUEUE_CHANGED);
    expectPublished(
      spy,
      parentUserId,
      REALTIME_SERVER_EVENTS.PARENT_SMART_PICKUP_REQUEST_CHANGED,
    );
    expectNoForbiddenPublishedPayloads(spy);
    await expectStatusEvent(requestId, DismissalRequestStatus.CANCELLED);
    await expectAudit('dismissal.request.cancelled_by_parent', requestId);
    await expect(
      countNotifications({
        type: CommunicationNotificationType.DISMISSAL_REQUEST_CANCELLED,
        sourceId: requestId,
        recipientUserId: staffUserId,
      }),
    ).resolves.toBe(1);

    const recent = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/smart-pickup/recent-calls`)
      .set('Authorization', `Bearer ${parentToken}`)
      .expect(200);
    expect(recent.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: requestId,
          status: 'cancelled',
          isTerminal: true,
          isActive: false,
          canCancel: false,
        }),
      ]),
    );
    assertNoForbiddenFields(recent.body);

    const active = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/active`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    expect(active.body.data.map((item: { id: string }) => item.id)).not.toContain(
      requestId,
    );
    assertNoForbiddenFields(active.body);

    const history = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/history/${requestId}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    expect(history.body.request).toMatchObject({
      id: requestId,
      status: 'cancelled',
      isTerminal: true,
    });
    assertNoForbiddenFields(history.body);

    spy.mockClear();
    const retry = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/smart-pickup/requests/${requestId}/cancel`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({})
      .expect(201);
    expect(retry.body.request).toMatchObject({
      id: requestId,
      status: 'cancelled',
      changed: false,
      isTerminal: true,
    });
    assertNoForbiddenFields(retry.body);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

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
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status, note: `Golden path ${status}` });
  }

  async function createSchoolFixture(): Promise<{
    organizationId: string;
    schoolId: string;
  }> {
    const organization = await prisma.organization.create({
      data: {
        slug: `dismissal-golden-${TEST_RUN_ID}-org`,
        name: `Dismissal Golden Org ${TEST_RUN_ID}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);

    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `dismissal-golden-${TEST_RUN_ID}-school`,
        name: `Dismissal Golden School ${TEST_RUN_ID}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdSchoolIds.push(school.id);

    await prisma.schoolProfile.create({
      data: {
        schoolId: school.id,
        schoolName: `Dismissal Golden School ${TEST_RUN_ID}`,
        timezone: 'Africa/Cairo',
        latitude: SCHOOL_LATITUDE,
        longitude: SCHOOL_LONGITUDE,
        mapPlaceLabel: 'Golden Path Zone',
      },
    });

    return { organizationId: organization.id, schoolId: school.id };
  }

  async function createAcademicFixture(): Promise<{ classroomId: string }> {
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId,
        nameAr: `golden-year-${TEST_RUN_ID}-ar`,
        nameEn: `Golden Year ${TEST_RUN_ID}`,
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
        nameAr: `golden-term-${TEST_RUN_ID}-ar`,
        nameEn: `Golden Term ${TEST_RUN_ID}`,
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
        nameAr: `golden-stage-${TEST_RUN_ID}-ar`,
        nameEn: `Golden Stage ${TEST_RUN_ID}`,
      },
      select: { id: true },
    });
    const grade = await prisma.grade.create({
      data: {
        schoolId,
        stageId: stage.id,
        nameAr: `golden-grade-${TEST_RUN_ID}-ar`,
        nameEn: `Golden Grade ${TEST_RUN_ID}`,
      },
      select: { id: true },
    });
    const section = await prisma.section.create({
      data: {
        schoolId,
        gradeId: grade.id,
        nameAr: `golden-section-${TEST_RUN_ID}-ar`,
        nameEn: `Golden Section ${TEST_RUN_ID}`,
      },
      select: { id: true },
    });
    const classroom = await prisma.classroom.create({
      data: {
        schoolId,
        sectionId: section.id,
        nameAr: `golden-classroom-${TEST_RUN_ID}-ar`,
        nameEn: `Golden Classroom ${TEST_RUN_ID}`,
      },
      select: { id: true },
    });

    return { classroomId: classroom.id };
  }

  async function createGate(): Promise<string> {
    const gate = await prisma.dismissalGate.create({
      data: {
        schoolId,
        code: `GP-${TEST_RUN_ID}`,
        name: 'Golden Path Gate',
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

  async function countNotifications(params: {
    type: CommunicationNotificationType;
    sourceId: string;
    recipientUserId: string;
  }): Promise<number> {
    return prisma.communicationNotification.count({
      where: {
        schoolId,
        type: params.type,
        sourceModule: CommunicationNotificationSourceModule.DISMISSAL,
        sourceType: 'dismissal_request',
        sourceId: params.sourceId,
        recipientUserId: params.recipientUserId,
      },
    });
  }

  async function countRequestEvents(
    requestId: string,
    type: DismissalRequestEventType,
  ): Promise<number> {
    return prisma.dismissalRequestEvent.count({
      where: { schoolId, requestId, type },
    });
  }

  async function expectStatusEvent(
    requestId: string,
    statusTo: DismissalRequestStatus,
  ): Promise<void> {
    await expect(
      prisma.dismissalRequestEvent.count({
        where: {
          schoolId,
          requestId,
          type: DismissalRequestEventType.REQUEST_STATUS_CHANGED,
          statusTo,
        },
      }),
    ).resolves.toBeGreaterThanOrEqual(1);
  }

  async function expectAudit(action: string, requestId: string): Promise<void> {
    await expect(
      prisma.auditLog.count({
        where: {
          schoolId,
          action,
          resourceId: requestId,
        },
      }),
    ).resolves.toBeGreaterThanOrEqual(1);
  }

  function publisherSpy(): PublishSpy {
    const publisher = app.get(RealtimePublisherService);
    return jest.spyOn(publisher, 'publishToUser') as PublishSpy;
  }

  function expectStatusRealtime(
    spy: PublishSpy,
    requestId: string,
    status: string,
  ): void {
    expect(
      expectPublished(
        spy,
        staffUserId,
        REALTIME_SERVER_EVENTS.DISMISSAL_REQUEST_STATUS_CHANGED,
      ),
    ).toMatchObject({ request: { id: requestId, status } });
    expectPublished(spy, staffUserId, REALTIME_SERVER_EVENTS.DISMISSAL_QUEUE_CHANGED);
    expect(
      expectPublished(
        spy,
        parentUserId,
        REALTIME_SERVER_EVENTS.PARENT_SMART_PICKUP_REQUEST_CHANGED,
      ),
    ).toMatchObject({ request: { id: requestId, status } });
  }

  function expectPublished(
    spy: PublishSpy,
    userId: string,
    eventName: string,
  ): unknown {
    const call = spy.mock.calls.find(
      ([publishedSchoolId, recipientUserId, publishedEvent]) =>
        publishedSchoolId === schoolId &&
        recipientUserId === userId &&
        publishedEvent === eventName,
    );
    expect(call).toBeDefined();
    return call?.[3];
  }

  function expectNoForbiddenPublishedPayloads(
    spy: PublishSpy,
    rawPickupCode?: string,
  ): void {
    assertNoForbiddenFields(spy.mock.calls.map((call) => call[3]), {
      allowRealtimeEventId: true,
    });
    if (rawPickupCode) {
      expect(JSON.stringify(spy.mock.calls.map((call) => call[3]))).not.toContain(
        rawPickupCode,
      );
    }
  }
});

function assertNoForbiddenFields(
  payload: unknown,
  options: {
    allowPickupRecipientToken?: boolean;
    allowRawPickupCode?: boolean;
    allowRealtimeEventId?: boolean;
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
    'parentLatitude',
    'parentLongitude',
    'distanceMeters',
    'geofencePassed',
    'clientRequestId',
    'deletedAt',
    'metadata',
    'pickupCodeHash',
    'pickupCodeSalt',
    'socketId',
    'room',
  ]);
  if (!options.allowPickupRecipientToken) {
    forbiddenKeys.add('pickupRecipientToken');
  }
  if (!options.allowRawPickupCode) {
    forbiddenKeys.add('pickupCode');
  }
  if (!options.allowRealtimeEventId) {
    forbiddenKeys.add('eventId');
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
