import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AuditOutcome,
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
import { REALTIME_SERVER_EVENTS } from '../../src/infrastructure/realtime/realtime-event-names';
import { RealtimePublisherService } from '../../src/infrastructure/realtime/realtime-publisher.service';
import { ExpireDismissalRequestsUseCase } from '../../src/modules/dismissal/requests/application/expire-dismissal-requests.use-case';
import { CORE_WORKER_CONSUMER_PROVIDERS } from '../../src/runtime/core-worker/core-worker-consumers.module';

const GLOBAL_PREFIX = '/api/v1';
const PASSWORD = 'DismissalExpiryE2E123!';
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

describe('DISMISSAL-EXPIRY-1A request expiration worker (e2e)', () => {
  let app: INestApplication<App>;
  let coreWorker: TestingModule;
  let prisma: PrismaClient;
  let expireUseCase: ExpireDismissalRequestsUseCase;
  let organizationId: string;
  let schoolId: string;
  let classroomId: string;
  let gateId: string;
  let parentUserId: string;
  let staffUserId: string;
  let guardianId: string;
  let adminToken: string;
  let parentToken: string;
  const createdUserIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdOrganizationIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [schoolAdminRole, parentRole, dismissalStaffRole] = await Promise.all([
      findSystemRole('school_admin'),
      findSystemRole('parent'),
      findSystemRole('dismissal_staff'),
    ]);

    const fixture = await createSchoolFixture();
    organizationId = fixture.organizationId;
    schoolId = fixture.schoolId;
    classroomId = (await createAcademicFixture()).classroomId;
    gateId = await createGate();

    const admin = await createUserWithMembership({
      email: `dismissal-expiry-${TEST_RUN_ID}-admin@moazez.local`,
      roleId: schoolAdminRole.id,
      userType: UserType.SCHOOL_USER,
      firstName: 'Expiry',
      lastName: 'Admin',
    });
    const parent = await createUserWithMembership({
      email: `dismissal-expiry-${TEST_RUN_ID}-parent@moazez.local`,
      roleId: parentRole.id,
      userType: UserType.PARENT,
      firstName: 'Expiry',
      lastName: 'Parent',
    });
    const staff = await createUserWithMembership({
      email: `dismissal-expiry-${TEST_RUN_ID}-staff@moazez.local`,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
      firstName: 'Expiry',
      lastName: 'Staff',
    });
    parentUserId = parent.userId;
    staffUserId = staff.userId;

    guardianId = await createGuardian(parentUserId);
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

    const originalRuntimeRole = process.env.DATABASE_RUNTIME_ROLE;
    process.env.DATABASE_RUNTIME_ROLE = 'core-worker';
    try {
      const { CoreWorkerRuntimeModule } = require(
        '../../src/runtime/core-worker/core-worker-runtime.module'
      ) as typeof import('../../src/runtime/core-worker/core-worker-runtime.module');
      const coreWorkerBuilder = Test.createTestingModule({
        imports: [CoreWorkerRuntimeModule],
      });
      for (const consumerProvider of CORE_WORKER_CONSUMER_PROVIDERS) {
        coreWorkerBuilder.overrideProvider(consumerProvider).useValue({});
      }
      coreWorker = await coreWorkerBuilder.compile();
      await coreWorker.init();
    } finally {
      restoreEnvironmentValue('DATABASE_RUNTIME_ROLE', originalRuntimeRole);
    }

    expireUseCase = coreWorker.get(ExpireDismissalRequestsUseCase);
    adminToken = await login(admin.email);
    parentToken = await login(parent.email);
  });

  beforeEach(async () => {
    await resetRequestState();
    await configureSettings({
      delayThresholdMinutes: 1,
      urgentThresholdMinutes: 2,
      expiryThresholdMinutes: 3,
    });
  });

  afterAll(async () => {
    await coreWorker?.close();
    if (app) await app.close();
    if (prisma) {
      await resetRequestState();
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

  it('exposes and validates the expiry threshold through dismissal settings', async () => {
    const settings = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/settings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(settings.body.thresholds).toEqual({
      delayMinutes: 1,
      urgentMinutes: 2,
      expiryMinutes: 3,
    });
    assertNoLeak(settings.body);

    const equalUrgent = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/settings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ expiryThresholdMinutes: 2 })
      .expect(422);
    expect(equalUrgent.body?.error?.code).toBe(
      'dismissal.settings.invalid_thresholds',
    );

    const tooLarge = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/settings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ expiryThresholdMinutes: 1441 })
      .expect(422);
    expect(tooLarge.body?.error?.code).toBe(
      'dismissal.settings.invalid_thresholds',
    );

    const updated = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/settings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ expiryThresholdMinutes: 4 })
      .expect(200);
    expect(updated.body.thresholds).toEqual({
      delayMinutes: 1,
      urgentMinutes: 2,
      expiryMinutes: 4,
    });
    assertNoLeak(updated.body);
  });

  it('expires stale active requests, creates safe event/audit/notification rows, and publishes realtime after commit', async () => {
    const now = new Date();
    const activeRequestIds: string[] = [];
    for (const status of [
      DismissalRequestStatus.REQUESTED,
      DismissalRequestStatus.QUEUED,
      DismissalRequestStatus.CALLED,
      DismissalRequestStatus.MOVING,
      DismissalRequestStatus.AT_GATE,
      DismissalRequestStatus.READY,
    ]) {
      activeRequestIds.push(
        (
          await createRequest({
            status,
            label: `old-${status.toLowerCase()}`,
            requestedAt: minutesBefore(now, 10),
          })
        ).requestId,
      );
    }
    const freshRequest = await createRequest({
      status: DismissalRequestStatus.REQUESTED,
      label: 'fresh',
      requestedAt: minutesBefore(now, 1),
    });
    const deletedRequest = await createRequest({
      status: DismissalRequestStatus.REQUESTED,
      label: 'deleted',
      requestedAt: minutesBefore(now, 10),
      deletedAt: now,
    });
    const terminalRequestIds: string[] = [];
    for (const status of [
      DismissalRequestStatus.HANDED_OVER,
      DismissalRequestStatus.CANCELLED,
      DismissalRequestStatus.EXPIRED,
    ]) {
      terminalRequestIds.push(
        (
          await createRequest({
            status,
            label: `terminal-${status.toLowerCase()}`,
            requestedAt: minutesBefore(now, 10),
          })
        ).requestId,
      );
    }

    const spy = publisherSpy();
    const result = await expireUseCase.runOnce({ now, batchSize: 20 });

    expect(result).toEqual({
      scannedCount: activeRequestIds.length,
      expiredCount: activeRequestIds.length,
      skippedCount: 0,
      schoolCount: 1,
      requestIds: expect.arrayContaining(activeRequestIds),
    });

    for (const requestId of activeRequestIds) {
      await expect(getRequestStatus(requestId)).resolves.toBe(
        DismissalRequestStatus.EXPIRED,
      );
      const statusEvent = await prisma.dismissalRequestEvent.findFirstOrThrow({
        where: {
          schoolId,
          requestId,
          type: DismissalRequestEventType.REQUEST_STATUS_CHANGED,
          statusTo: DismissalRequestStatus.EXPIRED,
        },
        select: {
          actorUserId: true,
          statusFrom: true,
          statusTo: true,
          metadata: true,
        },
      });
      expect(statusEvent.actorUserId).toBeNull();
      expect(statusEvent.statusTo).toBe(DismissalRequestStatus.EXPIRED);
      expect(statusEvent.metadata).toEqual(
        expect.objectContaining({
          expiredBy: 'system',
          expiryThresholdMinutes: 3,
          waitMinutes: expect.any(Number),
          worker: 'dismissal-request-expiry',
        }),
      );
      expect(JSON.stringify(statusEvent.metadata)).not.toContain('guardianId');

      const audit = await prisma.auditLog.findFirstOrThrow({
        where: {
          schoolId,
          action: 'dismissal.request.expired',
          resourceId: requestId,
          outcome: AuditOutcome.SUCCESS,
        },
        select: { actorId: true, userType: true, before: true, after: true },
      });
      expect(audit.actorId).toBeNull();
      expect(audit.userType).toBe(UserType.SERVICE_ACCOUNT);
      expect(audit.after).toEqual(
        expect.objectContaining({
          status: 'EXPIRED',
          expiryThresholdMinutes: 3,
          waitMinutes: expect.any(Number),
        }),
      );

      await expect(
        countNotification(requestId, parentUserId),
      ).resolves.toBe(1);
      await expect(countNotification(requestId, staffUserId)).resolves.toBe(1);
      await expect(countStatusChangeEvents(requestId)).resolves.toBe(1);
    }

    await expect(getRequestStatus(freshRequest.requestId)).resolves.toBe(
      DismissalRequestStatus.REQUESTED,
    );
    await expect(getRequestStatus(deletedRequest.requestId)).resolves.toBe(
      DismissalRequestStatus.REQUESTED,
    );
    for (const requestId of terminalRequestIds) {
      await expect(countStatusChangeEvents(requestId)).resolves.toBeLessThanOrEqual(
        1,
      );
    }

    expectEventPublished(
      spy,
      staffUserId,
      REALTIME_SERVER_EVENTS.DISMISSAL_REQUEST_STATUS_CHANGED,
    );
    expectEventPublished(
      spy,
      staffUserId,
      REALTIME_SERVER_EVENTS.DISMISSAL_QUEUE_CHANGED,
    );
    expectEventPublished(
      spy,
      parentUserId,
      REALTIME_SERVER_EVENTS.PARENT_SMART_PICKUP_REQUEST_CHANGED,
    );
    expectEventPublished(
      spy,
      staffUserId,
      REALTIME_SERVER_EVENTS.DISMISSAL_NOTIFICATION_CREATED,
    );
    assertNoLeak(spy.mock.calls.map((call) => call[3]), {
      allowRealtimeEventId: true,
    });

    spy.mockClear();
    const retry = await expireUseCase.runOnce({ now, batchSize: 20 });
    expect(retry.expiredCount).toBe(0);
    expect(retry.requestIds).toEqual([]);
    for (const requestId of activeRequestIds) {
      await expect(countStatusChangeEvents(requestId)).resolves.toBe(1);
      await expect(
        countNotification(requestId, parentUserId),
      ).resolves.toBe(1);
      await expect(countNotification(requestId, staffUserId)).resolves.toBe(1);
    }
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('keeps expired requests out of operational routes but visible in parent recent calls and history', async () => {
    const now = new Date();
    const target = await createRequest({
      status: DismissalRequestStatus.REQUESTED,
      label: 'surface-check',
      requestedAt: minutesBefore(now, 10),
    });

    await expireUseCase.runOnce({ now, batchSize: 10 });

    const active = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/active`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(active.body.data.map((item: { id: string }) => item.id)).not.toContain(
      target.requestId,
    );
    assertNoLeak(active.body);

    const waiting = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/waiting-students`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(waiting.body.data.map((item: { id: string }) => item.id)).not.toContain(
      target.requestId,
    );
    assertNoLeak(waiting.body);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/${target.requestId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/requests/${target.requestId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'queued' })
      .expect(404);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/waiting-students/${target.requestId}/arrival`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(404);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/requests/${target.requestId}/deliver`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(404);

    const recent = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/smart-pickup/recent-calls`)
      .set('Authorization', `Bearer ${parentToken}`)
      .expect(200);
    expect(recent.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: target.requestId,
          status: 'expired',
          isActive: false,
          isTerminal: true,
          canCancel: false,
          canTrack: false,
          expiredAt: expect.any(String),
        }),
      ]),
    );
    assertNoLeak(recent.body);

    const cancel = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/smart-pickup/requests/${target.requestId}/cancel`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({})
      .expect(409);
    expect(cancel.body?.error?.code).toBe('dismissal.request.already_terminal');

    const historyList = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/history?terminalOnly=true`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(historyList.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: target.requestId,
          status: 'expired',
          isTerminal: true,
          expiredAt: expect.any(String),
        }),
      ]),
    );
    assertNoLeak(historyList.body);

    const historyDetail = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/history/${target.requestId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(historyDetail.body.request).toEqual(
      expect.objectContaining({
        id: target.requestId,
        status: 'expired',
        expiredAt: expect.any(String),
      }),
    );
    expect(historyDetail.body.request.timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'request_status_changed',
          statusTo: 'expired',
        }),
      ]),
    );
    assertNoLeak(historyDetail.body);
  });

  it('supports dry-run, default policy fallback, and concurrent idempotency', async () => {
    await prisma.dismissalSettings.deleteMany({ where: { schoolId } });
    const now = new Date();
    const defaultCandidate = await createRequest({
      status: DismissalRequestStatus.REQUESTED,
      label: 'default-policy',
      requestedAt: minutesBefore(now, 181),
    });

    const dryRun = await expireUseCase.runOnce({
      now,
      batchSize: 10,
      dryRun: true,
    });
    expect(dryRun).toMatchObject({
      scannedCount: 1,
      expiredCount: 0,
      skippedCount: 1,
      schoolCount: 1,
      requestIds: [],
    });
    await expect(getRequestStatus(defaultCandidate.requestId)).resolves.toBe(
      DismissalRequestStatus.REQUESTED,
    );

    const applied = await expireUseCase.runOnce({ now, batchSize: 10 });
    expect(applied.requestIds).toEqual([defaultCandidate.requestId]);
    await expect(getRequestStatus(defaultCandidate.requestId)).resolves.toBe(
      DismissalRequestStatus.EXPIRED,
    );
    const event = await prisma.dismissalRequestEvent.findFirstOrThrow({
      where: {
        requestId: defaultCandidate.requestId,
        statusTo: DismissalRequestStatus.EXPIRED,
      },
      select: { metadata: true },
    });
    expect(event.metadata).toEqual(
      expect.objectContaining({ expiryThresholdMinutes: 180 }),
    );

    await configureSettings({
      delayThresholdMinutes: 1,
      urgentThresholdMinutes: 2,
      expiryThresholdMinutes: 3,
    });
    const concurrent = await createRequest({
      status: DismissalRequestStatus.QUEUED,
      label: 'concurrent',
      requestedAt: minutesBefore(now, 10),
    });

    const [left, right] = await Promise.all([
      expireUseCase.runOnce({ now, batchSize: 10 }),
      expireUseCase.runOnce({ now, batchSize: 10 }),
    ]);
    expect(left.expiredCount + right.expiredCount).toBe(1);
    await expect(getRequestStatus(concurrent.requestId)).resolves.toBe(
      DismissalRequestStatus.EXPIRED,
    );
    await expect(countStatusChangeEvents(concurrent.requestId)).resolves.toBe(1);
    await expect(
      countNotification(concurrent.requestId, parentUserId),
    ).resolves.toBe(1);
    await expect(countNotification(concurrent.requestId, staffUserId)).resolves.toBe(
      1,
    );
  });

  async function resetRequestState(): Promise<void> {
    await prisma.communicationNotificationDelivery.deleteMany({ where: { schoolId } });
    await prisma.communicationNotification.deleteMany({ where: { schoolId } });
    await prisma.auditLog.deleteMany({ where: { schoolId, module: 'dismissal' } });
    await prisma.dismissalRequestEvent.deleteMany({ where: { schoolId } });
    await prisma.dismissalRequest.deleteMany({ where: { schoolId } });
    await prisma.studentGuardian.deleteMany({ where: { schoolId } });
    await prisma.enrollment.deleteMany({ where: { schoolId } });
    await prisma.student.deleteMany({ where: { schoolId } });
  }

  async function configureSettings(params: {
    delayThresholdMinutes: number;
    urgentThresholdMinutes: number;
    expiryThresholdMinutes: number;
  }): Promise<void> {
    await prisma.dismissalSettings.upsert({
      where: { schoolId },
      create: {
        schoolId,
        enabled: true,
        timezone: 'Africa/Cairo',
        schoolLatitude: SCHOOL_LATITUDE,
        schoolLongitude: SCHOOL_LONGITUDE,
        requestWindowStartLocal: '00:00',
        requestWindowEndLocal: '23:59',
        delayThresholdMinutes: params.delayThresholdMinutes,
        urgentThresholdMinutes: params.urgentThresholdMinutes,
        expiryThresholdMinutes: params.expiryThresholdMinutes,
        requirePickupCode: false,
        allowDelegatePickup: true,
        allowParentCancelBeforeCalled: true,
        defaultGateId: gateId,
      },
      update: {
        enabled: true,
        delayThresholdMinutes: params.delayThresholdMinutes,
        urgentThresholdMinutes: params.urgentThresholdMinutes,
        expiryThresholdMinutes: params.expiryThresholdMinutes,
        requirePickupCode: false,
        allowParentCancelBeforeCalled: true,
        defaultGateId: gateId,
      },
    });
  }

  async function createSchoolFixture(): Promise<{
    organizationId: string;
    schoolId: string;
  }> {
    const organization = await prisma.organization.create({
      data: {
        slug: `dismissal-expiry-${TEST_RUN_ID}-org`,
        name: `Dismissal Expiry Org ${TEST_RUN_ID}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);

    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `dismissal-expiry-${TEST_RUN_ID}-school`,
        name: `Dismissal Expiry School ${TEST_RUN_ID}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdSchoolIds.push(school.id);

    await prisma.schoolProfile.create({
      data: {
        schoolId: school.id,
        timezone: 'Africa/Cairo',
        latitude: SCHOOL_LATITUDE,
        longitude: SCHOOL_LONGITUDE,
        mapPlaceLabel: 'Expiry Zone',
      },
    });

    return { organizationId: organization.id, schoolId: school.id };
  }

  async function createAcademicFixture(): Promise<{ classroomId: string }> {
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId,
        nameAr: `expiry-year-${TEST_RUN_ID}-ar`,
        nameEn: `Expiry Year ${TEST_RUN_ID}`,
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
        nameAr: `expiry-term-${TEST_RUN_ID}-ar`,
        nameEn: `Expiry Term ${TEST_RUN_ID}`,
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
        nameAr: `expiry-stage-${TEST_RUN_ID}-ar`,
        nameEn: `Expiry Stage ${TEST_RUN_ID}`,
      },
      select: { id: true },
    });
    const grade = await prisma.grade.create({
      data: {
        schoolId,
        stageId: stage.id,
        nameAr: `expiry-grade-${TEST_RUN_ID}-ar`,
        nameEn: `Expiry Grade ${TEST_RUN_ID}`,
      },
      select: { id: true },
    });
    const section = await prisma.section.create({
      data: {
        schoolId,
        gradeId: grade.id,
        nameAr: `expiry-section-${TEST_RUN_ID}-ar`,
        nameEn: `Expiry Section ${TEST_RUN_ID}`,
      },
      select: { id: true },
    });
    const classroom = await prisma.classroom.create({
      data: {
        schoolId,
        sectionId: section.id,
        nameAr: `expiry-classroom-${TEST_RUN_ID}-ar`,
        nameEn: `Expiry Classroom ${TEST_RUN_ID}`,
      },
      select: { id: true },
    });

    return { classroomId: classroom.id };
  }

  async function createGate(): Promise<string> {
    const gate = await prisma.dismissalGate.create({
      data: {
        schoolId,
        code: `EXP-${TEST_RUN_ID}`,
        name: 'Expiry Gate',
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
        firstName: 'Expiry',
        lastName: 'Guardian',
        relation: 'parent',
        phone: `010${TEST_RUN_ID.slice(0, 6)}`,
        canPickup: true,
        canReceiveNotifications: true,
      },
      select: { id: true },
    });
    return guardian.id;
  }

  async function createRequest(params: {
    status: DismissalRequestStatus;
    label: string;
    requestedAt: Date;
    deletedAt?: Date | null;
  }): Promise<{ requestId: string; studentId: string }> {
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
        firstName: 'Expiry',
        lastName: params.label,
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
        gateId,
        status: params.status,
        parentLatitude: SCHOOL_LATITUDE,
        parentLongitude: SCHOOL_LONGITUDE,
        distanceMeters: 0,
        geofencePassed: true,
        requestedAt: params.requestedAt,
        deletedAt: params.deletedAt ?? null,
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
    if (params.status !== DismissalRequestStatus.REQUESTED) {
      await prisma.dismissalRequestEvent.create({
        data: {
          schoolId,
          requestId: dismissalRequest.id,
          type: DismissalRequestEventType.REQUEST_STATUS_CHANGED,
          actorUserId: parentUserId,
          statusFrom: DismissalRequestStatus.REQUESTED,
          statusTo: params.status,
        },
      });
    }

    return { requestId: dismissalRequest.id, studentId: student.id };
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

  async function getRequestStatus(
    requestId: string,
  ): Promise<DismissalRequestStatus> {
    const record = await prisma.dismissalRequest.findUniqueOrThrow({
      where: { id: requestId },
      select: { status: true },
    });
    return record.status;
  }

  async function countStatusChangeEvents(requestId: string): Promise<number> {
    return prisma.dismissalRequestEvent.count({
      where: {
        schoolId,
        requestId,
        type: DismissalRequestEventType.REQUEST_STATUS_CHANGED,
        statusTo: DismissalRequestStatus.EXPIRED,
      },
    });
  }

  async function countNotification(
    requestId: string,
    recipientUserId: string,
  ): Promise<number> {
    return prisma.communicationNotification.count({
      where: {
        schoolId,
        recipientUserId,
        sourceModule: CommunicationNotificationSourceModule.DISMISSAL,
        sourceType: 'dismissal_request',
        sourceId: requestId,
        type: CommunicationNotificationType.DISMISSAL_REQUEST_EXPIRED,
      },
    });
  }

  function publisherSpy(): PublishSpy {
    const publisher = coreWorker.get(RealtimePublisherService);
    return jest.spyOn(publisher, 'publishToUser') as PublishSpy;
  }

  function expectEventPublished(
    spy: PublishSpy,
    userId: string,
    eventName: string,
  ): void {
    expect(
      spy.mock.calls.some(
        ([publishedSchoolId, recipientUserId, publishedEvent]) =>
          publishedSchoolId === schoolId &&
          recipientUserId === userId &&
          publishedEvent === eventName,
      ),
    ).toBe(true);
  }
});

function restoreEnvironmentValue(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

function minutesBefore(now: Date, minutes: number): Date {
  return new Date(now.getTime() - minutes * 60_000);
}

function assertNoLeak(
  payload: unknown,
  options: { allowRealtimeEventId?: boolean } = {},
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
    'pickupCode',
    'pickupCodeHash',
    'pickupCodeSalt',
    'pickupRecipientToken',
    'requestId',
    'eventId',
  ]);
  if (options.allowRealtimeEventId) {
    forbiddenKeys.delete('eventId');
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
