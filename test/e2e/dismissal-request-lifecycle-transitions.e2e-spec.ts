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
const PASSWORD = 'DismissalTransitionsE2E123!';
const TEST_RUN_ID = randomUUID().slice(0, 8);
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(120_000);

describe('DISMISSAL-CALLS-1B request lifecycle transitions (e2e)', () => {
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
  let gateBId: string;
  let parentAId: string;
  let parentBId: string;
  let guardianAId: string;
  let guardianBId: string;
  let adminToken: string;
  let staffGateToken: string;
  let staffClassroomToken: string;
  let staffNonMatchingToken: string;
  let staffExpiredToken: string;
  let parentToken: string;
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
      code: `TRANS-A-${TEST_RUN_ID}`,
      name: 'Transitions Main Gate',
    });
    gateBId = await createGate({
      schoolId: schoolBId,
      code: `TRANS-B-${TEST_RUN_ID}`,
      name: 'Transitions Cross Gate',
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
      email: `dismissal-trans-${TEST_RUN_ID}-admin@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: schoolAdminRole.id,
      userType: UserType.SCHOOL_USER,
      firstName: 'Transition',
      lastName: 'Admin',
    });
    const staffGate = await createUserWithMembership({
      email: `dismissal-trans-${TEST_RUN_ID}-staff-gate@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
      firstName: 'Gate',
      lastName: 'Transition',
    });
    const staffClassroom = await createUserWithMembership({
      email: `dismissal-trans-${TEST_RUN_ID}-staff-class@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
      firstName: 'Classroom',
      lastName: 'Transition',
    });
    const staffNonMatching = await createUserWithMembership({
      email: `dismissal-trans-${TEST_RUN_ID}-staff-other@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
      firstName: 'Other',
      lastName: 'Transition',
    });
    const staffExpired = await createUserWithMembership({
      email: `dismissal-trans-${TEST_RUN_ID}-staff-expired@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
      firstName: 'Expired',
      lastName: 'Transition',
    });
    const parentA = await createUserWithMembership({
      email: `dismissal-trans-${TEST_RUN_ID}-parent-a@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: parentRole.id,
      userType: UserType.PARENT,
      firstName: 'Parent',
      lastName: 'Transition A',
    });
    const parentB = await createUserWithMembership({
      email: `dismissal-trans-${TEST_RUN_ID}-parent-b@moazez.local`,
      schoolId: schoolBId,
      organizationId: organizationBId,
      roleId: parentRole.id,
      userType: UserType.PARENT,
      firstName: 'Parent',
      lastName: 'Transition B',
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
    staffNonMatchingToken = await login(staffNonMatching.email);
    staffExpiredToken = await login(staffExpired.email);
    parentToken = await login(parentA.email);
  });

  afterAll(async () => {
    if (prisma) {
      const schoolIds = [schoolAId, schoolBId].filter(Boolean);
      await prisma.auditLog.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
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
      await prisma.enrollment.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.student.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.guardian.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.classroom.deleteMany({ where: { schoolId: { in: schoolIds } } });
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
    if (app) await app.close();
  });

  it('lets school admin apply the allowed active transition matrix', async () => {
    const transitions: Array<{
      from: DismissalRequestStatus;
      to: string;
      expected: string;
    }> = [
      { from: DismissalRequestStatus.REQUESTED, to: 'queued', expected: 'queued' },
      { from: DismissalRequestStatus.REQUESTED, to: 'called', expected: 'called' },
      { from: DismissalRequestStatus.QUEUED, to: 'called', expected: 'called' },
      { from: DismissalRequestStatus.CALLED, to: 'moving', expected: 'moving' },
      { from: DismissalRequestStatus.CALLED, to: 'at_gate', expected: 'at_gate' },
      { from: DismissalRequestStatus.MOVING, to: 'at_gate', expected: 'at_gate' },
      { from: DismissalRequestStatus.AT_GATE, to: 'ready', expected: 'ready' },
    ];

    for (const [index, transition] of transitions.entries()) {
      const requestId = await createRequest({
        schoolId: schoolAId,
        organizationId: organizationAId,
        guardianId: guardianAId,
        requestedById: parentAId,
        classroomId: classroomAId,
        gateId: gateAId,
        status: transition.from,
        firstName: `Matrix${index}`,
        lastName: 'Student',
      });

      const response = await patchStatus(adminToken, requestId, {
        status: transition.to,
        note: '  Student called safely  ',
      }).expect(200);

      expect(response.body.request).toEqual(
        expect.objectContaining({
          id: requestId,
          status: transition.expected,
          previousStatus: transition.from.toLowerCase(),
          changed: true,
        }),
      );
      expect(response.body.request.timeline).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'request_status_changed',
            statusFrom: transition.from.toLowerCase(),
            statusTo: transition.expected,
            note: 'Student called safely',
          }),
        ]),
      );
      assertNoTransitionLeak(response.body);

      const persisted = await prisma.dismissalRequest.findUniqueOrThrow({
        where: { id: requestId },
        select: { status: true },
      });
      expect(persisted.status).toBe(transition.expected.toUpperCase());
    }
  });

  it('creates a safe event and audit record, and updates queue/detail read models', async () => {
    const requestId = await createRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: classroomAId,
      gateId: gateAId,
      status: DismissalRequestStatus.REQUESTED,
      firstName: 'Audit',
      lastName: 'Student',
    });

    await patchStatus(adminToken, requestId, {
      status: 'queued',
      note: 'Queue lane ready',
    }).expect(200);

    await expect(
      prisma.dismissalRequestEvent.count({
        where: {
          schoolId: schoolAId,
          requestId,
          type: DismissalRequestEventType.REQUEST_STATUS_CHANGED,
        },
      }),
    ).resolves.toBe(1);

    const audit = await prisma.auditLog.findFirst({
      where: {
        schoolId: schoolAId,
        module: 'dismissal',
        action: 'dismissal.request.status_changed',
        resourceType: 'dismissal_request',
        resourceId: requestId,
        outcome: AuditOutcome.SUCCESS,
      },
      select: { before: true, after: true },
    });
    expect(audit).toEqual(
      expect.objectContaining({
        before: expect.objectContaining({ status: 'REQUESTED' }),
        after: expect.objectContaining({ status: 'QUEUED', note: true }),
      }),
    );

    const list = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/active?status=queued`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(list.body.data.map((item: { id: string }) => item.id)).toContain(
      requestId,
    );
    expect(list.body.summary.queuedCount).toBeGreaterThanOrEqual(1);

    const detail = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/${requestId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(detail.body.request.status).toBe('queued');
    expect(detail.body.request.timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'request_status_changed',
          statusFrom: 'requested',
          statusTo: 'queued',
          note: 'Queue lane ready',
        }),
      ]),
    );
    assertNoTransitionLeak(detail.body);
  });

  it('treats same-status updates as idempotent no-ops', async () => {
    const requestId = await createRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: classroomAId,
      gateId: gateAId,
      status: DismissalRequestStatus.QUEUED,
      firstName: 'Same',
      lastName: 'Status',
    });
    const eventsBefore = await countStatusChangeEvents(requestId);
    const auditsBefore = await countStatusChangeAudits(requestId);

    const response = await patchStatus(adminToken, requestId, {
      status: 'queued',
      note: 'Should not create event',
    }).expect(200);

    expect(response.body.request).toEqual(
      expect.objectContaining({
        id: requestId,
        status: 'queued',
        previousStatus: null,
        changed: false,
      }),
    );
    await expect(countStatusChangeEvents(requestId)).resolves.toBe(eventsBefore);
    await expect(countStatusChangeAudits(requestId)).resolves.toBe(auditsBefore);
  });

  it('rejects invalid, skipped, backward, and terminal transitions without writes', async () => {
    const backwardId = await createRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: classroomAId,
      gateId: gateAId,
      status: DismissalRequestStatus.CALLED,
      firstName: 'Backward',
      lastName: 'Student',
    });
    const skippedId = await createRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: classroomAId,
      gateId: gateAId,
      status: DismissalRequestStatus.REQUESTED,
      firstName: 'Skipped',
      lastName: 'Student',
    });
    const readyId = await createRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: classroomAId,
      gateId: gateAId,
      status: DismissalRequestStatus.READY,
      firstName: 'Ready',
      lastName: 'Student',
    });

    await expectRejectedTransition({
      requestId: backwardId,
      body: { status: 'queued' },
      expectedCode: 'dismissal.request.invalid_transition',
      expectedStatus: DismissalRequestStatus.CALLED,
    });
    await expectRejectedTransition({
      requestId: skippedId,
      body: { status: 'ready' },
      expectedCode: 'dismissal.request.invalid_transition',
      expectedStatus: DismissalRequestStatus.REQUESTED,
    });
    await expectRejectedTransition({
      requestId: skippedId,
      body: { status: 'requested' },
      expectedCode: 'dismissal.request.invalid_status',
      expectedStatus: DismissalRequestStatus.REQUESTED,
    });
    await expectRejectedTransition({
      requestId: readyId,
      body: { status: 'handed_over' },
      expectedCode: 'dismissal.request.terminal_status',
      expectedStatus: DismissalRequestStatus.READY,
    });
    await expectRejectedTransition({
      requestId: readyId,
      body: { status: 'cancelled' },
      expectedCode: 'dismissal.request.terminal_status',
      expectedStatus: DismissalRequestStatus.READY,
    });
  });

  it('returns safe 404 for terminal, deleted, and cross-school requests', async () => {
    const terminalId = await createRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: classroomAId,
      gateId: gateAId,
      status: DismissalRequestStatus.HANDED_OVER,
      firstName: 'Terminal',
      lastName: 'Student',
    });
    const deletedId = await createRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: classroomAId,
      gateId: gateAId,
      status: DismissalRequestStatus.REQUESTED,
      firstName: 'Deleted',
      lastName: 'Student',
      deletedAt: new Date(),
    });
    const crossSchoolId = await createRequest({
      schoolId: schoolBId,
      organizationId: organizationBId,
      guardianId: guardianBId,
      requestedById: parentBId,
      classroomId: classroomBId,
      gateId: gateBId,
      status: DismissalRequestStatus.REQUESTED,
      firstName: 'Cross',
      lastName: 'Student',
    });

    for (const id of [terminalId, deletedId, crossSchoolId]) {
      const response = await patchStatus(adminToken, id, {
        status: 'called',
      }).expect(404);
      expect(response.body?.error?.code).toBe('dismissal.request.not_found');
    }
  });

  it('enforces dismissal staff assignment scope for status mutations', async () => {
    const gateVisibleId = await createRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: classroomAId,
      gateId: gateAId,
      status: DismissalRequestStatus.REQUESTED,
      firstName: 'Gate',
      lastName: 'Visible',
    });
    const classroomVisibleId = await createRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: classroomAId,
      gateId: gateAId,
      status: DismissalRequestStatus.QUEUED,
      firstName: 'Classroom',
      lastName: 'Visible',
    });

    await patchStatus(staffGateToken, gateVisibleId, { status: 'called' }).expect(
      200,
    );
    await patchStatus(staffClassroomToken, classroomVisibleId, {
      status: 'called',
    }).expect(200);

    const hiddenId = await createRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: classroomAId,
      gateId: gateAId,
      status: DismissalRequestStatus.REQUESTED,
      firstName: 'Hidden',
      lastName: 'Assignment',
    });
    await patchStatus(staffNonMatchingToken, hiddenId, {
      status: 'called',
    }).expect(404);
    await patchStatus(staffExpiredToken, hiddenId, { status: 'called' }).expect(
      404,
    );
  });

  it('forbids parents from transitioning dismissal requests', async () => {
    const requestId = await createRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: classroomAId,
      gateId: gateAId,
      status: DismissalRequestStatus.REQUESTED,
      firstName: 'Parent',
      lastName: 'Forbidden',
    });

    await patchStatus(parentToken, requestId, { status: 'called' }).expect(403);
  });

  function patchStatus(
    token: string,
    requestId: string,
    body: Record<string, unknown>,
  ) {
    return request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/requests/${requestId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  async function expectRejectedTransition(params: {
    requestId: string;
    body: Record<string, unknown>;
    expectedCode: string;
    expectedStatus: DismissalRequestStatus;
  }) {
    const eventsBefore = await countStatusChangeEvents(params.requestId);
    const expectedHttpStatus =
      params.expectedCode.endsWith('terminal_status') ||
      params.expectedCode.endsWith('invalid_transition')
        ? 409
        : 422;
    const response = await patchStatus(
      adminToken,
      params.requestId,
      params.body,
    ).expect(expectedHttpStatus);
    expect(response.body?.error?.code).toBe(params.expectedCode);

    const requestRecord = await prisma.dismissalRequest.findUniqueOrThrow({
      where: { id: params.requestId },
      select: { status: true },
    });
    expect(requestRecord.status).toBe(params.expectedStatus);
    await expect(countStatusChangeEvents(params.requestId)).resolves.toBe(
      eventsBefore,
    );
  }

  async function countStatusChangeEvents(requestId: string): Promise<number> {
    return prisma.dismissalRequestEvent.count({
      where: {
        requestId,
        type: DismissalRequestEventType.REQUEST_STATUS_CHANGED,
      },
    });
  }

  async function countStatusChangeAudits(requestId: string): Promise<number> {
    return prisma.auditLog.count({
      where: {
        schoolId: schoolAId,
        action: 'dismissal.request.status_changed',
        resourceId: requestId,
      },
    });
  }

  async function createSchoolFixture(label: string): Promise<{
    organizationId: string;
    schoolId: string;
  }> {
    const organization = await prisma.organization.create({
      data: {
        slug: `dismissal-trans-${TEST_RUN_ID}-org-${label}`,
        name: `Dismissal Transitions Org ${label}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);

    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `dismissal-trans-${TEST_RUN_ID}-school-${label}`,
        name: `Dismissal Transitions School ${label}`,
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
        nameAr: `trans-year-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Transitions Year ${label}`,
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
        nameAr: `trans-term-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Transitions Term ${label}`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-01-15T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    const stage = await prisma.stage.create({
      data: {
        schoolId,
        nameAr: `trans-stage-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Transitions Stage ${label}`,
      },
      select: { id: true },
    });
    const grade = await prisma.grade.create({
      data: {
        schoolId,
        stageId: stage.id,
        nameAr: `trans-grade-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Transitions Grade ${label}`,
      },
      select: { id: true },
    });
    const section = await prisma.section.create({
      data: {
        schoolId,
        gradeId: grade.id,
        nameAr: `trans-section-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Transitions Section ${label}`,
      },
      select: { id: true },
    });
    const alternateSection = await prisma.section.create({
      data: {
        schoolId,
        gradeId: grade.id,
        nameAr: `trans-section-alt-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Transitions Section Alt ${label}`,
      },
      select: { id: true },
    });
    const classroom = await prisma.classroom.create({
      data: {
        schoolId,
        sectionId: section.id,
        nameAr: `trans-classroom-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Transitions Classroom ${label}`,
      },
      select: { id: true },
    });
    const alternateClassroom = await prisma.classroom.create({
      data: {
        schoolId,
        sectionId: alternateSection.id,
        nameAr: `trans-classroom-alt-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Transitions Classroom Alt ${label}`,
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
        firstName: 'Transitions',
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
        clientRequestId: `trans-${TEST_RUN_ID}-${student.id}`,
        parentLatitude: 30.04442,
        parentLongitude: 31.235712,
        distanceMeters: 20,
        geofencePassed: true,
        requestedAt: new Date(Date.now() - 5 * 60_000),
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

function assertNoTransitionLeak(payload: unknown): void {
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
