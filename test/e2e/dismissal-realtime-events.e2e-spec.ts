import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  CommunicationNotificationDeliveryChannel,
  CommunicationNotificationDeliveryStatus,
  CommunicationNotificationSourceModule,
  CommunicationNotificationStatus,
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
import { REALTIME_SERVER_EVENTS } from '../../src/infrastructure/realtime/realtime-event-names';
import { RealtimePublisherService } from '../../src/infrastructure/realtime/realtime-publisher.service';

const GLOBAL_PREFIX = '/api/v1';
const PASSWORD = 'DismissalRealtime123!';
const TEST_RUN_ID = randomUUID().slice(0, 8);
const TIMEZONE = 'Africa/Cairo';
const SCHOOL_LATITUDE = 30.04442;
const SCHOOL_LONGITUDE = 31.235712;
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(120_000);

type PublishSpy = jest.SpyInstance<
  boolean,
  [schoolId: string, userId: string, eventName: string, payload: unknown]
>;

describe('DISMISSAL-REALTIME-1A queue realtime events (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let organizationAId: string;
  let organizationBId: string;
  let schoolAId: string;
  let schoolBId: string;
  let classroomAId: string;
  let classroomBId: string;
  let gateAId: string;
  let gateBId: string;
  let parentAId: string;
  let parentBId: string;
  let guardianAId: string;
  let guardianBId: string;
  let staffAssignedId: string;
  let staffUnassignedId: string;
  let staffCrossSchoolId: string;
  let staffAssignedToken: string;
  let parentAToken: string;
  let adminToken: string;
  const createdUserIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdOrganizationIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [schoolAdminRole, dismissalStaffRole, parentRole] =
      await Promise.all([
        findSystemRole('school_admin'),
        findSystemRole('dismissal_staff'),
        findSystemRole('parent'),
      ]);

    const fixtureA = await createSchoolFixture('a');
    const fixtureB = await createSchoolFixture('b');
    organizationAId = fixtureA.organizationId;
    schoolAId = fixtureA.schoolId;
    organizationBId = fixtureB.organizationId;
    schoolBId = fixtureB.schoolId;

    const academicA = await createAcademicFixture('a', schoolAId);
    const academicB = await createAcademicFixture('b', schoolBId);
    classroomAId = academicA.classroomId;
    classroomBId = academicB.classroomId;

    gateAId = await createGate({
      schoolId: schoolAId,
      code: `RT-A-${TEST_RUN_ID}`,
      name: 'Realtime Main Gate',
      status: DismissalGateOperationalStatus.OPEN,
    });
    gateBId = await createGate({
      schoolId: schoolBId,
      code: `RT-B-${TEST_RUN_ID}`,
      name: 'Realtime Cross Gate',
      status: DismissalGateOperationalStatus.OPEN,
    });

    await createDismissalSettings(schoolAId, gateAId);
    await createDismissalSettings(schoolBId, gateBId);

    const admin = await createUserWithMembership({
      email: `dismissal-realtime-${TEST_RUN_ID}-admin@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: schoolAdminRole.id,
      userType: UserType.SCHOOL_USER,
      firstName: 'Realtime',
      lastName: 'Admin',
    });
    const staffAssigned = await createUserWithMembership({
      email: `dismissal-realtime-${TEST_RUN_ID}-staff-assigned@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
      firstName: 'Assigned',
      lastName: 'Realtime',
    });
    const staffUnassigned = await createUserWithMembership({
      email: `dismissal-realtime-${TEST_RUN_ID}-staff-unassigned@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
      firstName: 'Unassigned',
      lastName: 'Realtime',
    });
    const staffCrossSchool = await createUserWithMembership({
      email: `dismissal-realtime-${TEST_RUN_ID}-staff-cross@moazez.local`,
      schoolId: schoolBId,
      organizationId: organizationBId,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
      firstName: 'Cross',
      lastName: 'Realtime',
    });
    const parentA = await createUserWithMembership({
      email: `dismissal-realtime-${TEST_RUN_ID}-parent-a@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: parentRole.id,
      userType: UserType.PARENT,
      firstName: 'Parent',
      lastName: 'Realtime A',
    });
    const parentB = await createUserWithMembership({
      email: `dismissal-realtime-${TEST_RUN_ID}-parent-b@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: parentRole.id,
      userType: UserType.PARENT,
      firstName: 'Other',
      lastName: 'Realtime Parent',
    });

    staffAssignedId = staffAssigned.userId;
    staffUnassignedId = staffUnassigned.userId;
    staffCrossSchoolId = staffCrossSchool.userId;
    parentAId = parentA.userId;
    parentBId = parentB.userId;
    guardianAId = await createGuardian({
      schoolId: schoolAId,
      organizationId: organizationAId,
      userId: parentAId,
      marker: 'a',
    });
    guardianBId = await createGuardian({
      schoolId: schoolAId,
      organizationId: organizationAId,
      userId: parentBId,
      marker: 'b',
    });

    await prisma.dismissalStaffAssignment.createMany({
      data: [
        {
          schoolId: schoolAId,
          staffUserId: staffAssignedId,
          gateId: gateAId,
          isActive: true,
        },
        {
          schoolId: schoolBId,
          staffUserId: staffCrossSchoolId,
          gateId: gateBId,
          isActive: true,
        },
      ],
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
    staffAssignedToken = await login(staffAssigned.email);
    parentAToken = await login(parentA.email);
  });

  beforeEach(async () => {
    await resetRuntimeState();
  });

  afterAll(async () => {
    try {
      const schoolIds = [schoolAId, schoolBId].filter(Boolean);
      await resetRuntimeState();
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
      await prisma.guardian.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.student.deleteMany({
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
      await prisma.stage.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.term.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.academicYear.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.auditLog.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.session.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.membership.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
      await prisma.school.deleteMany({
        where: { id: { in: createdSchoolIds } },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: createdOrganizationIds } },
      });
    } finally {
      await app?.close();
      await prisma.$disconnect();
    }
  });

  it('publishes parent-created request events only to matching staff and requesting parent', async () => {
    const spy = publisherSpy();
    const child = await createChild({
      schoolId: schoolAId,
      organizationId: organizationAId,
      classroomId: classroomAId,
      guardianId: guardianAId,
      firstName: 'Realtime',
      lastName: 'Create',
    });
    const clientRequestId = randomUUID();

    const response = await createParentRequest({
      childId: child.studentId,
      clientRequestId,
    }).expect(201);
    const requestId = response.body.request.id as string;
    const pickupCode = response.body.pickup.pickupCode as string | undefined;

    const requestCreatedPayload = publishedPayload(
      spy,
      staffAssignedId,
      REALTIME_SERVER_EVENTS.DISMISSAL_REQUEST_CREATED,
    );
    expect(requestCreatedPayload).toMatchObject({
      type: 'request_created',
      request: { id: requestId, status: 'requested' },
      child: { id: child.studentId, displayName: 'Realtime Create' },
      gate: { id: gateAId, code: `RT-A-${TEST_RUN_ID}` },
    });
    expect(
      publishedPayload(
        spy,
        staffAssignedId,
        REALTIME_SERVER_EVENTS.DISMISSAL_QUEUE_CHANGED,
      ),
    ).toMatchObject({
      reason: 'request_created',
      request: { id: requestId, status: 'requested' },
    });
    expect(
      publishedPayload(
        spy,
        parentAId,
        REALTIME_SERVER_EVENTS.PARENT_SMART_PICKUP_REQUEST_CHANGED,
      ),
    ).toMatchObject({
      request: { id: requestId, status: 'requested', canCancel: true },
      child: { id: child.studentId, displayName: 'Realtime Create' },
    });
    expect(
      publishedPayload(
        spy,
        staffAssignedId,
        REALTIME_SERVER_EVENTS.DISMISSAL_NOTIFICATION_CREATED,
      ),
    ).toMatchObject({
      notification: {
        type: 'dismissal_request_created',
        title: expect.any(String),
        body: expect.any(String),
        readAt: null,
      },
    });
    expectNoPublishToUser(spy, staffUnassignedId);
    expectNoPublishToUser(spy, staffCrossSchoolId);
    expectNoPublishToUser(spy, parentBId);
    expectNoForbiddenKeys(spy.mock.calls.map((call) => call[3]), pickupCode);

    spy.mockClear();
    await createParentRequest({ childId: child.studentId, clientRequestId }).expect(201);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('emits cancellation events only on changed parent cancellation', async () => {
    const spy = publisherSpy();
    const requestId = await createRequestViaParent('Cancel');
    spy.mockClear();

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/smart-pickup/requests/${requestId}/cancel`)
      .set('Authorization', `Bearer ${parentAToken}`)
      .send({ note: 'parent cancelled' })
      .expect(201);

    expect(
      publishedPayload(
        spy,
        staffAssignedId,
        REALTIME_SERVER_EVENTS.DISMISSAL_REQUEST_CANCELLED,
      ),
    ).toMatchObject({
      type: 'request_cancelled',
      request: { id: requestId, status: 'cancelled' },
    });
    expect(
      publishedPayload(
        spy,
        staffAssignedId,
        REALTIME_SERVER_EVENTS.DISMISSAL_QUEUE_CHANGED,
      ),
    ).toMatchObject({
      reason: 'request_cancelled',
      request: { id: requestId, status: 'cancelled' },
    });
    expect(
      publishedPayload(
        spy,
        parentAId,
        REALTIME_SERVER_EVENTS.PARENT_SMART_PICKUP_REQUEST_CHANGED,
      ),
    ).toMatchObject({
      request: { id: requestId, status: 'cancelled', canCancel: false },
    });
    expectNoForbiddenKeys(spy.mock.calls.map((call) => call[3]));

    const active = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/active`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(active.body.data.map((item: { id: string }) => item.id)).not.toContain(
      requestId,
    );

    spy.mockClear();
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/smart-pickup/requests/${requestId}/cancel`)
      .set('Authorization', `Bearer ${parentAToken}`)
      .send({})
      .expect(201);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('emits status, arrival, delivery, notification-read, and read-all events only for changed flows', async () => {
    const spy = publisherSpy();

    const statusRequestId = await createRequestViaParent('Status');
    spy.mockClear();
    await patchStatus(statusRequestId, 'called').expect(200);
    expect(
      publishedPayload(
        spy,
        staffAssignedId,
        REALTIME_SERVER_EVENTS.DISMISSAL_REQUEST_STATUS_CHANGED,
      ),
    ).toMatchObject({
      type: 'status_changed',
      request: {
        id: statusRequestId,
        status: 'called',
        previousStatus: 'requested',
      },
    });
    expect(
      publishedPayload(
        spy,
        parentAId,
        REALTIME_SERVER_EVENTS.PARENT_SMART_PICKUP_REQUEST_CHANGED,
      ),
    ).toMatchObject({
      request: { id: statusRequestId, status: 'called', canCancel: false },
    });

    spy.mockClear();
    await patchStatus(statusRequestId, 'called').expect(200);
    expect(spy).not.toHaveBeenCalled();

    spy.mockClear();
    await patchStatus(statusRequestId, 'at_gate').expect(200);
    spy.mockClear();
    await patchStatus(statusRequestId, 'ready').expect(200);
    expect(
      publishedPayload(
        spy,
        parentAId,
        REALTIME_SERVER_EVENTS.PARENT_SMART_PICKUP_REQUEST_CHANGED,
      ),
    ).toMatchObject({
      request: { id: statusRequestId, status: 'ready', canCancel: false },
    });

    const arrivalRequestId = await createRequestViaParent('Arrival');
    await patchStatus(arrivalRequestId, 'called').expect(200);
    spy.mockClear();
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/waiting-students/${arrivalRequestId}/arrival`)
      .set('Authorization', `Bearer ${staffAssignedToken}`)
      .send({ note: 'arrived' })
      .expect(201);
    expect(
      publishedPayload(
        spy,
        staffAssignedId,
        REALTIME_SERVER_EVENTS.DISMISSAL_REQUEST_ARRIVAL_CONFIRMED,
      ),
    ).toMatchObject({
      type: 'arrival_confirmed',
      request: { id: arrivalRequestId, status: 'at_gate' },
    });

    spy.mockClear();
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/waiting-students/${arrivalRequestId}/arrival`)
      .set('Authorization', `Bearer ${staffAssignedToken}`)
      .send({})
      .expect(201);
    expect(spy).not.toHaveBeenCalled();

    const deliveredRequest = await createRequestViaParentWithPickupCode('Deliver');
    await patchStatus(deliveredRequest.id, 'called').expect(200);
    await patchStatus(deliveredRequest.id, 'at_gate').expect(200);
    await patchStatus(deliveredRequest.id, 'ready').expect(200);
    spy.mockClear();
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/requests/${deliveredRequest.id}/deliver`)
      .set('Authorization', `Bearer ${staffAssignedToken}`)
      .send({
        pickupCode: deliveredRequest.pickupCode,
        pickupRecipientToken: await getPickupRecipientToken(
          staffAssignedToken,
          deliveredRequest.id,
        ),
      })
      .expect(201);
    expect(
      publishedPayload(
        spy,
        staffAssignedId,
        REALTIME_SERVER_EVENTS.DISMISSAL_REQUEST_DELIVERED,
      ),
    ).toMatchObject({
      type: 'delivered',
      request: { id: deliveredRequest.id, status: 'handed_over' },
    });
    expect(
      publishedPayload(
        spy,
        parentAId,
        REALTIME_SERVER_EVENTS.PARENT_SMART_PICKUP_REQUEST_CHANGED,
      ),
    ).toMatchObject({
      request: { id: deliveredRequest.id, status: 'handed_over' },
    });
    expectNoForbiddenKeys(
      spy.mock.calls.map((call) => call[3]),
      deliveredRequest.pickupCode,
    );

    const active = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/active`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const waiting = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/waiting-students`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(active.body.data.map((item: { id: string }) => item.id)).not.toContain(
      deliveredRequest.id,
    );
    expect(waiting.body.data.map((item: { id: string }) => item.id)).not.toContain(
      deliveredRequest.id,
    );

    const failedDeliveryId = await createRequestViaParent('FailedDeliver');
    spy.mockClear();
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/requests/${failedDeliveryId}/deliver`)
      .set('Authorization', `Bearer ${staffAssignedToken}`)
      .send({})
      .expect(409);
    expect(spy).not.toHaveBeenCalled();

    const notificationId = await createStaffNotification(statusRequestId);
    spy.mockClear();
    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/notifications/${notificationId}/read`)
      .set('Authorization', `Bearer ${staffAssignedToken}`)
      .expect(200);
    expect(
      publishedPayload(
        spy,
        staffAssignedId,
        REALTIME_SERVER_EVENTS.DISMISSAL_NOTIFICATION_READ,
      ),
    ).toMatchObject({
      notification: {
        id: notificationId,
        type: 'dismissal_request_created',
        readAt: expect.any(String),
      },
    });
    expectNoPublishToUser(spy, staffUnassignedId);

    await createStaffNotification(statusRequestId);
    spy.mockClear();
    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/notifications/read-all`)
      .set('Authorization', `Bearer ${staffAssignedToken}`)
      .expect(200);
    expect(
      publishedPayload(
        spy,
        staffAssignedId,
        REALTIME_SERVER_EVENTS.DISMISSAL_NOTIFICATIONS_READ_ALL,
      ),
    ).toMatchObject({ updatedCount: expect.any(Number) });
    expectNoForbiddenKeys(spy.mock.calls.map((call) => call[3]));

    await expect(
      prisma.communicationNotificationPushAttempt.count({
        where: { schoolId: { in: [schoolAId, schoolBId] } },
      }),
    ).resolves.toBe(0);
    spy.mockRestore();
  });

  async function resetRuntimeState(): Promise<void> {
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
    await prisma.dismissalRequestEvent.deleteMany({
      where: { schoolId: { in: schoolIds } },
    });
    await prisma.dismissalRequest.deleteMany({
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
  }

  async function createRequestViaParent(label: string): Promise<string> {
    const child = await createChild({
      schoolId: schoolAId,
      organizationId: organizationAId,
      classroomId: classroomAId,
      guardianId: guardianAId,
      firstName: 'Realtime',
      lastName: label,
    });
    const response = await createParentRequest({
      childId: child.studentId,
      clientRequestId: randomUUID(),
    }).expect(201);
    return response.body.request.id as string;
  }

  async function createRequestViaParentWithPickupCode(
    label: string,
  ): Promise<{ id: string; pickupCode: string }> {
    const child = await createChild({
      schoolId: schoolAId,
      organizationId: organizationAId,
      classroomId: classroomAId,
      guardianId: guardianAId,
      firstName: 'Realtime',
      lastName: label,
    });
    const response = await createParentRequest({
      childId: child.studentId,
      clientRequestId: randomUUID(),
    }).expect(201);
    return {
      id: response.body.request.id as string,
      pickupCode: response.body.pickup.pickupCode as string,
    };
  }

  function createParentRequest(params: {
    childId: string;
    clientRequestId: string;
  }) {
    return request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/smart-pickup/requests`)
      .set('Authorization', `Bearer ${parentAToken}`)
      .send({
        childId: params.childId,
        gateId: gateAId,
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

  async function getPickupRecipientToken(
    token: string,
    requestId: string,
  ): Promise<string> {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/${requestId}/pickup-recipients`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    return response.body.recipients[0].pickupRecipientToken as string;
  }

  async function createStaffNotification(requestId: string): Promise<string> {
    const notification = await prisma.communicationNotification.create({
      data: {
        schoolId: schoolAId,
        recipientUserId: staffAssignedId,
        sourceModule: CommunicationNotificationSourceModule.DISMISSAL,
        sourceType: 'dismissal_request',
        sourceId: requestId,
        idempotencyKey: `realtime-read:${requestId}:${randomUUID()}`,
        type: CommunicationNotificationType.DISMISSAL_REQUEST_CREATED,
        title: 'Realtime notification',
        body: 'Safe dismissal notification body',
        status: CommunicationNotificationStatus.UNREAD,
      },
      select: { id: true },
    });
    await prisma.communicationNotificationDelivery.create({
      data: {
        schoolId: schoolAId,
        notificationId: notification.id,
        channel: CommunicationNotificationDeliveryChannel.IN_APP,
        status: CommunicationNotificationDeliveryStatus.DELIVERED,
        provider: 'in_app',
        deliveredAt: new Date(),
      },
    });
    return notification.id;
  }

  async function createAcademicFixture(label: string, schoolId: string) {
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId,
        nameAr: `realtime-year-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Realtime Year ${label}`,
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
        nameAr: `realtime-term-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Realtime Term ${label}`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-01-15T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    expect(term.id).toBeTruthy();
    const stage = await prisma.stage.create({
      data: {
        schoolId,
        nameAr: `realtime-stage-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Realtime Stage ${label}`,
      },
      select: { id: true },
    });
    const grade = await prisma.grade.create({
      data: {
        schoolId,
        stageId: stage.id,
        nameAr: `realtime-grade-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Realtime Grade ${label}`,
      },
      select: { id: true },
    });
    const section = await prisma.section.create({
      data: {
        schoolId,
        gradeId: grade.id,
        nameAr: `realtime-section-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Realtime Section ${label}`,
      },
      select: { id: true },
    });
    const classroom = await prisma.classroom.create({
      data: {
        schoolId,
        sectionId: section.id,
        nameAr: `realtime-classroom-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Realtime Classroom ${label}`,
      },
      select: { id: true },
    });
    return { classroomId: classroom.id };
  }

  async function createChild(params: {
    schoolId: string;
    organizationId: string;
    classroomId: string;
    guardianId: string;
    firstName: string;
    lastName: string;
  }): Promise<{ studentId: string; enrollmentId: string }> {
    const [academicYear, term] = await Promise.all([
      prisma.academicYear.findFirstOrThrow({
        where: { schoolId: params.schoolId },
        select: { id: true },
      }),
      prisma.term.findFirstOrThrow({
        where: { schoolId: params.schoolId },
        select: { id: true },
      }),
    ]);
    const student = await prisma.student.create({
      data: {
        schoolId: params.schoolId,
        organizationId: params.organizationId,
        firstName: params.firstName,
        lastName: params.lastName,
        status: StudentStatus.ACTIVE,
      },
      select: { id: true },
    });
    await prisma.studentGuardian.create({
      data: {
        schoolId: params.schoolId,
        studentId: student.id,
        guardianId: params.guardianId,
        isPrimary: true,
      },
    });
    const enrollment = await prisma.enrollment.create({
      data: {
        schoolId: params.schoolId,
        studentId: student.id,
        academicYearId: academicYear.id,
        termId: term.id,
        classroomId: params.classroomId,
        status: StudentEnrollmentStatus.ACTIVE,
        enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
      },
      select: { id: true },
    });

    return { studentId: student.id, enrollmentId: enrollment.id };
  }

  async function createSchoolFixture(label: string) {
    const organization = await prisma.organization.create({
      data: {
        slug: `dismissal-realtime-${TEST_RUN_ID}-${label}`,
        name: `Dismissal Realtime ${label}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);
    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `dismissal-realtime-${TEST_RUN_ID}-${label}`,
        name: `Dismissal Realtime School ${label}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdSchoolIds.push(school.id);
    return { organizationId: organization.id, schoolId: school.id };
  }

  async function createGate(params: {
    schoolId: string;
    code: string;
    name: string;
    status: DismissalGateOperationalStatus;
  }): Promise<string> {
    const gate = await prisma.dismissalGate.create({
      data: {
        schoolId: params.schoolId,
        code: params.code,
        name: params.name,
        status: params.status,
        isActive: true,
      },
      select: { id: true },
    });
    return gate.id;
  }

  async function createDismissalSettings(
    schoolId: string,
    gateId: string,
  ): Promise<void> {
    await prisma.dismissalSettings.create({
      data: {
        schoolId,
        enabled: true,
        timezone: TIMEZONE,
        schoolLatitude: SCHOOL_LATITUDE,
        schoolLongitude: SCHOOL_LONGITUDE,
        allowedRadiusMeters: 500,
        requestWindowStartLocal: '00:00',
        requestWindowEndLocal: '23:59',
        requirePickupCode: true,
        allowParentCancelBeforeCalled: true,
        defaultGateId: gateId,
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
    userId: string;
    marker: string;
  }): Promise<string> {
    const guardian = await prisma.guardian.create({
      data: {
        schoolId: params.schoolId,
        organizationId: params.organizationId,
        userId: params.userId,
        firstName: 'Realtime',
        lastName: `Guardian ${params.marker}`,
        relation: 'guardian',
        phone: `010555${params.marker === 'a' ? '0001' : '0002'}`,
        canPickup: true,
        canReceiveNotifications: true,
      },
      select: { id: true },
    });
    return guardian.id;
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

  function publisherSpy(): PublishSpy {
    const publisher = app.get(RealtimePublisherService);
    return jest.spyOn(publisher, 'publishToUser') as PublishSpy;
  }

  function publishedPayload(
    spy: PublishSpy,
    userId: string,
    eventName: string,
  ): unknown {
    const call = spy.mock.calls.find(
      ([schoolId, recipientUserId, publishedEvent]) =>
        schoolId === schoolAId &&
        recipientUserId === userId &&
        publishedEvent === eventName,
    );
    expect(call).toBeDefined();
    return call?.[3];
  }

  function expectNoPublishToUser(spy: PublishSpy, userId: string): void {
    expect(
      spy.mock.calls.some(([, recipientUserId]) => recipientUserId === userId),
    ).toBe(false);
  }
});

function expectNoForbiddenKeys(payloads: unknown[], pickupCode?: string): void {
  const forbiddenKeys = new Set([
    'schoolId',
    'organizationId',
    'membershipId',
    'roleId',
    'guardianId',
    'requestedById',
    'actorUserId',
    'staffUserId',
    'handedOverById',
    'assignmentId',
    'pickupCode',
    'pickupCodeHash',
    'pickupCodeSalt',
    'parentLatitude',
    'parentLongitude',
    'distanceMeters',
    'geofencePassed',
    'clientRequestId',
    'deletedAt',
    'roomName',
    'socketId',
  ]);
  const json = JSON.stringify(payloads);
  for (const key of forbiddenKeys) {
    expect(json).not.toContain(`"${key}"`);
  }
  if (pickupCode) {
    expect(json).not.toContain(pickupCode);
  }
}
