import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  CommunicationNotificationDeliveryChannel,
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

const GLOBAL_PREFIX = '/api/v1';
const PASSWORD = 'DismissalNotifications123!';
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

describe('DISMISSAL-NOTIFICATIONS-1A runtime (e2e)', () => {
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
  let alternateGateAId: string;
  let gateBId: string;
  let parentAId: string;
  let parentBId: string;
  let guardianAId: string;
  let guardianBId: string;
  let staffAssignedAId: string;
  let staffOtherAId: string;
  let adminToken: string;
  let parentToken: string;
  let staffAssignedToken: string;
  let staffOtherToken: string;
  const createdUserIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdOrganizationIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [schoolAdminRole, parentRole, dismissalStaffRole] = await Promise.all([
      prisma.role.findFirst({
        where: { key: 'school_admin', schoolId: null, isSystem: true },
        select: { id: true },
      }),
      prisma.role.findFirst({
        where: { key: 'parent', schoolId: null, isSystem: true },
        select: { id: true },
      }),
      prisma.role.findFirst({
        where: { key: 'dismissal_staff', schoolId: null, isSystem: true },
        select: { id: true },
      }),
    ]);
    if (!schoolAdminRole || !parentRole || !dismissalStaffRole) {
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

    gateAId = await createGate(schoolAId, `NOTIF-A-${TEST_RUN_ID}`, 'Main Gate');
    alternateGateAId = await createGate(
      schoolAId,
      `NOTIF-ALT-${TEST_RUN_ID}`,
      'Alternate Gate',
    );
    gateBId = await createGate(schoolBId, `NOTIF-B-${TEST_RUN_ID}`, 'Cross Gate');

    const admin = await createUserWithMembership({
      email: `notif-${TEST_RUN_ID}-admin@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: schoolAdminRole.id,
      userType: UserType.SCHOOL_USER,
      firstName: 'Notification',
      lastName: 'Admin',
    });
    const parentA = await createUserWithMembership({
      email: `notif-${TEST_RUN_ID}-parent-a@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: parentRole.id,
      userType: UserType.PARENT,
      firstName: 'Parent',
      lastName: 'A',
    });
    const parentB = await createUserWithMembership({
      email: `notif-${TEST_RUN_ID}-parent-b@moazez.local`,
      schoolId: schoolBId,
      organizationId: organizationBId,
      roleId: parentRole.id,
      userType: UserType.PARENT,
      firstName: 'Parent',
      lastName: 'B',
    });
    const staffAssigned = await createUserWithMembership({
      email: `notif-${TEST_RUN_ID}-staff-assigned@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
      firstName: 'Assigned',
      lastName: 'Staff',
    });
    const staffOther = await createUserWithMembership({
      email: `notif-${TEST_RUN_ID}-staff-other@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
      firstName: 'Other',
      lastName: 'Staff',
    });
    parentAId = parentA.userId;
    parentBId = parentB.userId;
    staffAssignedAId = staffAssigned.userId;
    staffOtherAId = staffOther.userId;

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

    await prisma.dismissalSettings.createMany({
      data: [
        settingsData(schoolAId, gateAId),
        settingsData(schoolBId, gateBId),
      ],
    });
    await prisma.dismissalStaffAssignment.create({
      data: {
        schoolId: schoolAId,
        staffUserId: staffAssignedAId,
        gateId: gateAId,
        isActive: true,
      },
    });
    await prisma.dismissalStaffAssignment.create({
      data: {
        schoolId: schoolAId,
        staffUserId: staffOtherAId,
        classroomId: alternateClassroomAId,
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

    adminToken = await login(admin.email);
    parentToken = await login(parentA.email);
    staffAssignedToken = await login(staffAssigned.email);
    staffOtherToken = await login(staffOther.email);
  });

  beforeEach(async () => {
    await clearRuntimeState();
  });

  afterAll(async () => {
    if (prisma) {
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
      await prisma.dismissalGate.deleteMany({ where: { schoolId: { in: schoolIds } } });
      await prisma.studentGuardian.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.enrollment.deleteMany({ where: { schoolId: { in: schoolIds } } });
      await prisma.student.deleteMany({ where: { schoolId: { in: schoolIds } } });
      await prisma.guardian.deleteMany({ where: { schoolId: { in: schoolIds } } });
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

  it('emits staff notifications for matching parent create/cancel events without push attempts or duplicates', async () => {
    const child = await createChild({
      schoolId: schoolAId,
      organizationId: organizationAId,
      classroomId: classroomAId,
      guardianId: guardianAId,
      firstName: 'Create',
      lastName: 'Match',
    });

    const created = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/smart-pickup/requests`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        childId: child.studentId,
        gateId: gateAId,
        latitude: SCHOOL_LATITUDE,
        longitude: SCHOOL_LONGITUDE,
        clientRequestId: `create-${TEST_RUN_ID}`,
      })
      .expect(201);
    const requestId = created.body.request.id as string;

    await expectNotificationCount({
      recipientUserId: staffAssignedAId,
      type: CommunicationNotificationType.DISMISSAL_REQUEST_CREATED,
      expected: 1,
    });
    await expectNotificationCount({
      recipientUserId: staffOtherAId,
      type: CommunicationNotificationType.DISMISSAL_REQUEST_CREATED,
      expected: 0,
    });

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/smart-pickup/requests`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        childId: child.studentId,
        gateId: gateAId,
        latitude: SCHOOL_LATITUDE,
        longitude: SCHOOL_LONGITUDE,
        clientRequestId: `create-${TEST_RUN_ID}`,
      })
      .expect(201);
    await expectNotificationCount({
      recipientUserId: staffAssignedAId,
      type: CommunicationNotificationType.DISMISSAL_REQUEST_CREATED,
      expected: 1,
    });

    const delivery = await prisma.communicationNotificationDelivery.findFirst({
      where: {
        notification: {
          recipientUserId: staffAssignedAId,
          type: CommunicationNotificationType.DISMISSAL_REQUEST_CREATED,
        },
      },
      select: { channel: true, status: true, provider: true },
    });
    expect(delivery).toEqual({
      channel: CommunicationNotificationDeliveryChannel.IN_APP,
      status: 'DELIVERED',
      provider: 'in_app',
    });
    await expect(expectPushAttemptCount()).resolves.toBe(0);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/smart-pickup/requests/${requestId}/cancel`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({ note: 'Leaving early' })
      .expect(201);
    await expectNotificationCount({
      recipientUserId: staffAssignedAId,
      type: CommunicationNotificationType.DISMISSAL_REQUEST_CANCELLED,
      expected: 1,
    });

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/smart-pickup/requests/${requestId}/cancel`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({})
      .expect(201);
    await expectNotificationCount({
      recipientUserId: staffAssignedAId,
      type: CommunicationNotificationType.DISMISSAL_REQUEST_CANCELLED,
      expected: 1,
    });

    const noMatchChild = await createChild({
      schoolId: schoolAId,
      organizationId: organizationAId,
      classroomId: classroomAId,
      guardianId: guardianAId,
      firstName: 'Create',
      lastName: 'NoMatch',
    });
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/smart-pickup/requests`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        childId: noMatchChild.studentId,
        gateId: alternateGateAId,
        latitude: SCHOOL_LATITUDE,
        longitude: SCHOOL_LONGITUDE,
        clientRequestId: `no-match-${TEST_RUN_ID}`,
      })
      .expect(201);
    await expectNotificationCount({
      recipientUserId: staffAssignedAId,
      type: CommunicationNotificationType.DISMISSAL_REQUEST_CREATED,
      expected: 1,
    });
  });

  it('emits parent notifications for CALLED, READY, and HANDED_OVER only', async () => {
    const calledRequestId = await createRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      classroomId: classroomAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      gateId: gateAId,
      status: DismissalRequestStatus.REQUESTED,
      firstName: 'Called',
      lastName: 'Child',
    });
    await patchStatus(calledRequestId, 'called').expect(200);
    await expectNotificationCount({
      recipientUserId: parentAId,
      type: CommunicationNotificationType.DISMISSAL_REQUEST_CALLED,
      expected: 1,
    });
    await patchStatus(calledRequestId, 'called').expect(200);
    await expectNotificationCount({
      recipientUserId: parentAId,
      type: CommunicationNotificationType.DISMISSAL_REQUEST_CALLED,
      expected: 1,
    });

    const queuedRequestId = await createRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      classroomId: classroomAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      gateId: gateAId,
      status: DismissalRequestStatus.REQUESTED,
      firstName: 'Queued',
      lastName: 'NoNotify',
    });
    await patchStatus(queuedRequestId, 'queued').expect(200);
    await expectNotificationCount({
      recipientUserId: parentAId,
      type: CommunicationNotificationType.DISMISSAL_REQUEST_READY,
      expected: 0,
    });

    const readyRequestId = await createRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      classroomId: classroomAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      gateId: gateAId,
      status: DismissalRequestStatus.AT_GATE,
      firstName: 'Ready',
      lastName: 'Child',
    });
    await patchStatus(readyRequestId, 'ready').expect(200);
    await expectNotificationCount({
      recipientUserId: parentAId,
      type: CommunicationNotificationType.DISMISSAL_REQUEST_READY,
      expected: 1,
    });

    const deliveredRequestId = await createRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      classroomId: classroomAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      gateId: gateAId,
      status: DismissalRequestStatus.READY,
      firstName: 'Delivered',
      lastName: 'Child',
    });
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/requests/${deliveredRequestId}/deliver`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ receiverName: 'Safe Receiver' })
      .expect(201);
    await expectNotificationCount({
      recipientUserId: parentAId,
      type: CommunicationNotificationType.DISMISSAL_REQUEST_HANDED_OVER,
      expected: 1,
    });
    await expectNotificationCount({
      recipientUserId: parentBId,
      type: CommunicationNotificationType.DISMISSAL_REQUEST_HANDED_OVER,
      expected: 0,
    });
    await expect(expectPushAttemptCount()).resolves.toBe(0);
  });

  it('lists, filters, paginates, marks read, and read-alls only own dismissal notifications', async () => {
    const first = await createNotification({
      recipientUserId: staffAssignedAId,
      type: CommunicationNotificationType.DISMISSAL_REQUEST_CREATED,
      title: 'New pickup request',
      requestId: randomUUID(),
    });
    const second = await createNotification({
      recipientUserId: staffAssignedAId,
      type: CommunicationNotificationType.DISMISSAL_REQUEST_CANCELLED,
      title: 'Pickup request cancelled',
      requestId: randomUUID(),
    });
    await createNotification({
      recipientUserId: staffOtherAId,
      type: CommunicationNotificationType.DISMISSAL_REQUEST_CREATED,
      title: 'Other staff notification',
      requestId: randomUUID(),
    });
    await createNotification({
      recipientUserId: staffAssignedAId,
      type: CommunicationNotificationType.DISMISSAL_REQUEST_CREATED,
      title: 'Cross-school notification',
      requestId: randomUUID(),
      schoolId: schoolBId,
    });

    const pageOne = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/notifications`)
      .query({ limit: 1, page: 1, sort: 'created_at_asc' })
      .set('Authorization', `Bearer ${staffAssignedToken}`)
      .expect(200);
    expect(pageOne.body.data).toHaveLength(1);
    expect(pageOne.body.summary).toMatchObject({
      totalCount: 2,
      unreadCount: 2,
      requestCreatedCount: 1,
      requestCancelledCount: 1,
    });
    expect(pageOne.body.pagination).toEqual({ page: 1, limit: 1, totalPages: 2 });
    assertNoNotificationLeak(pageOne.body);

    const typeFiltered = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/notifications`)
      .query({ type: 'request_cancelled' })
      .set('Authorization', `Bearer ${staffAssignedToken}`)
      .expect(200);
    expect(typeFiltered.body.data.map((item: { id: string }) => item.id)).toEqual([
      second.id,
    ]);

    const read = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/notifications/${first.id}/read`)
      .set('Authorization', `Bearer ${staffAssignedToken}`)
      .expect(200);
    expect(read.body.notification).toEqual({
      id: first.id,
      readAt: expect.any(String),
    });
    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/notifications/${first.id}/read`)
      .set('Authorization', `Bearer ${staffAssignedToken}`)
      .expect(200);

    const unreadOnly = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/notifications`)
      .query({ unreadOnly: 'true' })
      .set('Authorization', `Bearer ${staffAssignedToken}`)
      .expect(200);
    expect(unreadOnly.body.data.map((item: { id: string }) => item.id)).toEqual([
      second.id,
    ]);

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/notifications/${second.id}/read`)
      .set('Authorization', `Bearer ${staffOtherToken}`)
      .expect(404);

    const readAll = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/notifications/read-all`)
      .set('Authorization', `Bearer ${staffAssignedToken}`)
      .expect(200);
    expect(readAll.body.updatedCount).toBe(1);

    await expect(
      prisma.communicationNotification.findUniqueOrThrow({
        where: { id: second.id },
        select: { status: true, readAt: true },
      }),
    ).resolves.toEqual({
      status: CommunicationNotificationStatus.READ,
      readAt: expect.any(Date),
    });
  });

  it('persists safe metadata and rejects parent access to dismissal notification center', async () => {
    const requestId = await createRequest({
      schoolId: schoolAId,
      organizationId: organizationAId,
      classroomId: classroomAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      gateId: gateAId,
      status: DismissalRequestStatus.REQUESTED,
      firstName: 'Safe',
      lastName: 'Metadata',
    });
    await patchStatus(requestId, 'called').expect(200);

    const notification = await prisma.communicationNotification.findFirstOrThrow({
      where: {
        schoolId: schoolAId,
        recipientUserId: parentAId,
        type: CommunicationNotificationType.DISMISSAL_REQUEST_CALLED,
      },
      select: {
        schoolId: true,
        recipientUserId: true,
        actorUserId: true,
        sourceModule: true,
        sourceType: true,
        sourceId: true,
        metadata: true,
      },
    });
    expect(notification).toMatchObject({
      schoolId: schoolAId,
      recipientUserId: parentAId,
      actorUserId: null,
      sourceModule: CommunicationNotificationSourceModule.DISMISSAL,
      sourceType: 'dismissal_request',
      sourceId: requestId,
    });
    assertNoNotificationLeak(notification.metadata);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/notifications`)
      .set('Authorization', `Bearer ${parentToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/smart-pickup/requests/${randomUUID()}/cancel`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({})
      .expect(404);
    await expectNotificationCount({
      recipientUserId: staffAssignedAId,
      type: CommunicationNotificationType.DISMISSAL_REQUEST_CANCELLED,
      expected: 0,
    });
  });

  function patchStatus(requestId: string, status: string) {
    return request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/requests/${requestId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status });
  }

  async function clearRuntimeState(): Promise<void> {
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
    await prisma.auditLog.deleteMany({ where: { schoolId: { in: schoolIds } } });
    await prisma.dismissalRequestEvent.deleteMany({
      where: { schoolId: { in: schoolIds } },
    });
    await prisma.dismissalRequest.deleteMany({
      where: { schoolId: { in: schoolIds } },
    });
  }

  async function createSchoolFixture(label: string) {
    const organization = await prisma.organization.create({
      data: {
        slug: `dismissal-notif-${TEST_RUN_ID}-org-${label}`,
        name: `Dismissal Notifications Org ${label}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);

    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `dismissal-notif-${TEST_RUN_ID}-school-${label}`,
        name: `Dismissal Notifications School ${label}`,
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
        nameAr: `notif-year-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Notifications Year ${label}`,
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
        nameAr: `notif-term-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Notifications Term ${label}`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-01-15T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    const stage = await prisma.stage.create({
      data: {
        schoolId,
        nameAr: `notif-stage-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Notifications Stage ${label}`,
      },
      select: { id: true },
    });
    const grade = await prisma.grade.create({
      data: {
        schoolId,
        stageId: stage.id,
        nameAr: `notif-grade-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Notifications Grade ${label}`,
      },
      select: { id: true },
    });
    const section = await prisma.section.create({
      data: {
        schoolId,
        gradeId: grade.id,
        nameAr: `notif-section-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Notifications Section ${label}`,
      },
      select: { id: true },
    });
    const alternateSection = await prisma.section.create({
      data: {
        schoolId,
        gradeId: grade.id,
        nameAr: `notif-alt-section-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Notifications Alternate Section ${label}`,
      },
      select: { id: true },
    });
    const classroom = await prisma.classroom.create({
      data: {
        schoolId,
        sectionId: section.id,
        nameAr: `notif-classroom-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Notifications Classroom ${label}`,
      },
      select: { id: true },
    });
    const alternateClassroom = await prisma.classroom.create({
      data: {
        schoolId,
        sectionId: alternateSection.id,
        nameAr: `notif-alt-classroom-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Notifications Alternate Classroom ${label}`,
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

  async function createGate(schoolId: string, code: string, name: string) {
    const gate = await prisma.dismissalGate.create({
      data: {
        schoolId,
        code,
        name,
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
    marker: string;
  }) {
    const guardian = await prisma.guardian.create({
      data: {
        schoolId: params.schoolId,
        organizationId: params.organizationId,
        userId: params.userId,
        firstName: 'Notification',
        lastName: `Guardian ${params.marker}`,
        relation: 'guardian',
        phone: `${TEST_RUN_ID}-${params.marker}`,
        canPickup: true,
        canReceiveNotifications: true,
      },
      select: { id: true },
    });
    return guardian.id;
  }

  async function createChild(params: {
    schoolId: string;
    organizationId: string;
    classroomId: string;
    guardianId: string;
    firstName: string;
    lastName: string;
  }) {
    const academicYear = await prisma.academicYear.findFirstOrThrow({
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

  async function createRequest(params: {
    schoolId: string;
    organizationId: string;
    classroomId: string;
    guardianId: string;
    requestedById: string;
    gateId: string;
    status: DismissalRequestStatus;
    firstName: string;
    lastName: string;
  }) {
    const child = await createChild(params);
    const dismissalRequest = await prisma.dismissalRequest.create({
      data: {
        schoolId: params.schoolId,
        studentId: child.studentId,
        enrollmentId: child.enrollmentId,
        guardianId: params.guardianId,
        requestedById: params.requestedById,
        gateId: params.gateId,
        status: params.status,
        clientRequestId: `notif-${TEST_RUN_ID}-${child.studentId}`,
        parentLatitude: SCHOOL_LATITUDE,
        parentLongitude: SCHOOL_LONGITUDE,
        distanceMeters: 0,
        geofencePassed: true,
        requestedAt: new Date(Date.now() - 5 * 60_000),
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
      },
    });
    return dismissalRequest.id;
  }

  async function createNotification(params: {
    recipientUserId: string;
    type: CommunicationNotificationType;
    title: string;
    requestId: string;
    schoolId?: string;
  }) {
    const notification = await prisma.communicationNotification.create({
      data: {
        schoolId: params.schoolId ?? schoolAId,
        recipientUserId: params.recipientUserId,
        sourceModule: CommunicationNotificationSourceModule.DISMISSAL,
        sourceType: 'dismissal_request',
        sourceId: params.requestId,
        idempotencyKey: `test:${params.requestId}:${params.recipientUserId}:${params.type}`,
        type: params.type,
        title: params.title,
        body: 'Safe body',
        metadata: {
          request: { id: params.requestId, status: 'requested' },
          child: {
            id: randomUUID(),
            displayName: 'Safe Child',
            grade: null,
            section: null,
            classroom: null,
          },
          gate: { id: gateAId, code: `NOTIF-A-${TEST_RUN_ID}`, name: 'Main Gate' },
        },
      },
      select: { id: true },
    });
    await prisma.communicationNotificationDelivery.create({
      data: {
        schoolId: params.schoolId ?? schoolAId,
        notificationId: notification.id,
        channel: CommunicationNotificationDeliveryChannel.IN_APP,
        status: 'DELIVERED',
        provider: 'in_app',
        deliveredAt: new Date(),
      },
    });
    return notification;
  }

  async function expectNotificationCount(params: {
    recipientUserId: string;
    type: CommunicationNotificationType;
    expected: number;
  }) {
    await expect(
      prisma.communicationNotification.count({
        where: {
          schoolId: schoolAId,
          recipientUserId: params.recipientUserId,
          sourceModule: CommunicationNotificationSourceModule.DISMISSAL,
          type: params.type,
        },
      }),
    ).resolves.toBe(params.expected);
  }

  function expectPushAttemptCount(): Promise<number> {
    return prisma.communicationNotificationPushAttempt.count({
      where: { schoolId: { in: [schoolAId, schoolBId] } },
    });
  }

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: PASSWORD })
      .expect(200);

    return response.body.accessToken as string;
  }
});

function settingsData(schoolId: string, defaultGateId: string) {
  return {
    schoolId,
    enabled: true,
    timezone: 'Africa/Cairo',
    schoolLatitude: SCHOOL_LATITUDE,
    schoolLongitude: SCHOOL_LONGITUDE,
    allowedRadiusMeters: 150,
    requestWindowStartLocal: '00:00',
    requestWindowEndLocal: '23:59',
    delayThresholdMinutes: 1,
    urgentThresholdMinutes: 2,
    requirePickupCode: false,
    allowDelegatePickup: true,
    allowParentCancelBeforeCalled: true,
    defaultGateId,
  };
}

function assertNoNotificationLeak(payload: unknown): void {
  const forbiddenKeys = new Set([
    'schoolId',
    'organizationId',
    'membershipId',
    'roleId',
    'guardianId',
    'guardianUserId',
    'studentUserId',
    'applicationId',
    'enrollmentId',
    'requestedById',
    'recipientUserId',
    'actorUserId',
    'staffUserId',
    'handedOverById',
    'assignmentId',
    'eventId',
    'pickupCode',
    'pickupCodeHash',
    'pickupCodeSalt',
    'parentLatitude',
    'parentLongitude',
    'distanceMeters',
    'geofencePassed',
    'clientRequestId',
    'deletedAt',
    'metadata',
    'raw',
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
