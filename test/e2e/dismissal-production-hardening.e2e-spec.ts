import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
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
import { RealtimePublisherService } from '../../src/infrastructure/realtime/realtime-publisher.service';
import { ExpireDismissalRequestsUseCase } from '../../src/modules/dismissal/requests/application/expire-dismissal-requests.use-case';
import {
  DismissalRequestsExpiryRepository,
  MAX_DISMISSAL_EXPIRY_BATCH_SIZE,
} from '../../src/modules/dismissal/requests/infrastructure/dismissal-requests-expiry.repository';
import { CORE_WORKER_CONSUMER_PROVIDERS } from '../../src/runtime/core-worker/core-worker-consumers.module';
import { CoreWorkerRuntimeModule } from '../../src/runtime/core-worker/core-worker-runtime.module';

const GLOBAL_PREFIX = '/api/v1';
const PASSWORD = 'DismissalOpsAudit123!';
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

describe('DISMISSAL-OPERATIONS-AUDIT-1A production hardening (e2e)', () => {
  let app: INestApplication<App>;
  let coreWorker: TestingModule;
  let prisma: PrismaClient;
  let expireUseCase: ExpireDismissalRequestsUseCase;
  let expiryRepository: DismissalRequestsExpiryRepository;
  let realtimePublisher: RealtimePublisherService;
  let organizationId: string;
  let schoolId: string;
  let classroomId: string;
  let gateId: string;
  let parentUserId: string;
  let staffUserId: string;
  let guardianId: string;
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
      findSystemRole('school_admin'),
      findSystemRole('parent'),
      findSystemRole('dismissal_staff'),
    ]);

    const fixture = await createSchoolFixture();
    organizationId = fixture.organizationId;
    schoolId = fixture.schoolId;
    classroomId = (await createAcademicFixture()).classroomId;
    gateId = await createGate({ code: `OPS-${TEST_RUN_ID}`, sortOrder: 1 });

    const admin = await createUserWithMembership({
      email: `dismissal-ops-${TEST_RUN_ID}-admin@moazez.local`,
      roleId: schoolAdminRole.id,
      userType: UserType.SCHOOL_USER,
      firstName: 'Ops',
      lastName: 'Admin',
    });
    const parent = await createUserWithMembership({
      email: `dismissal-ops-${TEST_RUN_ID}-parent@moazez.local`,
      roleId: parentRole.id,
      userType: UserType.PARENT,
      firstName: 'Ops',
      lastName: 'Parent',
    });
    const staff = await createUserWithMembership({
      email: `dismissal-ops-${TEST_RUN_ID}-staff@moazez.local`,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
      firstName: 'Ops',
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

    const coreWorkerBuilder = Test.createTestingModule({
      imports: [CoreWorkerRuntimeModule],
    });
    for (const consumerProvider of CORE_WORKER_CONSUMER_PROVIDERS) {
      coreWorkerBuilder.overrideProvider(consumerProvider).useValue({});
    }
    coreWorker = await coreWorkerBuilder.compile();
    await coreWorker.init();

    expireUseCase = coreWorker.get(ExpireDismissalRequestsUseCase);
    expiryRepository = coreWorker.get(DismissalRequestsExpiryRepository);
    realtimePublisher = coreWorker.get(RealtimePublisherService);
    adminToken = await login(admin.email);
    parentToken = await login(parent.email);
    staffToken = await login(staff.email);
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

  it('enforces bounded list limits and stable queue pagination', async () => {
    const now = new Date();
    const older = await createRequest({
      status: DismissalRequestStatus.REQUESTED,
      label: 'older-page',
      requestedAt: minutesBefore(now, 2),
    });
    const newer = await createRequest({
      status: DismissalRequestStatus.REQUESTED,
      label: 'newer-page',
      requestedAt: minutesBefore(now, 1),
    });

    for (const path of [
      '/dismissal/requests/active',
      '/dismissal/waiting-students',
      '/dismissal/requests/history',
      '/dismissal/gates',
      '/dismissal/staff-assignments',
      '/dismissal/notifications',
    ]) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}${path}?limit=101`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    }
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/smart-pickup/recent-calls?limit=101`)
      .set('Authorization', `Bearer ${parentToken}`)
      .expect(400);

    const firstPage = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/dismissal/requests/active?sort=requested_at_asc&page=1&limit=1`,
      )
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const secondPage = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/dismissal/requests/active?sort=requested_at_asc&page=2&limit=1`,
      )
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(firstPage.body.data).toHaveLength(1);
    expect(firstPage.body.data[0].id).toBe(older.requestId);
    expect(firstPage.body.pagination).toMatchObject({
      page: 1,
      limit: 1,
      totalPages: 2,
    });
    expect(secondPage.body.data).toHaveLength(1);
    expect(secondPage.body.data[0].id).toBe(newer.requestId);
    assertNoLeak(firstPage.body);
    assertNoLeak(secondPage.body);
  });

  it('exposes and validates expiry settings without leaking internals', async () => {
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

    const invalid = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/settings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ expiryThresholdMinutes: 2 })
      .expect(422);
    expect(invalid.body?.error?.code).toBe(
      'dismissal.settings.invalid_thresholds',
    );
  });

  it('caps expiry batch size before querying candidates', async () => {
    const spy = jest
      .spyOn(expiryRepository, 'listExpiredCandidates')
      .mockResolvedValue([]);

    const result = await expireUseCase.runOnce({
      batchSize: Number.MAX_SAFE_INTEGER,
      dryRun: true,
    });

    expect(result).toMatchObject({
      scannedCount: 0,
      expiredCount: 0,
      skippedCount: 0,
      requestIds: [],
    });
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ batchSize: MAX_DISMISSAL_EXPIRY_BATCH_SIZE }),
    );
    spy.mockRestore();
  });

  it('dry-run does not mutate stale active requests', async () => {
    const now = new Date();
    const requestRecord = await createRequest({
      status: DismissalRequestStatus.REQUESTED,
      label: 'dry-run',
      requestedAt: minutesBefore(now, 10),
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
      requestIds: [],
    });
    await expect(getRequestStatus(requestRecord.requestId)).resolves.toBe(
      DismissalRequestStatus.REQUESTED,
    );
    await expect(countExpiredNotifications(requestRecord.requestId)).resolves.toBe(
      0,
    );
  });

  it('expires despite realtime publish failure and remains stable across history, recent calls, and notifications', async () => {
    const now = new Date();
    const requestRecord = await createRequest({
      status: DismissalRequestStatus.REQUESTED,
      label: 'publish-failure',
      requestedAt: minutesBefore(now, 10),
    });
    const publishSpy = jest
      .spyOn(realtimePublisher, 'publishToUser')
      .mockImplementation(() => {
        throw new Error('simulated publisher failure');
      });

    const result = await expireUseCase.runOnce({ now, batchSize: 10 });
    expect(result).toMatchObject({
      scannedCount: 1,
      expiredCount: 1,
      skippedCount: 0,
      requestIds: [requestRecord.requestId],
    });
    await expect(getRequestStatus(requestRecord.requestId)).resolves.toBe(
      DismissalRequestStatus.EXPIRED,
    );
    await expect(countExpiredNotifications(requestRecord.requestId)).resolves.toBe(
      2,
    );

    publishSpy.mockRestore();
    const retry = await expireUseCase.runOnce({ now, batchSize: 10 });
    expect(retry.expiredCount).toBe(0);
    await expect(countExpiredNotifications(requestRecord.requestId)).resolves.toBe(
      2,
    );

    const active = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/active`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(active.body.data.map((item: { id: string }) => item.id)).not.toContain(
      requestRecord.requestId,
    );
    assertNoLeak(active.body);

    const history = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/history?terminalOnly=true`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(history.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: requestRecord.requestId,
          status: 'expired',
          expiredAt: expect.any(String),
        }),
      ]),
    );
    assertNoLeak(history.body);

    const recent = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/smart-pickup/recent-calls`)
      .set('Authorization', `Bearer ${parentToken}`)
      .expect(200);
    expect(recent.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: requestRecord.requestId,
          status: 'expired',
          canCancel: false,
          canTrack: false,
          expiredAt: expect.any(String),
        }),
      ]),
    );
    assertNoLeak(recent.body);

    const notifications = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/notifications?type=request_expired`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    expect(notifications.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'request_expired',
          request: expect.objectContaining({
            id: requestRecord.requestId,
            status: 'expired',
          }),
        }),
      ]),
    );
    expect(notifications.body.summary.requestExpiredCount).toBeGreaterThanOrEqual(1);
    assertNoLeak(notifications.body);
  });

  async function resetRequestState(): Promise<void> {
    await prisma.communicationNotificationPushAttempt.deleteMany({
      where: { schoolId },
    });
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
        slug: `dismissal-ops-${TEST_RUN_ID}-org`,
        name: `Dismissal Ops Org ${TEST_RUN_ID}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);

    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `dismissal-ops-${TEST_RUN_ID}-school`,
        name: `Dismissal Ops School ${TEST_RUN_ID}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdSchoolIds.push(school.id);

    await prisma.schoolProfile.create({
      data: {
        schoolId: school.id,
        schoolName: `Dismissal Ops School ${TEST_RUN_ID}`,
        timezone: 'Africa/Cairo',
        latitude: SCHOOL_LATITUDE,
        longitude: SCHOOL_LONGITUDE,
        mapPlaceLabel: 'Ops Audit Zone',
      },
    });

    return { organizationId: organization.id, schoolId: school.id };
  }

  async function createAcademicFixture(): Promise<{ classroomId: string }> {
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId,
        nameAr: `ops-year-${TEST_RUN_ID}-ar`,
        nameEn: `Ops Year ${TEST_RUN_ID}`,
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
        nameAr: `ops-term-${TEST_RUN_ID}-ar`,
        nameEn: `Ops Term ${TEST_RUN_ID}`,
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
        nameAr: `ops-stage-${TEST_RUN_ID}-ar`,
        nameEn: `Ops Stage ${TEST_RUN_ID}`,
      },
      select: { id: true },
    });
    const grade = await prisma.grade.create({
      data: {
        schoolId,
        stageId: stage.id,
        nameAr: `ops-grade-${TEST_RUN_ID}-ar`,
        nameEn: `Ops Grade ${TEST_RUN_ID}`,
      },
      select: { id: true },
    });
    const section = await prisma.section.create({
      data: {
        schoolId,
        gradeId: grade.id,
        nameAr: `ops-section-${TEST_RUN_ID}-ar`,
        nameEn: `Ops Section ${TEST_RUN_ID}`,
      },
      select: { id: true },
    });
    const classroom = await prisma.classroom.create({
      data: {
        schoolId,
        sectionId: section.id,
        nameAr: `ops-classroom-${TEST_RUN_ID}-ar`,
        nameEn: `Ops Classroom ${TEST_RUN_ID}`,
      },
      select: { id: true },
    });

    return { classroomId: classroom.id };
  }

  async function createGate(params: {
    code: string;
    sortOrder: number;
  }): Promise<string> {
    const gate = await prisma.dismissalGate.create({
      data: {
        schoolId,
        code: params.code,
        name: `Ops Gate ${params.sortOrder}`,
        status: DismissalGateOperationalStatus.OPEN,
        isActive: true,
        sortOrder: params.sortOrder,
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
        firstName: 'Ops',
        lastName: 'Guardian',
        relation: 'parent',
        phone: `012${TEST_RUN_ID.slice(0, 6)}`,
        isPrimary: true,
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
        firstName: 'Ops',
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

  async function countExpiredNotifications(requestId: string): Promise<number> {
    return prisma.communicationNotification.count({
      where: {
        schoolId,
        sourceModule: CommunicationNotificationSourceModule.DISMISSAL,
        sourceType: 'dismissal_request',
        sourceId: requestId,
        type: CommunicationNotificationType.DISMISSAL_REQUEST_EXPIRED,
      },
    });
  }
});

function minutesBefore(now: Date, minutes: number): Date {
  return new Date(now.getTime() - minutes * 60_000);
}

function assertNoLeak(payload: unknown): void {
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
    'pickupCode',
    'pickupCodeHash',
    'pickupCodeSalt',
    'pickupRecipientToken',
  ]);

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
