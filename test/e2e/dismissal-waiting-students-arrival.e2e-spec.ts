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
const PASSWORD = 'DismissalWaitingE2E123!';
const TEST_RUN_ID = randomUUID().slice(0, 8);
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(120_000);

describe('DISMISSAL-WAITING-1A waiting students and arrival (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let organizationAId: string;
  let organizationBId: string;
  let schoolAId: string;
  let schoolBId: string;
  let classroomAId: string;
  let alternateClassroomAId: string;
  let classroomBId: string;
  let gateAId: string;
  let gateA2Id: string;
  let gateBId: string;
  let parentAId: string;
  let parentBId: string;
  let guardianAId: string;
  let guardianBId: string;
  let adminToken: string;
  let staffGateToken: string;
  let staffClassroomToken: string;
  let staffNoAssignmentsToken: string;
  let staffNonMatchingToken: string;
  let staffExpiredToken: string;
  let parentToken: string;
  let calledRequestId: string;
  let movingRequestId: string;
  let atGateRequestId: string;
  let readyRequestId: string;
  let requestedRequestId: string;
  let queuedRequestId: string;
  let handedOverRequestId: string;
  let cancelledRequestId: string;
  let expiredRequestId: string;
  let deletedRequestId: string;
  let crossSchoolRequestId: string;
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

    const fixtureA = await createSchoolFixture('a');
    const fixtureB = await createSchoolFixture('b');
    organizationAId = fixtureA.organizationId;
    organizationBId = fixtureB.organizationId;
    schoolAId = fixtureA.schoolId;
    schoolBId = fixtureB.schoolId;

    const academicA = await createAcademicFixture('a', schoolAId);
    const academicB = await createAcademicFixture('b', schoolBId);
    classroomAId = academicA.classroomId;
    alternateClassroomAId = academicA.alternateClassroomId;
    classroomBId = academicB.classroomId;

    gateAId = await createGate({
      schoolId: schoolAId,
      code: `WAIT-A-${TEST_RUN_ID}`,
      name: 'Waiting Main Gate',
      status: DismissalGateOperationalStatus.OPEN,
    });
    gateA2Id = await createGate({
      schoolId: schoolAId,
      code: `WAIT-B-${TEST_RUN_ID}`,
      name: 'Waiting Side Gate',
      status: DismissalGateOperationalStatus.BUSY,
    });
    gateBId = await createGate({
      schoolId: schoolBId,
      code: `WAIT-X-${TEST_RUN_ID}`,
      name: 'Waiting Cross Gate',
      status: DismissalGateOperationalStatus.OPEN,
    });

    await prisma.dismissalSettings.create({
      data: {
        schoolId: schoolAId,
        enabled: true,
        delayThresholdMinutes: 1,
        urgentThresholdMinutes: 2,
      },
    });

    const admin = await createUserWithMembership({
      email: `dismissal-wait-${TEST_RUN_ID}-admin@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: schoolAdminRole.id,
      userType: UserType.SCHOOL_USER,
      firstName: 'Waiting',
      lastName: 'Admin',
    });
    const staffGate = await createUserWithMembership({
      email: `dismissal-wait-${TEST_RUN_ID}-staff-gate@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
      firstName: 'Gate',
      lastName: 'Waiting',
    });
    const staffClassroom = await createUserWithMembership({
      email: `dismissal-wait-${TEST_RUN_ID}-staff-class@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
      firstName: 'Classroom',
      lastName: 'Waiting',
    });
    const staffNoAssignments = await createUserWithMembership({
      email: `dismissal-wait-${TEST_RUN_ID}-staff-empty@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
      firstName: 'Empty',
      lastName: 'Waiting',
    });
    const staffNonMatching = await createUserWithMembership({
      email: `dismissal-wait-${TEST_RUN_ID}-staff-other@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
      firstName: 'Other',
      lastName: 'Waiting',
    });
    const staffExpired = await createUserWithMembership({
      email: `dismissal-wait-${TEST_RUN_ID}-staff-expired@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
      firstName: 'Expired',
      lastName: 'Waiting',
    });
    const parentA = await createUserWithMembership({
      email: `dismissal-wait-${TEST_RUN_ID}-parent-a@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: parentRole.id,
      userType: UserType.PARENT,
      firstName: 'Parent',
      lastName: 'Waiting A',
    });
    const parentB = await createUserWithMembership({
      email: `dismissal-wait-${TEST_RUN_ID}-parent-b@moazez.local`,
      schoolId: schoolBId,
      organizationId: organizationBId,
      roleId: parentRole.id,
      userType: UserType.PARENT,
      firstName: 'Parent',
      lastName: 'Waiting B',
    });
    parentAId = parentA.userId;
    parentBId = parentB.userId;

    guardianAId = await createGuardian({
      schoolId: schoolAId,
      organizationId: organizationAId,
      userId: parentAId,
      marker: 'a',
    });
    guardianBId = await createGuardian({
      schoolId: schoolBId,
      organizationId: organizationBId,
      userId: parentBId,
      marker: 'b',
    });

    await prisma.dismissalStaffAssignment.createMany({
      data: [
        {
          schoolId: schoolAId,
          staffUserId: staffGate.userId,
          gateId: gateAId,
          isActive: true,
        },
        {
          schoolId: schoolAId,
          staffUserId: staffClassroom.userId,
          classroomId: classroomAId,
          isActive: true,
        },
        {
          schoolId: schoolAId,
          staffUserId: staffNonMatching.userId,
          gateId: gateAId,
          classroomId: alternateClassroomAId,
          isActive: true,
        },
        {
          schoolId: schoolAId,
          staffUserId: staffExpired.userId,
          gateId: gateAId,
          isActive: true,
          startsAt: new Date(Date.now() - 120 * 60_000),
          endsAt: new Date(Date.now() - 60 * 60_000),
        },
      ],
    });

    calledRequestId = await createRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: classroomAId,
      gateId: gateAId,
      status: DismissalRequestStatus.CALLED,
      firstName: 'Called',
      lastName: 'Waiting',
      requestedAt: minutesAgo(5),
    });
    movingRequestId = await createRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: classroomAId,
      gateId: gateA2Id,
      status: DismissalRequestStatus.MOVING,
      firstName: 'Moving',
      lastName: 'Waiting',
      requestedAt: minutesAgo(4),
    });
    atGateRequestId = await createRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: classroomAId,
      gateId: gateAId,
      status: DismissalRequestStatus.AT_GATE,
      firstName: 'Arrived',
      lastName: 'Waiting',
      requestedAt: minutesAgo(3),
    });
    readyRequestId = await createRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: alternateClassroomAId,
      gateId: gateA2Id,
      status: DismissalRequestStatus.READY,
      firstName: 'Ready',
      lastName: 'Waiting',
      requestedAt: minutesAgo(2),
    });
    requestedRequestId = await createRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: classroomAId,
      gateId: gateAId,
      status: DismissalRequestStatus.REQUESTED,
      firstName: 'Requested',
      lastName: 'Hidden',
      requestedAt: minutesAgo(7),
    });
    queuedRequestId = await createRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: classroomAId,
      gateId: gateAId,
      status: DismissalRequestStatus.QUEUED,
      firstName: 'Queued',
      lastName: 'Hidden',
      requestedAt: minutesAgo(7),
    });
    handedOverRequestId = await createRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: classroomAId,
      gateId: gateAId,
      status: DismissalRequestStatus.HANDED_OVER,
      firstName: 'Handed',
      lastName: 'Terminal',
      requestedAt: minutesAgo(8),
    });
    cancelledRequestId = await createRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: classroomAId,
      gateId: gateAId,
      status: DismissalRequestStatus.CANCELLED,
      firstName: 'Cancelled',
      lastName: 'Terminal',
      requestedAt: minutesAgo(8),
    });
    expiredRequestId = await createRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: classroomAId,
      gateId: gateAId,
      status: DismissalRequestStatus.EXPIRED,
      firstName: 'Expired',
      lastName: 'Terminal',
      requestedAt: minutesAgo(8),
    });
    deletedRequestId = await createRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: classroomAId,
      gateId: gateAId,
      status: DismissalRequestStatus.CALLED,
      firstName: 'Deleted',
      lastName: 'Hidden',
      requestedAt: minutesAgo(8),
      deletedAt: new Date(),
    });
    crossSchoolRequestId = await createRequest({
      schoolId: schoolBId,
      organizationId: organizationBId,
      guardianId: guardianBId,
      requestedById: parentBId,
      classroomId: classroomBId,
      gateId: gateBId,
      status: DismissalRequestStatus.CALLED,
      firstName: 'Cross',
      lastName: 'Hidden',
      requestedAt: minutesAgo(6),
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
    staffGateToken = await login(staffGate.email);
    staffClassroomToken = await login(staffClassroom.email);
    staffNoAssignmentsToken = await login(staffNoAssignments.email);
    staffNonMatchingToken = await login(staffNonMatching.email);
    staffExpiredToken = await login(staffExpired.email);
    parentToken = await login(parentA.email);
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
    if (app) {
      await app.close();
    }
  });

  it('lets school admin list only current-school waiting students', async () => {
    const response = await listWaiting(adminToken).expect(200);
    const ids = response.body.data.map((item: { id: string }) => item.id);

    expect(ids).toEqual([
      calledRequestId,
      movingRequestId,
      atGateRequestId,
      readyRequestId,
    ]);
    expect(ids).not.toEqual(
      expect.arrayContaining([
        requestedRequestId,
        queuedRequestId,
        handedOverRequestId,
        cancelledRequestId,
        expiredRequestId,
        deletedRequestId,
        crossSchoolRequestId,
      ]),
    );
    expect(response.body.summary).toEqual(
      expect.objectContaining({
        totalCount: 4,
        calledCount: 1,
        movingCount: 1,
        atGateCount: 1,
        readyCount: 1,
        arrivedCount: 2,
        notArrivedCount: 2,
      }),
    );
    expect(response.body.data.map((item: { arrivalState: string }) => item.arrivalState))
      .toEqual(['called', 'in_transit', 'arrived', 'ready']);
    assertNoWaitingLeak(response.body);
  });

  it('supports status, gate, q, pagination, and computed signal fields', async () => {
    const status = await listWaiting(adminToken, '?status=called').expect(200);
    expect(status.body.data.map((item: { id: string }) => item.id)).toEqual([
      calledRequestId,
    ]);

    const gate = await listWaiting(adminToken, `?gateId=${gateA2Id}`).expect(200);
    expect(gate.body.data.map((item: { id: string }) => item.id)).toEqual([
      movingRequestId,
      readyRequestId,
    ]);

    const search = await listWaiting(adminToken, '?q=Called').expect(200);
    expect(search.body.data).toHaveLength(1);
    expect(search.body.data[0].id).toBe(calledRequestId);

    const paged = await listWaiting(
      adminToken,
      '?sort=requested_at_asc&page=2&limit=1',
    ).expect(200);
    expect(paged.body.data).toHaveLength(1);
    expect(paged.body.pagination).toEqual({
      page: 2,
      limit: 1,
      totalPages: 4,
    });

    expect(status.body.data[0].waitMinutes).toBeGreaterThanOrEqual(2);
    expect(status.body.data[0].signals).toEqual(
      expect.objectContaining({
        delayed: true,
        urgent: true,
        delayThresholdMinutes: 1,
        urgentThresholdMinutes: 2,
      }),
    );
    expect(status.body.summary.delayedCount).toBeGreaterThanOrEqual(1);
    expect(status.body.summary.urgentCount).toBeGreaterThanOrEqual(1);

    const invalid = await listWaiting(adminToken, '?status=requested').expect(422);
    expect(invalid.body?.error?.code).toBe('dismissal.waiting.invalid_filter');
  });

  it('enforces dismissal staff waiting list visibility by assignment', async () => {
    const gateList = await listWaiting(staffGateToken).expect(200);
    expect(gateList.body.data.map((item: { id: string }) => item.id)).toEqual([
      calledRequestId,
      atGateRequestId,
    ]);

    const classroomList = await listWaiting(staffClassroomToken).expect(200);
    expect(classroomList.body.data.map((item: { id: string }) => item.id)).toEqual([
      calledRequestId,
      movingRequestId,
      atGateRequestId,
    ]);

    for (const token of [
      staffNoAssignmentsToken,
      staffNonMatchingToken,
      staffExpiredToken,
    ]) {
      const response = await listWaiting(token).expect(200);
      expect(response.body.data).toEqual([]);
      expect(response.body.summary.totalCount).toBe(0);
    }
  });

  it('confirms CALLED and MOVING arrival with event, audit, queue, and detail updates', async () => {
    const calledId = await createRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: classroomAId,
      gateId: gateAId,
      status: DismissalRequestStatus.CALLED,
      firstName: 'Arrive',
      lastName: 'Called',
      requestedAt: minutesAgo(6),
    });
    const movingId = await createRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: classroomAId,
      gateId: gateAId,
      status: DismissalRequestStatus.MOVING,
      firstName: 'Arrive',
      lastName: 'Moving',
      requestedAt: minutesAgo(6),
    });

    const called = await confirmArrival(adminToken, calledId, {
      note: '  Student reached waiting zone  ',
    }).expect(201);
    expect(called.body.student).toEqual(
      expect.objectContaining({
        id: calledId,
        status: 'at_gate',
        arrivalState: 'arrived',
        previousStatus: 'called',
        changed: true,
      }),
    );
    expect(called.body.student.timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'request_status_changed',
          statusFrom: 'called',
          statusTo: 'at_gate',
          note: 'Student reached waiting zone',
        }),
      ]),
    );
    assertNoWaitingLeak(called.body);

    const moving = await confirmArrival(adminToken, movingId, {
      note: 'Arrived from classroom',
    }).expect(201);
    expect(moving.body.student).toEqual(
      expect.objectContaining({
        id: movingId,
        status: 'at_gate',
        previousStatus: 'moving',
        changed: true,
      }),
    );

    await expect(countStatusChangeEvents(calledId)).resolves.toBe(1);
    const event = await prisma.dismissalRequestEvent.findFirstOrThrow({
      where: {
        schoolId: schoolAId,
        requestId: calledId,
        type: DismissalRequestEventType.REQUEST_STATUS_CHANGED,
      },
      select: { statusFrom: true, statusTo: true, note: true, metadata: true },
    });
    expect(event).toEqual(
      expect.objectContaining({
        statusFrom: DismissalRequestStatus.CALLED,
        statusTo: DismissalRequestStatus.AT_GATE,
        note: 'Student reached waiting zone',
        metadata: null,
      }),
    );

    const audit = await prisma.auditLog.findFirst({
      where: {
        schoolId: schoolAId,
        module: 'dismissal',
        action: 'dismissal.waiting_student.arrival_confirmed',
        resourceType: 'dismissal_request',
        resourceId: calledId,
        outcome: AuditOutcome.SUCCESS,
      },
      select: { before: true, after: true },
    });
    expect(audit).toEqual(
      expect.objectContaining({
        before: expect.objectContaining({ status: 'CALLED' }),
        after: expect.objectContaining({ status: 'AT_GATE', note: true }),
      }),
    );

    const detail = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/${calledId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(detail.body.request.status).toBe('at_gate');
    expect(detail.body.request.timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'request_status_changed',
          statusFrom: 'called',
          statusTo: 'at_gate',
        }),
      ]),
    );
    assertNoWaitingLeak(detail.body);

    const activeQueue = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/active?status=at_gate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(activeQueue.body.data.map((item: { id: string }) => item.id)).toContain(
      calledId,
    );
    expect(activeQueue.body.summary.atGateCount).toBeGreaterThanOrEqual(1);
  });

  it('treats AT_GATE and READY arrival confirmation as idempotent no-ops', async () => {
    for (const status of [
      DismissalRequestStatus.AT_GATE,
      DismissalRequestStatus.READY,
    ]) {
      const requestId = await createRequest({
        schoolId: schoolAId,
        organizationId: organizationAId,
        guardianId: guardianAId,
        requestedById: parentAId,
        classroomId: classroomAId,
        gateId: gateAId,
        status,
        firstName: `Noop${status}`,
        lastName: 'Waiting',
        requestedAt: minutesAgo(1),
      });
      const eventsBefore = await countStatusChangeEvents(requestId);
      const auditsBefore = await countArrivalAudits(requestId);

      const response = await confirmArrival(adminToken, requestId, {
        note: 'No duplicate expected',
      }).expect(201);
      expect(response.body.student).toEqual(
        expect.objectContaining({
          id: requestId,
          previousStatus: null,
          changed: false,
        }),
      );
      await expect(countStatusChangeEvents(requestId)).resolves.toBe(eventsBefore);
      await expect(countArrivalAudits(requestId)).resolves.toBe(auditsBefore);
    }
  });

  it('rejects invalid arrival states and safe-404s hidden requests without writes', async () => {
    for (const requestId of [requestedRequestId, queuedRequestId]) {
      const statusBefore = await getRequestStatus(requestId);
      const eventsBefore = await countStatusChangeEvents(requestId);
      const response = await confirmArrival(adminToken, requestId, {}).expect(409);
      expect(response.body?.error?.code).toBe(
        'dismissal.waiting.invalid_arrival_status',
      );
      await expect(getRequestStatus(requestId)).resolves.toBe(statusBefore);
      await expect(countStatusChangeEvents(requestId)).resolves.toBe(eventsBefore);
    }

    for (const requestId of [
      handedOverRequestId,
      cancelledRequestId,
      expiredRequestId,
      deletedRequestId,
      crossSchoolRequestId,
    ]) {
      const response = await confirmArrival(adminToken, requestId, {}).expect(404);
      expect(response.body?.error?.code).toBe('dismissal.waiting.not_found');
    }
  });

  it('assignment-scopes arrival confirmation for DISMISSAL_STAFF and forbids parents', async () => {
    const visibleId = await createRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: classroomAId,
      gateId: gateAId,
      status: DismissalRequestStatus.MOVING,
      firstName: 'Staff',
      lastName: 'Visible',
      requestedAt: minutesAgo(2),
    });
    const hiddenId = await createRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: alternateClassroomAId,
      gateId: gateA2Id,
      status: DismissalRequestStatus.MOVING,
      firstName: 'Staff',
      lastName: 'Hidden',
      requestedAt: minutesAgo(2),
    });

    await confirmArrival(staffGateToken, visibleId, {}).expect(201);
    const hidden = await confirmArrival(staffGateToken, hiddenId, {}).expect(404);
    expect(hidden.body?.error?.code).toBe('dismissal.waiting.not_found');
    await expect(getRequestStatus(hiddenId)).resolves.toBe(
      DismissalRequestStatus.MOVING,
    );

    await listWaiting(parentToken).expect(403);
    await confirmArrival(parentToken, visibleId, {}).expect(403);
  });

  function listWaiting(token: string, query = '') {
    return request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/waiting-students${query}`)
      .set('Authorization', `Bearer ${token}`);
  }

  function confirmArrival(
    token: string,
    requestId: string,
    body: Record<string, unknown>,
  ) {
    return request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/waiting-students/${requestId}/arrival`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  async function countStatusChangeEvents(requestId: string): Promise<number> {
    return prisma.dismissalRequestEvent.count({
      where: {
        schoolId: schoolAId,
        requestId,
        type: DismissalRequestEventType.REQUEST_STATUS_CHANGED,
      },
    });
  }

  async function countArrivalAudits(requestId: string): Promise<number> {
    return prisma.auditLog.count({
      where: {
        schoolId: schoolAId,
        action: 'dismissal.waiting_student.arrival_confirmed',
        resourceId: requestId,
      },
    });
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

  async function createSchoolFixture(label: string): Promise<{
    organizationId: string;
    schoolId: string;
  }> {
    const organization = await prisma.organization.create({
      data: {
        slug: `dismissal-wait-${TEST_RUN_ID}-org-${label}`,
        name: `Dismissal Waiting Org ${label}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);

    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `dismissal-wait-${TEST_RUN_ID}-school-${label}`,
        name: `Dismissal Waiting School ${label}`,
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
        nameAr: `wait-year-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Waiting Year ${label}`,
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
        nameAr: `wait-term-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Waiting Term ${label}`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-01-15T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    const stage = await prisma.stage.create({
      data: {
        schoolId,
        nameAr: `wait-stage-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Waiting Stage ${label}`,
      },
      select: { id: true },
    });
    const grade = await prisma.grade.create({
      data: {
        schoolId,
        stageId: stage.id,
        nameAr: `wait-grade-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Waiting Grade ${label}`,
      },
      select: { id: true },
    });
    const section = await prisma.section.create({
      data: {
        schoolId,
        gradeId: grade.id,
        nameAr: `wait-section-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Waiting Section ${label}`,
      },
      select: { id: true },
    });
    const alternateSection = await prisma.section.create({
      data: {
        schoolId,
        gradeId: grade.id,
        nameAr: `wait-section-alt-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Waiting Section Alt ${label}`,
      },
      select: { id: true },
    });
    const classroom = await prisma.classroom.create({
      data: {
        schoolId,
        sectionId: section.id,
        nameAr: `wait-classroom-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Waiting Classroom ${label}`,
      },
      select: { id: true },
    });
    const alternateClassroom = await prisma.classroom.create({
      data: {
        schoolId,
        sectionId: alternateSection.id,
        nameAr: `wait-classroom-alt-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Waiting Classroom Alt ${label}`,
      },
      select: { id: true },
    });

    return {
      academicYearId: academicYear.id,
      termId: term.id,
      classroomId: classroom.id,
      alternateClassroomId: alternateClassroom.id,
    };
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
        firstName: 'Waiting',
        lastName: `Guardian ${params.marker}`,
        relation: 'guardian',
        phone: `0101000${params.marker === 'a' ? '1' : '2'}`,
        canPickup: true,
        canReceiveNotifications: true,
      },
      select: { id: true },
    });
    return guardian.id;
  }

  async function createRequest(params: {
    schoolId: string;
    organizationId: string;
    guardianId: string;
    requestedById: string;
    classroomId: string;
    gateId: string;
    status: DismissalRequestStatus;
    firstName: string;
    lastName: string;
    requestedAt: Date;
    deletedAt?: Date | null;
  }): Promise<string> {
    const year = await prisma.academicYear.findFirstOrThrow({
      where: { schoolId: params.schoolId },
      select: { id: true },
    });
    const term = await prisma.term.findFirst({
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
        termId: term?.id,
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
        status: params.status,
        clientRequestId: `waiting-${TEST_RUN_ID}-${student.id}`,
        parentLatitude: 30.04442,
        parentLongitude: 31.235712,
        distanceMeters: 15,
        geofencePassed: true,
        requestedAt: params.requestedAt,
        deletedAt: params.deletedAt ?? null,
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
        metadata: { hidden: true },
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
});

function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60_000);
}

function assertNoWaitingLeak(payload: unknown): void {
  const forbiddenKeys = new Set([
    'schoolId',
    'organizationId',
    'membershipId',
    'roleId',
    'guardianId',
    'userId',
    'applicationId',
    'enrollmentId',
    'requestedById',
    'actorUserId',
    'staffUserId',
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

  visit(payload);

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
