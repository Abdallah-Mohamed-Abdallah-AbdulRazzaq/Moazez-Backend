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
const PASSWORD = 'DismissalHistoryE2E123!';
const TEST_RUN_ID = randomUUID().slice(0, 8);
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(180_000);

describe('DISMISSAL-HISTORY-1A history, delays, and escalations (e2e)', () => {
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
  let adminAToken: string;
  let adminBToken: string;
  let staffGateToken: string;
  let staffNoAssignmentsToken: string;
  let parentAId: string;
  let parentBId: string;
  let guardianAId: string;
  let guardianBId: string;
  let requestedRequestId: string;
  let queuedRequestId: string;
  let calledRequestId: string;
  let movingRequestId: string;
  let atGateRequestId: string;
  let readyRequestId: string;
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
      code: `HIST-A-${TEST_RUN_ID}`,
      name: 'History Main Gate',
    });
    gateA2Id = await createGate({
      schoolId: schoolAId,
      code: `HIST-B-${TEST_RUN_ID}`,
      name: 'History Side Gate',
    });
    gateBId = await createGate({
      schoolId: schoolBId,
      code: `HIST-X-${TEST_RUN_ID}`,
      name: 'History Cross Gate',
    });

    await prisma.dismissalSettings.create({
      data: {
        schoolId: schoolAId,
        enabled: true,
        delayThresholdMinutes: 1,
        urgentThresholdMinutes: 2,
      },
    });

    const adminA = await createUserWithMembership({
      email: `dismissal-history-${TEST_RUN_ID}-admin-a@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: schoolAdminRole.id,
      userType: UserType.SCHOOL_USER,
      firstName: 'History',
      lastName: 'Admin A',
    });
    const adminB = await createUserWithMembership({
      email: `dismissal-history-${TEST_RUN_ID}-admin-b@moazez.local`,
      schoolId: schoolBId,
      organizationId: organizationBId,
      roleId: schoolAdminRole.id,
      userType: UserType.SCHOOL_USER,
      firstName: 'History',
      lastName: 'Admin B',
    });
    const staffGate = await createUserWithMembership({
      email: `dismissal-history-${TEST_RUN_ID}-staff-gate@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
      firstName: 'Gate',
      lastName: 'History',
    });
    const staffNoAssignments = await createUserWithMembership({
      email: `dismissal-history-${TEST_RUN_ID}-staff-empty@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
      firstName: 'Empty',
      lastName: 'History',
    });
    const parentA = await createUserWithMembership({
      email: `dismissal-history-${TEST_RUN_ID}-parent-a@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: parentRole.id,
      userType: UserType.PARENT,
      firstName: 'Parent',
      lastName: 'History A',
    });
    const parentB = await createUserWithMembership({
      email: `dismissal-history-${TEST_RUN_ID}-parent-b@moazez.local`,
      schoolId: schoolBId,
      organizationId: organizationBId,
      roleId: parentRole.id,
      userType: UserType.PARENT,
      firstName: 'Parent',
      lastName: 'History B',
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

    await prisma.dismissalStaffAssignment.create({
      data: {
        schoolId: schoolAId,
        staffUserId: staffGate.userId,
        gateId: gateAId,
        isActive: true,
      },
    });

    requestedRequestId = await createRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: classroomAId,
      gateId: gateAId,
      status: DismissalRequestStatus.REQUESTED,
      firstName: 'Rana',
      lastName: 'Requested',
      requestedAt: minutesAgo(12),
    });
    queuedRequestId = await createRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: classroomAId,
      gateId: gateA2Id,
      status: DismissalRequestStatus.QUEUED,
      firstName: 'Qasim',
      lastName: 'Queued',
      requestedAt: minutesAgo(6),
    });
    calledRequestId = await createRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: classroomAId,
      gateId: gateAId,
      status: DismissalRequestStatus.CALLED,
      firstName: 'Celine',
      lastName: 'Called',
      requestedAt: minutesAgo(5),
    });
    movingRequestId = await createRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: classroomAId,
      gateId: gateAId,
      status: DismissalRequestStatus.MOVING,
      firstName: 'Mona',
      lastName: 'Moving',
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
      firstName: 'Adel',
      lastName: 'Atgate',
      requestedAt: minutesAgo(3),
    });
    readyRequestId = await createRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: alternateClassroomAId,
      gateId: gateAId,
      status: DismissalRequestStatus.READY,
      firstName: 'Rami',
      lastName: 'Ready',
      requestedAt: minutesAgo(2),
    });
    handedOverRequestId = await createRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: classroomAId,
      gateId: gateAId,
      status: DismissalRequestStatus.HANDED_OVER,
      firstName: 'Hana',
      lastName: 'Handed',
      requestedAt: minutesAgo(10),
      handedOverAt: minutesAgo(5),
    });
    cancelledRequestId = await createRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: classroomAId,
      gateId: gateAId,
      status: DismissalRequestStatus.CANCELLED,
      firstName: 'Kareem',
      lastName: 'Cancelled',
      requestedAt: minutesAgo(9),
    });
    expiredRequestId = await createRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: classroomAId,
      gateId: gateAId,
      status: DismissalRequestStatus.EXPIRED,
      firstName: 'Eman',
      lastName: 'Expired',
      requestedAt: minutesAgo(8),
    });
    deletedRequestId = await createRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: classroomAId,
      gateId: gateAId,
      status: DismissalRequestStatus.REQUESTED,
      firstName: 'Deleted',
      lastName: 'Request',
      requestedAt: minutesAgo(7),
      deletedAt: new Date(),
    });
    crossSchoolRequestId = await createRequest({
      schoolId: schoolBId,
      organizationId: organizationBId,
      guardianId: guardianBId,
      requestedById: parentBId,
      classroomId: classroomBId,
      gateId: gateBId,
      status: DismissalRequestStatus.REQUESTED,
      firstName: 'Cross',
      lastName: 'School',
      requestedAt: minutesAgo(7),
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

    adminAToken = await login(adminA.email);
    adminBToken = await login(adminB.email);
    staffGateToken = await login(staffGate.email);
    staffNoAssignmentsToken = await login(staffNoAssignments.email);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.communicationNotificationPushAttempt.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.communicationNotificationDelivery.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.communicationNotification.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.auditLog.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.dismissalRequestEvent.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.dismissalRequest.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.dismissalStaffAssignment.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.dismissalSettings.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.dismissalGate.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.studentGuardian.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.enrollment.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.student.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.guardian.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.classroom.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.section.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.grade.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.stage.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.term.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.academicYear.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
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
    if (app) await app.close();
  });

  it('lists active and terminal current-school history and hides deleted/cross-school requests', async () => {
    const response = await listHistory(adminAToken).expect(200);
    const ids = response.body.data.map((item: { id: string }) => item.id);

    expect(ids).toEqual(
      expect.arrayContaining([
        requestedRequestId,
        queuedRequestId,
        calledRequestId,
        movingRequestId,
        atGateRequestId,
        readyRequestId,
        handedOverRequestId,
        cancelledRequestId,
        expiredRequestId,
      ]),
    );
    expect(ids).not.toContain(deletedRequestId);
    expect(ids).not.toContain(crossSchoolRequestId);
    expect(response.body.summary).toEqual(
      expect.objectContaining({
        totalCount: 9,
        activeCount: 6,
        terminalCount: 3,
      }),
    );
    assertNoHistoryLeak(response.body);
  });

  it('supports status/statuses, active/terminal, delay/urgent, date, sort, and pagination filters', async () => {
    const statusCases: Array<[string, string]> = [
      ['requested', requestedRequestId],
      ['queued', queuedRequestId],
      ['called', calledRequestId],
      ['moving', movingRequestId],
      ['at_gate', atGateRequestId],
      ['ready', readyRequestId],
      ['handed_over', handedOverRequestId],
      ['cancelled', cancelledRequestId],
      ['expired', expiredRequestId],
    ];

    for (const [status, expectedId] of statusCases) {
      const response = await listHistory(adminAToken, `?status=${status}`).expect(200);
      expect(response.body.data.map((item: { id: string }) => item.id)).toEqual([
        expectedId,
      ]);
    }

    const statuses = await listHistory(
      adminAToken,
      '?statuses=requested,handed_over',
    ).expect(200);
    expect(statuses.body.data.map((item: { id: string }) => item.id)).toEqual(
      expect.arrayContaining([requestedRequestId, handedOverRequestId]),
    );
    expect(statuses.body.data).toHaveLength(2);

    const activeOnly = await listHistory(adminAToken, '?activeOnly=true').expect(200);
    expect(activeOnly.body.summary).toEqual(
      expect.objectContaining({ activeCount: 6, terminalCount: 0 }),
    );

    const terminalOnly = await listHistory(adminAToken, '?terminalOnly=true').expect(200);
    expect(terminalOnly.body.summary).toEqual(
      expect.objectContaining({ activeCount: 0, terminalCount: 3 }),
    );

    const delayedOnly = await listHistory(adminAToken, '?delayedOnly=true').expect(200);
    expect(delayedOnly.body.data.length).toBeGreaterThan(0);
    expect(
      delayedOnly.body.data.every(
        (item: { wait: { delayed: boolean } }) => item.wait.delayed,
      ),
    ).toBe(true);

    const urgentOnly = await listHistory(adminAToken, '?urgentOnly=true').expect(200);
    expect(urgentOnly.body.data.length).toBeGreaterThan(0);
    expect(
      urgentOnly.body.data.every(
        (item: { wait: { urgent: boolean } }) => item.wait.urgent,
      ),
    ).toBe(true);

    const future = encodeURIComponent(new Date(Date.now() + 86_400_000).toISOString());
    const futureOnly = await listHistory(adminAToken, `?dateFrom=${future}`).expect(200);
    expect(futureOnly.body.data).toEqual([]);

    const paged = await listHistory(
      adminAToken,
      '?sort=created_at_asc&page=2&limit=2',
    ).expect(200);
    expect(paged.body.data).toHaveLength(2);
    expect(paged.body.pagination).toEqual({ page: 2, limit: 2, totalPages: 5 });

    const waitSorted = await listHistory(
      adminAToken,
      '?sort=wait_minutes_desc&limit=1',
    ).expect(200);
    expect(waitSorted.body.data[0].wait.minutes).toBeGreaterThanOrEqual(10);
  });

  it('rejects invalid history filters with stable machine codes', async () => {
    const invalidStatus = await listHistory(adminAToken, '?status=delayed').expect(422);
    expect(invalidStatus.body?.error?.code).toBe(
      'dismissal.history.invalid_status_filter',
    );

    const invalidCombination = await listHistory(
      adminAToken,
      '?activeOnly=true&terminalOnly=true',
    ).expect(422);
    expect(invalidCombination.body?.error?.code).toBe(
      'dismissal.history.invalid_filter_combination',
    );

    const dateFrom = encodeURIComponent(new Date().toISOString());
    const dateTo = encodeURIComponent(new Date(Date.now() - 86_400_000).toISOString());
    const invalidDate = await listHistory(
      adminAToken,
      `?dateFrom=${dateFrom}&dateTo=${dateTo}`,
    ).expect(422);
    expect(invalidDate.body?.error?.code).toBe(
      'dismissal.history.invalid_date_range',
    );
  });

  it('returns safe history detail and assignment-scoped staff history', async () => {
    const detail = await getHistoryDetail(adminAToken, handedOverRequestId).expect(200);
    expect(detail.body.request).toEqual(
      expect.objectContaining({
        id: handedOverRequestId,
        status: 'handed_over',
        isTerminal: true,
        handedOverAt: expect.any(String),
      }),
    );
    expect(detail.body.request.timeline.map((event: { type: string }) => event.type)).toEqual(
      expect.arrayContaining(['request_created', 'request_status_changed']),
    );
    assertNoHistoryLeak(detail.body);

    const staffList = await listHistory(staffGateToken).expect(200);
    const staffIds = staffList.body.data.map((item: { id: string }) => item.id);
    expect(staffIds).toContain(requestedRequestId);
    expect(staffIds).not.toContain(queuedRequestId);

    await getHistoryDetail(staffGateToken, requestedRequestId).expect(200);
    await getHistoryDetail(staffGateToken, queuedRequestId).expect(404);

    const emptyStaffList = await listHistory(staffNoAssignmentsToken).expect(200);
    expect(emptyStaffList.body.data).toEqual([]);
    await getHistoryDetail(staffNoAssignmentsToken, requestedRequestId).expect(404);
  });

  it('creates an idempotent escalation event and safe audit without changing request status', async () => {
    const notificationCountBefore = await prisma.communicationNotification.count({
      where: { schoolId: schoolAId },
    });

    const response = await escalate(adminAToken, requestedRequestId, {
      reason: 'parent_waiting',
      note: 'Parent has waited too long.',
    }).expect(201);

    expect(response.body.escalation).toEqual(
      expect.objectContaining({
        requestId: requestedRequestId,
        changed: true,
        escalated: true,
        reason: 'parent_waiting',
        escalatedAt: expect.any(String),
      }),
    );
    expect(response.body.request).toEqual(
      expect.objectContaining({
        id: requestedRequestId,
        status: 'requested',
        isActive: true,
        isTerminal: false,
      }),
    );
    assertNoHistoryLeak(response.body);

    const requestRecord = await prisma.dismissalRequest.findUniqueOrThrow({
      where: { id: requestedRequestId },
      select: { status: true },
    });
    expect(requestRecord.status).toBe(DismissalRequestStatus.REQUESTED);

    const events = await prisma.dismissalRequestEvent.findMany({
      where: {
        requestId: requestedRequestId,
        type: DismissalRequestEventType.REQUEST_ESCALATED,
      },
      select: { metadata: true, note: true },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(
      expect.objectContaining({
        note: 'Parent has waited too long.',
        metadata: expect.objectContaining({
          escalation: true,
          reason: 'parent_waiting',
        }),
      }),
    );

    const audit = await prisma.auditLog.findFirst({
      where: {
        schoolId: schoolAId,
        action: 'dismissal.request.escalated',
        resourceId: requestedRequestId,
        outcome: AuditOutcome.SUCCESS,
      },
      select: { after: true },
    });
    expect(audit?.after).toEqual(
      expect.objectContaining({
        status: DismissalRequestStatus.REQUESTED,
        reason: 'parent_waiting',
        notePresent: true,
      }),
    );

    const notificationCountAfter = await prisma.communicationNotification.count({
      where: { schoolId: schoolAId },
    });
    expect(notificationCountAfter).toBe(notificationCountBefore);

    const detail = await getHistoryDetail(adminAToken, requestedRequestId).expect(200);
    expect(detail.body.request.escalation).toEqual(
      expect.objectContaining({
        escalated: true,
        reason: 'parent_waiting',
        note: 'Parent has waited too long.',
      }),
    );
    expect(detail.body.request.timeline.map((event: { type: string }) => event.type)).toContain(
      'request_escalated',
    );

    const escalatedOnly = await listHistory(adminAToken, '?escalatedOnly=true').expect(200);
    expect(escalatedOnly.body.data.map((item: { id: string }) => item.id)).toEqual([
      requestedRequestId,
    ]);

    const retry = await escalate(adminAToken, requestedRequestId, {
      reason: 'manual_follow_up',
    }).expect(201);
    expect(retry.body.escalation.changed).toBe(false);
    expect(
      await prisma.dismissalRequestEvent.count({
        where: {
          requestId: requestedRequestId,
          type: DismissalRequestEventType.REQUEST_ESCALATED,
        },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: {
          schoolId: schoolAId,
          action: 'dismissal.request.escalated',
          resourceId: requestedRequestId,
        },
      }),
    ).toBe(1);
  });

  it('rejects invalid, terminal, cross-school, deleted, and assignment-hidden escalation safely', async () => {
    const invalid = await escalate(adminAToken, calledRequestId, {
      reason: 'waiting_time_exceeded',
    }).expect(422);
    expect(invalid.body?.error?.code).toBe('dismissal.escalation.invalid_reason');

    const terminal = await escalate(adminAToken, handedOverRequestId, {
      reason: 'other',
    }).expect(409);
    expect(terminal.body?.error?.code).toBe(
      'dismissal.escalation.terminal_request',
    );

    await escalate(adminAToken, crossSchoolRequestId, { reason: 'other' }).expect(404);
    await escalate(adminAToken, deletedRequestId, { reason: 'other' }).expect(404);
    await escalate(staffGateToken, queuedRequestId, { reason: 'other' }).expect(404);
    await escalate(staffNoAssignmentsToken, requestedRequestId, {
      reason: 'other',
    }).expect(404);
    await getHistoryDetail(adminBToken, requestedRequestId).expect(404);
  });

  function listHistory(token: string, query = '') {
    return request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/history${query}`)
      .set('Authorization', `Bearer ${token}`);
  }

  function getHistoryDetail(token: string, requestId: string) {
    return request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/history/${requestId}`)
      .set('Authorization', `Bearer ${token}`);
  }

  function escalate(token: string, requestId: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/requests/${requestId}/escalate`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  async function createSchoolFixture(label: string): Promise<{
    organizationId: string;
    schoolId: string;
  }> {
    const organization = await prisma.organization.create({
      data: {
        slug: `dismissal-history-${TEST_RUN_ID}-org-${label}`,
        name: `Dismissal History Org ${label}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);

    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `dismissal-history-${TEST_RUN_ID}-school-${label}`,
        name: `Dismissal History School ${label}`,
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
        nameAr: `history-year-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `History Year ${label}`,
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
        nameAr: `history-term-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `History Term ${label}`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-01-15T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    const stage = await prisma.stage.create({
      data: {
        schoolId,
        nameAr: `history-stage-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `History Stage ${label}`,
      },
      select: { id: true },
    });
    const grade = await prisma.grade.create({
      data: {
        schoolId,
        stageId: stage.id,
        nameAr: `history-grade-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `History Grade ${label}`,
      },
      select: { id: true },
    });
    const section = await prisma.section.create({
      data: {
        schoolId,
        gradeId: grade.id,
        nameAr: `history-section-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `History Section ${label}`,
      },
      select: { id: true },
    });
    const alternateSection = await prisma.section.create({
      data: {
        schoolId,
        gradeId: grade.id,
        nameAr: `history-section-alt-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `History Section Alt ${label}`,
      },
      select: { id: true },
    });
    const classroom = await prisma.classroom.create({
      data: {
        schoolId,
        sectionId: section.id,
        nameAr: `history-classroom-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `History Classroom ${label}`,
      },
      select: { id: true },
    });
    const alternateClassroom = await prisma.classroom.create({
      data: {
        schoolId,
        sectionId: alternateSection.id,
        nameAr: `history-classroom-alt-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `History Classroom Alt ${label}`,
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
        firstName: 'History',
        lastName: `Guardian ${params.marker}`,
        relation: 'guardian',
        phone: `0109000${params.marker === 'a' ? '1' : '2'}`,
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
    handedOverAt?: Date | null;
    deletedAt?: Date | null;
  }): Promise<string> {
    const enrollmentContext = await prisma.classroom.findFirstOrThrow({
      where: { id: params.classroomId, schoolId: params.schoolId },
      select: { id: true },
    });
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
        classroomId: enrollmentContext.id,
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
        clientRequestId: `history-${TEST_RUN_ID}-${student.id}`,
        parentLatitude: 30.04442,
        parentLongitude: 31.235712,
        distanceMeters: 20,
        geofencePassed: true,
        requestedAt: params.requestedAt,
        createdAt: params.requestedAt,
        handedOverAt: params.handedOverAt ?? null,
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
        createdAt: params.requestedAt,
        metadata: { hidden: true },
      },
    });
    if (params.status !== DismissalRequestStatus.REQUESTED) {
      await prisma.dismissalRequestEvent.create({
        data: {
          schoolId: params.schoolId,
          requestId: dismissalRequest.id,
          type: DismissalRequestEventType.REQUEST_STATUS_CHANGED,
          actorUserId: params.requestedById,
          statusFrom: DismissalRequestStatus.REQUESTED,
          statusTo: params.status,
          createdAt: params.handedOverAt ?? minutesAgo(1),
          note: `${params.status.toLowerCase()} note`,
          metadata: { hidden: true },
        },
      });
    }

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

function assertNoHistoryLeak(payload: unknown): void {
  const forbiddenKeys = new Set([
    'schoolId',
    'organizationId',
    'membershipId',
    'roleId',
    'guardianId',
    'userId',
    'studentGuardianId',
    'applicationId',
    'enrollmentId',
    'requestedById',
    'actorUserId',
    'staffUserId',
    'handedOverById',
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
    'metadata',
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
