import { randomUUID } from 'node:crypto';
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

const GLOBAL_PREFIX = '/api/v1';
const PASSWORD = 'ParentRecentCancel123!';
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

describe('PARENT-DISMISSAL-1C recent calls and cancel (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let organizationAId: string;
  let organizationBId: string;
  let schoolAId: string;
  let schoolBId: string;
  let parentAId: string;
  let otherParentAId: string;
  let guardianAId: string;
  let otherGuardianAId: string;
  let guardianBId: string;
  let classroomAId: string;
  let classroomBId: string;
  let gateAId: string;
  let gateBId: string;
  let parentToken: string;
  let adminToken: string;
  const createdUserIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdOrganizationIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [parentRole, schoolAdminRole] = await Promise.all([
      prisma.role.findFirst({
        where: { key: 'parent', schoolId: null, isSystem: true },
        select: { id: true },
      }),
      prisma.role.findFirst({
        where: { key: 'school_admin', schoolId: null, isSystem: true },
        select: { id: true },
      }),
    ]);
    if (!parentRole || !schoolAdminRole) {
      throw new Error('Required system roles not found - run `npm run seed`.');
    }

    const fixtureA = await createSchoolFixture('a');
    const fixtureB = await createSchoolFixture('b');
    organizationAId = fixtureA.organizationId;
    organizationBId = fixtureB.organizationId;
    schoolAId = fixtureA.schoolId;
    schoolBId = fixtureB.schoolId;

    await createSchoolProfileFixture(schoolAId, SCHOOL_LATITUDE, SCHOOL_LONGITUDE);
    await createSchoolProfileFixture(schoolBId, 52.52, 13.405);
    classroomAId = (await createAcademicFixture('a', schoolAId)).classroomId;
    classroomBId = (await createAcademicFixture('b', schoolBId)).classroomId;

    gateAId = await createGate({
      schoolId: schoolAId,
      code: `PCAN-A-${TEST_RUN_ID}`,
      name: 'Parent Cancel Main Gate',
    });
    gateBId = await createGate({
      schoolId: schoolBId,
      code: `PCAN-B-${TEST_RUN_ID}`,
      name: 'Parent Cancel Cross Gate',
    });

    const parent = await createUserWithMembership({
      email: `parent-cancel-${TEST_RUN_ID}@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: parentRole.id,
      userType: UserType.PARENT,
      firstName: 'Parent',
      lastName: 'Cancel',
    });
    const otherParent = await createUserWithMembership({
      email: `parent-cancel-${TEST_RUN_ID}-other@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: parentRole.id,
      userType: UserType.PARENT,
      firstName: 'Other',
      lastName: 'Parent',
    });
    const admin = await createUserWithMembership({
      email: `parent-cancel-${TEST_RUN_ID}-admin@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: schoolAdminRole.id,
      userType: UserType.SCHOOL_USER,
      firstName: 'School',
      lastName: 'Admin',
    });
    parentAId = parent.userId;
    otherParentAId = otherParent.userId;

    guardianAId = await createGuardian({
      schoolId: schoolAId,
      organizationId: organizationAId,
      userId: parentAId,
      marker: 'a',
    });
    otherGuardianAId = await createGuardian({
      schoolId: schoolAId,
      organizationId: organizationAId,
      userId: otherParentAId,
      marker: 'other',
    });
    guardianBId = await createGuardian({
      schoolId: schoolBId,
      organizationId: organizationBId,
      userId: parentAId,
      marker: 'cross',
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
    adminToken = await login(admin.email);
  });

  beforeEach(async () => {
    await resetRequestState();
    await configureSettings({ allowParentCancelBeforeCalled: true });
  });

  afterAll(async () => {
    if (prisma) {
      const schoolIds = [schoolAId, schoolBId].filter(Boolean);
      await prisma.auditLog.deleteMany({ where: { schoolId: { in: schoolIds } } });
      await prisma.dismissalRequestEvent.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.dismissalRequest.deleteMany({
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
      await prisma.guardian.deleteMany({ where: { schoolId: { in: schoolIds } } });
      await prisma.student.deleteMany({ where: { schoolId: { in: schoolIds } } });
      await prisma.classroom.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.section.deleteMany({ where: { schoolId: { in: schoolIds } } });
      await prisma.grade.deleteMany({ where: { schoolId: { in: schoolIds } } });
      await prisma.stage.deleteMany({ where: { schoolId: { in: schoolIds } } });
      await prisma.term.deleteMany({ where: { schoolId: { in: schoolIds } } });
      await prisma.academicYear.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.schoolProfile.deleteMany({
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

  it('lists owned current-school recent calls with filters, summary, and no pickup-code leaks', async () => {
    const idsByStatus = new Map<DismissalRequestStatus, string>();
    for (const status of [
      DismissalRequestStatus.REQUESTED,
      DismissalRequestStatus.QUEUED,
      DismissalRequestStatus.CALLED,
      DismissalRequestStatus.MOVING,
      DismissalRequestStatus.AT_GATE,
      DismissalRequestStatus.READY,
      DismissalRequestStatus.HANDED_OVER,
      DismissalRequestStatus.CANCELLED,
      DismissalRequestStatus.EXPIRED,
    ]) {
      const created = await createOwnedRequest({ status, label: status });
      idsByStatus.set(status, created.requestId);
    }
    const deleted = await createOwnedRequest({
      status: DismissalRequestStatus.REQUESTED,
      label: 'deleted',
      deletedAt: new Date(),
    });
    const unowned = await createRequestForGuardian({
      schoolId: schoolAId,
      organizationId: organizationAId,
      classroomId: classroomAId,
      guardianId: otherGuardianAId,
      requestedById: otherParentAId,
      gateId: gateAId,
      status: DismissalRequestStatus.REQUESTED,
      firstName: 'Unowned',
      lastName: 'Hidden',
    });
    const crossSchool = await createRequestForGuardian({
      schoolId: schoolBId,
      organizationId: organizationBId,
      classroomId: classroomBId,
      guardianId: guardianBId,
      requestedById: parentAId,
      gateId: gateBId,
      status: DismissalRequestStatus.REQUESTED,
      firstName: 'Cross',
      lastName: 'Hidden',
    });

    const response = await recentCalls().expect(200);
    const ids = response.body.data.map((item: { id: string }) => item.id);
    expect(ids).toHaveLength(9);
    expect(ids).not.toContain(deleted.requestId);
    expect(ids).not.toContain(unowned.requestId);
    expect(ids).not.toContain(crossSchool.requestId);
    expect(response.body.summary).toMatchObject({
      totalCount: 9,
      activeCount: 6,
      requestedCount: 1,
      queuedCount: 1,
      calledCount: 1,
      movingCount: 1,
      atGateCount: 1,
      readyCount: 1,
      handedOverCount: 1,
      cancelledCount: 1,
      expiredCount: 1,
      cancellableCount: 2,
    });

    const byStatus = new Map(
      response.body.data.map((item: { status: string; canCancel: boolean }) => [
        item.status,
        item.canCancel,
      ]),
    );
    expect(byStatus.get('requested')).toBe(true);
    expect(byStatus.get('queued')).toBe(true);
    for (const status of [
      'called',
      'moving',
      'at_gate',
      'ready',
      'handed_over',
      'cancelled',
      'expired',
    ]) {
      expect(byStatus.get(status)).toBe(false);
    }
    assertNoParentRecentLeak(response.body);

    const childFilter = await recentCalls({
      childId: response.body.data[0].child.id,
    }).expect(200);
    expect(childFilter.body.data).toHaveLength(1);

    const cancelledFilter = await recentCalls({ status: 'cancelled' }).expect(200);
    expect(cancelledFilter.body.data).toHaveLength(1);
    expect(cancelledFilter.body.data[0].id).toBe(
      idsByStatus.get(DismissalRequestStatus.CANCELLED),
    );

    const activeOnly = await recentCalls({ activeOnly: 'true' }).expect(200);
    expect(activeOnly.body.data).toHaveLength(6);
    expect(activeOnly.body.data.map((item: { status: string }) => item.status)).not
      .toContain('cancelled');

    const pageTwo = await recentCalls({
      page: '2',
      limit: '2',
      sort: 'requested_at_asc',
    }).expect(200);
    expect(pageTwo.body.data).toHaveLength(2);
    expect(pageTwo.body.pagination).toEqual({
      page: 2,
      limit: 2,
      totalPages: 5,
    });

    await configureSettings({ allowParentCancelBeforeCalled: false });
    const disabledCanCancel = await recentCalls({ activeOnly: 'true' }).expect(200);
    expect(
      disabledCanCancel.body.data.every(
        (item: { canCancel: boolean }) => item.canCancel === false,
      ),
    ).toBe(true);
  });

  it('cancels owned REQUESTED and QUEUED requests, creates safe events/audit, and is idempotent', async () => {
    const requested = await createOwnedRequest({
      status: DismissalRequestStatus.REQUESTED,
      label: 'cancel-requested',
    });
    const queued = await createOwnedRequest({
      status: DismissalRequestStatus.QUEUED,
      label: 'cancel-queued',
    });

    const requestedResponse = await cancelRequest(requested.requestId, {
      note: '  Parent changed plans  ',
    }).expect(201);
    expect(requestedResponse.body.request).toMatchObject({
      id: requested.requestId,
      status: 'cancelled',
      previousStatus: 'requested',
      changed: true,
    });
    expect(requestedResponse.body.request.timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'request_status_changed',
          statusFrom: 'requested',
          statusTo: 'cancelled',
          note: 'Parent changed plans',
        }),
      ]),
    );
    assertNoParentRecentLeak(requestedResponse.body);

    const queuedResponse = await cancelRequest(queued.requestId, {}).expect(201);
    expect(queuedResponse.body.request).toMatchObject({
      id: queued.requestId,
      status: 'cancelled',
      previousStatus: 'queued',
      changed: true,
    });

    await expect(getRequestStatus(requested.requestId)).resolves.toBe(
      DismissalRequestStatus.CANCELLED,
    );
    await expect(countStatusChangeEvents(requested.requestId)).resolves.toBe(1);
    const audit = await prisma.auditLog.findFirst({
      where: {
        schoolId: schoolAId,
        action: 'dismissal.request.cancelled_by_parent',
        resourceId: requested.requestId,
        outcome: AuditOutcome.SUCCESS,
      },
      select: { actorId: true, before: true, after: true },
    });
    expect(audit).toEqual(
      expect.objectContaining({
        actorId: parentAId,
        before: expect.objectContaining({ status: 'REQUESTED' }),
        after: expect.objectContaining({
          status: 'CANCELLED',
          note: true,
        }),
      }),
    );

    const eventCountBefore = await countStatusChangeEvents(requested.requestId);
    const auditCountBefore = await countCancelAudits(requested.requestId);
    const retry = await cancelRequest(requested.requestId, {}).expect(201);
    expect(retry.body.request).toMatchObject({
      id: requested.requestId,
      status: 'cancelled',
      previousStatus: null,
      changed: false,
    });
    await expect(countStatusChangeEvents(requested.requestId)).resolves.toBe(
      eventCountBefore,
    );
    await expect(countCancelAudits(requested.requestId)).resolves.toBe(
      auditCountBefore,
    );
  });

  it('rejects disabled, non-cancellable, terminal, cross-school, unowned, and deleted requests without events', async () => {
    await configureSettings({ allowParentCancelBeforeCalled: false });
    const disabled = await createOwnedRequest({
      status: DismissalRequestStatus.REQUESTED,
      label: 'disabled',
    });
    await expectFailedCancel({
      requestId: disabled.requestId,
      expectedStatus: 409,
      expectedCode: 'dismissal.request.cancel_disabled',
      expectedPersistedStatus: DismissalRequestStatus.REQUESTED,
    });

    await configureSettings({ allowParentCancelBeforeCalled: true });
    for (const status of [
      DismissalRequestStatus.CALLED,
      DismissalRequestStatus.MOVING,
      DismissalRequestStatus.AT_GATE,
      DismissalRequestStatus.READY,
    ]) {
      const requestRecord = await createOwnedRequest({ status, label: status });
      await expectFailedCancel({
        requestId: requestRecord.requestId,
        expectedStatus: 409,
        expectedCode: 'dismissal.request.cancel_not_allowed',
        expectedPersistedStatus: status,
      });
    }

    for (const status of [
      DismissalRequestStatus.HANDED_OVER,
      DismissalRequestStatus.EXPIRED,
    ]) {
      const requestRecord = await createOwnedRequest({ status, label: status });
      await expectFailedCancel({
        requestId: requestRecord.requestId,
        expectedStatus: 409,
        expectedCode: 'dismissal.request.already_terminal',
        expectedPersistedStatus: status,
      });
    }

    const unowned = await createRequestForGuardian({
      schoolId: schoolAId,
      organizationId: organizationAId,
      classroomId: classroomAId,
      guardianId: otherGuardianAId,
      requestedById: otherParentAId,
      gateId: gateAId,
      status: DismissalRequestStatus.REQUESTED,
      firstName: 'Unowned',
      lastName: 'Cancel',
    });
    const cross = await createRequestForGuardian({
      schoolId: schoolBId,
      organizationId: organizationBId,
      classroomId: classroomBId,
      guardianId: guardianBId,
      requestedById: parentAId,
      gateId: gateBId,
      status: DismissalRequestStatus.REQUESTED,
      firstName: 'Cross',
      lastName: 'Cancel',
    });
    const deleted = await createOwnedRequest({
      status: DismissalRequestStatus.REQUESTED,
      label: 'deleted-cancel',
      deletedAt: new Date(),
    });

    for (const requestId of [
      unowned.requestId,
      cross.requestId,
      deleted.requestId,
      randomUUID(),
    ]) {
      const response = await cancelRequest(requestId, {}).expect(404);
      expect(response.body?.error?.code).toBe('dismissal.request.not_found');
    }
  });

  it('removes cancelled requests from dismissal operational surfaces and allows a new request for the same child', async () => {
    const requestRecord = await createOwnedRequest({
      status: DismissalRequestStatus.REQUESTED,
      label: 'regression',
    });

    await cancelRequest(requestRecord.requestId, {}).expect(201);

    const active = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/active`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(active.body.data.map((item: { id: string }) => item.id)).not.toContain(
      requestRecord.requestId,
    );

    const waiting = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/waiting-students`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(waiting.body.data.map((item: { id: string }) => item.id)).not.toContain(
      requestRecord.requestId,
    );

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/${requestRecord.requestId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/requests/${requestRecord.requestId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'queued' })
      .expect(404);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/requests/${requestRecord.requestId}/deliver`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(404);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/waiting-students/${requestRecord.requestId}/arrival`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(404);

    const newRequest = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/smart-pickup/requests`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        childId: requestRecord.studentId,
        latitude: SCHOOL_LATITUDE,
        longitude: SCHOOL_LONGITUDE,
        gateId: gateAId,
        clientRequestId: `after-cancel-${TEST_RUN_ID}`,
      })
      .expect(201);
    expect(newRequest.body.request.child.id).toBe(requestRecord.studentId);
    expect(newRequest.body.pickup).toEqual({
      codeRequired: false,
      codeIssued: false,
    });
    assertNoParentRecentLeak(newRequest.body);
  });

  function recentCalls(query: Record<string, string> = {}) {
    return request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/smart-pickup/recent-calls`)
      .query(query)
      .set('Authorization', `Bearer ${parentToken}`);
  }

  function cancelRequest(requestId: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/smart-pickup/requests/${requestId}/cancel`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send(body);
  }

  async function expectFailedCancel(params: {
    requestId: string;
    expectedStatus: number;
    expectedCode: string;
    expectedPersistedStatus: DismissalRequestStatus;
  }) {
    const eventsBefore = await countStatusChangeEvents(params.requestId);
    const response = await cancelRequest(params.requestId, {
      note: 'should not persist',
    }).expect(params.expectedStatus);
    expect(response.body?.error?.code).toBe(params.expectedCode);
    await expect(getRequestStatus(params.requestId)).resolves.toBe(
      params.expectedPersistedStatus,
    );
    await expect(countStatusChangeEvents(params.requestId)).resolves.toBe(
      eventsBefore,
    );
  }

  async function resetRequestState(): Promise<void> {
    const schoolIds = [schoolAId, schoolBId].filter(Boolean);
    await prisma.auditLog.deleteMany({
      where: { module: 'dismissal', schoolId: { in: schoolIds } },
    });
    await prisma.dismissalRequestEvent.deleteMany({
      where: { schoolId: { in: schoolIds } },
    });
    await prisma.dismissalRequest.deleteMany({
      where: { schoolId: { in: schoolIds } },
    });
    await prisma.dismissalSettings.deleteMany({
      where: { schoolId: { in: schoolIds } },
    });
  }

  async function configureSettings(params: {
    allowParentCancelBeforeCalled: boolean;
  }) {
    await prisma.dismissalSettings.upsert({
      where: { schoolId: schoolAId },
      create: {
        schoolId: schoolAId,
        enabled: true,
        timezone: TIMEZONE,
        schoolLatitude: SCHOOL_LATITUDE,
        schoolLongitude: SCHOOL_LONGITUDE,
        allowedRadiusMeters: 150,
        requestWindowStartLocal: '00:00',
        requestWindowEndLocal: '23:59',
        requirePickupCode: false,
        allowParentCancelBeforeCalled: params.allowParentCancelBeforeCalled,
        defaultGateId: gateAId,
      },
      update: {
        enabled: true,
        timezone: TIMEZONE,
        schoolLatitude: SCHOOL_LATITUDE,
        schoolLongitude: SCHOOL_LONGITUDE,
        allowedRadiusMeters: 150,
        requestWindowStartLocal: '00:00',
        requestWindowEndLocal: '23:59',
        requirePickupCode: false,
        allowParentCancelBeforeCalled: params.allowParentCancelBeforeCalled,
        defaultGateId: gateAId,
      },
    });
  }

  async function createOwnedRequest(params: {
    status: DismissalRequestStatus;
    label: string;
    deletedAt?: Date | null;
  }): Promise<{ requestId: string; studentId: string }> {
    return createRequestForGuardian({
      schoolId: schoolAId,
      organizationId: organizationAId,
      classroomId: classroomAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      gateId: gateAId,
      status: params.status,
      firstName: 'Recent',
      lastName: params.label,
      deletedAt: params.deletedAt,
    });
  }

  async function createRequestForGuardian(params: {
    schoolId: string;
    organizationId: string;
    classroomId: string;
    guardianId: string;
    requestedById: string;
    gateId: string;
    status: DismissalRequestStatus;
    firstName: string;
    lastName: string;
    deletedAt?: Date | null;
  }): Promise<{ requestId: string; studentId: string }> {
    const student = await createStudentFixture({
      schoolId: params.schoolId,
      organizationId: params.organizationId,
      classroomId: params.classroomId,
      guardianId: params.guardianId,
      firstName: params.firstName,
      lastName: params.lastName,
    });
    const requestRecord = await prisma.dismissalRequest.create({
      data: {
        schoolId: params.schoolId,
        studentId: student.studentId,
        enrollmentId: student.enrollmentId,
        guardianId: params.guardianId,
        requestedById: params.requestedById,
        gateId: params.gateId,
        status: params.status,
        clientRequestId: null,
        parentLatitude: SCHOOL_LATITUDE,
        parentLongitude: SCHOOL_LONGITUDE,
        distanceMeters: 0,
        geofencePassed: true,
        requestedAt: new Date(Date.now() - 5 * 60_000),
        deletedAt: params.deletedAt ?? null,
      },
      select: { id: true },
    });
    await prisma.dismissalRequestEvent.create({
      data: {
        schoolId: params.schoolId,
        requestId: requestRecord.id,
        type: DismissalRequestEventType.REQUEST_CREATED,
        actorUserId: params.requestedById,
        statusFrom: null,
        statusTo: DismissalRequestStatus.REQUESTED,
        metadata: { source: 'test' },
      },
    });
    if (params.status !== DismissalRequestStatus.REQUESTED) {
      await prisma.dismissalRequestEvent.create({
        data: {
          schoolId: params.schoolId,
          requestId: requestRecord.id,
          type: DismissalRequestEventType.REQUEST_STATUS_CHANGED,
          actorUserId: params.requestedById,
          statusFrom: DismissalRequestStatus.REQUESTED,
          statusTo: params.status,
        },
      });
    }

    return { requestId: requestRecord.id, studentId: student.studentId };
  }

  async function createSchoolFixture(label: string): Promise<{
    organizationId: string;
    schoolId: string;
  }> {
    const organization = await prisma.organization.create({
      data: {
        slug: `parent-cancel-${TEST_RUN_ID}-org-${label}`,
        name: `Parent Cancel Org ${label}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);

    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `parent-cancel-${TEST_RUN_ID}-school-${label}`,
        name: `Parent Cancel School ${label}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdSchoolIds.push(school.id);

    return { organizationId: organization.id, schoolId: school.id };
  }

  async function createSchoolProfileFixture(
    schoolId: string,
    latitude: number,
    longitude: number,
  ) {
    await prisma.schoolProfile.create({
      data: {
        schoolId,
        timezone: TIMEZONE,
        latitude,
        longitude,
        mapPlaceLabel: 'Parent Cancel Zone',
      },
    });
  }

  async function createAcademicFixture(label: string, schoolId: string) {
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId,
        nameAr: `cancel-year-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Cancel Year ${label}`,
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
        nameAr: `cancel-term-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Cancel Term ${label}`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-01-31T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    const stage = await prisma.stage.create({
      data: {
        schoolId,
        nameAr: `cancel-stage-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Cancel Stage ${label}`,
      },
      select: { id: true },
    });
    const grade = await prisma.grade.create({
      data: {
        schoolId,
        stageId: stage.id,
        nameAr: `cancel-grade-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Cancel Grade ${label}`,
      },
      select: { id: true },
    });
    const section = await prisma.section.create({
      data: {
        schoolId,
        gradeId: grade.id,
        nameAr: `cancel-section-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Cancel Section ${label}`,
      },
      select: { id: true },
    });
    const classroom = await prisma.classroom.create({
      data: {
        schoolId,
        sectionId: section.id,
        nameAr: `cancel-classroom-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Cancel Classroom ${label}`,
      },
      select: { id: true },
    });

    return { classroomId: classroom.id };
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
        firstName: 'Cancel',
        lastName: `Guardian ${params.marker}`,
        relation: 'parent',
        phone: `${TEST_RUN_ID}-${params.marker}`,
        isPrimary: true,
        canPickup: true,
        canReceiveNotifications: true,
      },
      select: { id: true },
    });
    return guardian.id;
  }

  async function createStudentFixture(params: {
    schoolId: string;
    organizationId: string;
    classroomId: string;
    guardianId: string;
    firstName: string;
    lastName: string;
  }): Promise<{ studentId: string; enrollmentId: string }> {
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
        academicYearId: year.id,
        termId: term.id,
        classroomId: params.classroomId,
        status: StudentEnrollmentStatus.ACTIVE,
        enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
      },
      select: { id: true },
    });

    return { studentId: student.id, enrollmentId: enrollment.id };
  }

  async function createGate(params: {
    schoolId: string;
    code: string;
    name: string;
  }): Promise<string> {
    const gate = await prisma.dismissalGate.create({
      data: {
        schoolId: params.schoolId,
        code: params.code,
        name: params.name,
        status: DismissalGateOperationalStatus.OPEN,
        isActive: true,
      },
      select: { id: true },
    });
    return gate.id;
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
        requestId,
        type: DismissalRequestEventType.REQUEST_STATUS_CHANGED,
      },
    });
  }

  async function countCancelAudits(requestId: string): Promise<number> {
    return prisma.auditLog.count({
      where: {
        resourceId: requestId,
        action: 'dismissal.request.cancelled_by_parent',
      },
    });
  }
});

function assertNoParentRecentLeak(body: unknown): void {
  assertNoForbiddenKeys(body);
  assertNoExactKey(body, 'pickupCode');
  expect(JSON.stringify(body)).not.toContain('pickupCodeHash');
  expect(JSON.stringify(body)).not.toContain('pickupCodeSalt');
}

function assertNoForbiddenKeys(body: unknown): void {
  const forbiddenKeys = new Set([
    'schoolId',
    'organizationId',
    'membershipId',
    'roleId',
    'guardianId',
    'guardianUserId',
    'userId',
    'applicationId',
    'enrollmentId',
    'requestedById',
    'actorUserId',
    'staffUserId',
    'handedOverById',
    'parentLatitude',
    'parentLongitude',
    'distanceMeters',
    'geofencePassed',
    'clientRequestId',
    'deletedAt',
    'assignmentId',
    'metadata',
    'requestId',
  ]);

  visit(body);

  function visit(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      expect(forbiddenKeys.has(key)).toBe(false);
      visit(child);
    }
  }
}

function assertNoExactKey(body: unknown, forbiddenKey: string): void {
  visit(body);

  function visit(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      expect(key).not.toBe(forbiddenKey);
      visit(child);
    }
  }
}
