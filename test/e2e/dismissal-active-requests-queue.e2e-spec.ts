import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
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
const PASSWORD = 'DismissalCallsE2E123!';
const TEST_RUN_ID = randomUUID().slice(0, 8);
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(120_000);

describe('DISMISSAL-CALLS-1A active requests queue (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let organizationAId: string;
  let organizationBId: string;
  let schoolAId: string;
  let schoolBId: string;
  let adminAToken: string;
  let adminBToken: string;
  let staffGateToken: string;
  let staffClassroomToken: string;
  let staffNoAssignmentsToken: string;
  let staffNonMatchingToken: string;
  let staffExpiredToken: string;
  let parentAId: string;
  let parentBId: string;
  let guardianAId: string;
  let guardianBId: string;
  let classroomAId: string;
  let alternateClassroomAId: string;
  let classroomBId: string;
  let gateAId: string;
  let gateA2Id: string;
  let gateBId: string;
  let requestedRequestId: string;
  let queuedRequestId: string;
  let readyOtherRequestId: string;
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
    classroomAId = academicA.classroomId;
    alternateClassroomAId = academicA.alternateClassroomId;
    const academicB = await createAcademicFixture('b', schoolBId);
    classroomBId = academicB.classroomId;

    gateAId = await createGate({
      schoolId: schoolAId,
      code: `CALL-A-${TEST_RUN_ID}`,
      name: 'Calls Main Gate',
      status: DismissalGateOperationalStatus.OPEN,
      sortOrder: 1,
    });
    gateA2Id = await createGate({
      schoolId: schoolAId,
      code: `CALL-BUSY-${TEST_RUN_ID}`,
      name: 'Calls Busy Gate',
      status: DismissalGateOperationalStatus.BUSY,
      sortOrder: 2,
    });
    gateBId = await createGate({
      schoolId: schoolBId,
      code: `CALL-X-${TEST_RUN_ID}`,
      name: 'Cross Calls Gate',
      status: DismissalGateOperationalStatus.OPEN,
      sortOrder: 1,
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
      email: `dismissal-calls-${TEST_RUN_ID}-admin-a@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: schoolAdminRole.id,
      userType: UserType.SCHOOL_USER,
      firstName: 'Queue',
      lastName: 'Admin A',
    });
    const adminB = await createUserWithMembership({
      email: `dismissal-calls-${TEST_RUN_ID}-admin-b@moazez.local`,
      schoolId: schoolBId,
      organizationId: organizationBId,
      roleId: schoolAdminRole.id,
      userType: UserType.SCHOOL_USER,
      firstName: 'Queue',
      lastName: 'Admin B',
    });
    const staffGate = await createUserWithMembership({
      email: `dismissal-calls-${TEST_RUN_ID}-staff-gate@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
      firstName: 'Gate',
      lastName: 'Staff',
    });
    const staffClassroom = await createUserWithMembership({
      email: `dismissal-calls-${TEST_RUN_ID}-staff-classroom@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
      firstName: 'Classroom',
      lastName: 'Staff',
    });
    const staffNoAssignments = await createUserWithMembership({
      email: `dismissal-calls-${TEST_RUN_ID}-staff-empty@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
      firstName: 'Empty',
      lastName: 'Staff',
    });
    const staffNonMatching = await createUserWithMembership({
      email: `dismissal-calls-${TEST_RUN_ID}-staff-other@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
      firstName: 'Other',
      lastName: 'Staff',
    });
    const staffExpired = await createUserWithMembership({
      email: `dismissal-calls-${TEST_RUN_ID}-staff-expired@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
      firstName: 'Expired',
      lastName: 'Staff',
    });
    const parentA = await createUserWithMembership({
      email: `dismissal-calls-${TEST_RUN_ID}-parent-a@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: parentRole.id,
      userType: UserType.PARENT,
      firstName: 'Parent',
      lastName: 'Alpha',
    });
    const parentB = await createUserWithMembership({
      email: `dismissal-calls-${TEST_RUN_ID}-parent-b@moazez.local`,
      schoolId: schoolBId,
      organizationId: organizationBId,
      roleId: parentRole.id,
      userType: UserType.PARENT,
      firstName: 'Parent',
      lastName: 'Beta',
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

    requestedRequestId = await createRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: classroomAId,
      gateId: gateAId,
      status: DismissalRequestStatus.REQUESTED,
      firstName: 'Salma',
      lastName: 'Queue',
      requestedAt: minutesAgo(5),
    });
    queuedRequestId = await createRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: classroomAId,
      gateId: gateA2Id,
      status: DismissalRequestStatus.QUEUED,
      firstName: 'Omar',
      lastName: 'Classroom',
      requestedAt: minutesAgo(3),
    });
    readyOtherRequestId = await createRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: alternateClassroomAId,
      gateId: gateA2Id,
      status: DismissalRequestStatus.READY,
      firstName: 'Mona',
      lastName: 'Other',
      requestedAt: minutesAgo(1),
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
      lastName: 'Terminal',
      requestedAt: minutesAgo(10),
    });
    cancelledRequestId = await createRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: classroomAId,
      gateId: gateAId,
      status: DismissalRequestStatus.CANCELLED,
      firstName: 'Cancel',
      lastName: 'Terminal',
      requestedAt: minutesAgo(10),
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
      requestedAt: minutesAgo(10),
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
      lastName: 'Hidden',
      requestedAt: minutesAgo(10),
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
      lastName: 'Hidden',
      requestedAt: minutesAgo(4),
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
    staffClassroomToken = await login(staffClassroom.email);
    staffNoAssignmentsToken = await login(staffNoAssignments.email);
    staffNonMatchingToken = await login(staffNonMatching.email);
    staffExpiredToken = await login(staffExpired.email);
  });

  afterAll(async () => {
    if (prisma) {
      const schoolIds = [schoolAId, schoolBId].filter(Boolean);
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
    if (app) {
      await app.close();
    }
  });

  it('lets school admin list current-school active requests only', async () => {
    const response = await listActive(adminAToken).expect(200);
    const ids = response.body.data.map((item: { id: string }) => item.id);

    expect(ids).toEqual(
      expect.arrayContaining([requestedRequestId, queuedRequestId, readyOtherRequestId]),
    );
    expect(ids).not.toEqual(
      expect.arrayContaining([
        handedOverRequestId,
        cancelledRequestId,
        expiredRequestId,
        deletedRequestId,
        crossSchoolRequestId,
      ]),
    );
    expect(response.body.summary).toEqual(
      expect.objectContaining({
        totalCount: 3,
        requestedCount: 1,
        queuedCount: 1,
        readyCount: 1,
      }),
    );
    assertNoQueueLeak(response.body);
  });

  it('lets school admin get active detail and hides cross-school, terminal, and deleted requests', async () => {
    const detail = await getDetail(adminAToken, requestedRequestId).expect(200);

    expect(detail.body.request.id).toBe(requestedRequestId);
    expect(detail.body.request.timeline).toEqual([
      expect.objectContaining({
        type: 'request_created',
        statusFrom: null,
        statusTo: 'requested',
      }),
    ]);
    assertNoQueueLeak(detail.body);

    await getDetail(adminAToken, crossSchoolRequestId).expect(404);
    await getDetail(adminAToken, handedOverRequestId).expect(404);
    await getDetail(adminAToken, cancelledRequestId).expect(404);
    await getDetail(adminAToken, expiredRequestId).expect(404);
    await getDetail(adminAToken, deletedRequestId).expect(404);

    const crossSchoolAdmin = await getDetail(adminBToken, requestedRequestId).expect(404);
    expect(crossSchoolAdmin.body?.error?.code).toBe('dismissal.request.not_found');
  });

  it('enforces dismissal staff gate and classroom assignment visibility', async () => {
    const gateList = await listActive(staffGateToken).expect(200);
    expect(gateList.body.data.map((item: { id: string }) => item.id)).toEqual([
      requestedRequestId,
    ]);

    const classroomList = await listActive(staffClassroomToken).expect(200);
    expect(classroomList.body.data.map((item: { id: string }) => item.id)).toEqual(
      expect.arrayContaining([requestedRequestId, queuedRequestId]),
    );
    expect(classroomList.body.data.map((item: { id: string }) => item.id)).not.toContain(
      readyOtherRequestId,
    );

    await getDetail(staffGateToken, requestedRequestId).expect(200);
    await getDetail(staffGateToken, queuedRequestId).expect(404);
    await getDetail(staffClassroomToken, queuedRequestId).expect(200);
  });

  it('returns empty or safe 404 for staff without matching active assignments', async () => {
    for (const token of [
      staffNoAssignmentsToken,
      staffNonMatchingToken,
      staffExpiredToken,
    ]) {
      const list = await listActive(token).expect(200);
      expect(list.body.data).toEqual([]);
      expect(list.body.summary.totalCount).toBe(0);
      await getDetail(token, requestedRequestId).expect(404);
    }
  });

  it('supports status, gate, q, pagination, and computed signal fields', async () => {
    const status = await listActive(adminAToken, '?status=requested').expect(200);
    expect(status.body.data.map((item: { id: string }) => item.id)).toEqual([
      requestedRequestId,
    ]);

    const gate = await listActive(adminAToken, `?gateId=${gateA2Id}`).expect(200);
    expect(gate.body.data.map((item: { id: string }) => item.id)).toEqual(
      expect.arrayContaining([queuedRequestId, readyOtherRequestId]),
    );

    const search = await listActive(adminAToken, '?q=Salma').expect(200);
    expect(search.body.data).toHaveLength(1);
    expect(search.body.data[0].id).toBe(requestedRequestId);

    const paged = await listActive(
      adminAToken,
      '?sort=requested_at_asc&page=2&limit=1',
    ).expect(200);
    expect(paged.body.data).toHaveLength(1);
    expect(paged.body.pagination).toEqual({
      page: 2,
      limit: 1,
      totalPages: 3,
    });

    const signalItem = status.body.data[0];
    expect(signalItem.waitMinutes).toBeGreaterThanOrEqual(2);
    expect(signalItem.signals).toEqual(
      expect.objectContaining({
        delayed: true,
        urgent: true,
        delayThresholdMinutes: 1,
        urgentThresholdMinutes: 2,
      }),
    );
    expect(status.body.summary.delayedCount).toBeGreaterThanOrEqual(1);
    expect(status.body.summary.urgentCount).toBeGreaterThanOrEqual(1);
  });

  it('rejects invalid active status filters with a stable machine code', async () => {
    const response = await listActive(adminAToken, '?status=handed_over').expect(422);
    expect(response.body?.error?.code).toBe(
      'dismissal.request.invalid_status_filter',
    );
  });

  function listActive(token: string, query = '') {
    return request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/active${query}`)
      .set('Authorization', `Bearer ${token}`);
  }

  function getDetail(token: string, requestId: string) {
    return request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/${requestId}`)
      .set('Authorization', `Bearer ${token}`);
  }

  async function createSchoolFixture(label: string): Promise<{
    organizationId: string;
    schoolId: string;
  }> {
    const organization = await prisma.organization.create({
      data: {
        slug: `dismissal-calls-${TEST_RUN_ID}-org-${label}`,
        name: `Dismissal Calls Org ${label}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);

    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `dismissal-calls-${TEST_RUN_ID}-school-${label}`,
        name: `Dismissal Calls School ${label}`,
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
        nameAr: `calls-year-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Calls Year ${label}`,
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
        nameAr: `calls-term-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Calls Term ${label}`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-01-15T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    const stage = await prisma.stage.create({
      data: {
        schoolId,
        nameAr: `calls-stage-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Calls Stage ${label}`,
      },
      select: { id: true },
    });
    const grade = await prisma.grade.create({
      data: {
        schoolId,
        stageId: stage.id,
        nameAr: `calls-grade-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Calls Grade ${label}`,
      },
      select: { id: true },
    });
    const section = await prisma.section.create({
      data: {
        schoolId,
        gradeId: grade.id,
        nameAr: `calls-section-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Calls Section ${label}`,
      },
      select: { id: true },
    });
    const alternateSection = await prisma.section.create({
      data: {
        schoolId,
        gradeId: grade.id,
        nameAr: `calls-section-alt-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Calls Section Alt ${label}`,
      },
      select: { id: true },
    });
    const classroom = await prisma.classroom.create({
      data: {
        schoolId,
        sectionId: section.id,
        nameAr: `calls-classroom-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Calls Classroom ${label}`,
      },
      select: { id: true },
    });
    const alternateClassroom = await prisma.classroom.create({
      data: {
        schoolId,
        sectionId: alternateSection.id,
        nameAr: `calls-classroom-alt-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Calls Classroom Alt ${label}`,
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
    sortOrder: number;
  }): Promise<string> {
    const gate = await prisma.dismissalGate.create({
      data: {
        schoolId: params.schoolId,
        code: params.code,
        name: params.name,
        status: params.status,
        isActive: true,
        sortOrder: params.sortOrder,
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
        firstName: 'Calls',
        lastName: `Guardian ${params.marker}`,
        relation: 'guardian',
        phone: `0100000${params.marker === 'a' ? '1' : '2'}`,
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
    const enrollmentContext = await prisma.classroom.findFirstOrThrow({
      where: { id: params.classroomId, schoolId: params.schoolId },
      select: {
        id: true,
        section: {
          select: {
            grade: {
              select: {
                stage: {
                  select: { id: true },
                },
              },
            },
          },
        },
      },
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
        clientRequestId: `calls-${TEST_RUN_ID}-${student.id}`,
        parentLatitude: 30.04442,
        parentLongitude: 31.235712,
        distanceMeters: 20,
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

function assertNoQueueLeak(payload: unknown): void {
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
