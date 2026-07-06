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
import { issuePickupCode } from '../../src/modules/dismissal/shared/pickup-code.service';

const GLOBAL_PREFIX = '/api/v1';
const PASSWORD = 'DismissalDeliveryE2E123!';
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

describe('DISMISSAL-DELIVERY-1A pickup code and handover (e2e)', () => {
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
  let adminToken: string;
  let staffGateToken: string;
  let staffClassroomToken: string;
  let staffNonMatchingToken: string;
  let staffExpiredToken: string;
  let parentToken: string;
  let parentAId: string;
  let parentBId: string;
  let guardianAId: string;
  let guardianBId: string;
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

    await createSchoolProfileFixture(schoolAId, SCHOOL_LATITUDE, SCHOOL_LONGITUDE);
    await createSchoolProfileFixture(schoolBId, 52.52, 13.405);

    const academicA = await createAcademicFixture('a', schoolAId);
    const academicB = await createAcademicFixture('b', schoolBId);
    classroomAId = academicA.classroomId;
    alternateClassroomAId = academicA.alternateClassroomId;
    classroomBId = academicB.classroomId;

    gateAId = await createGate({
      schoolId: schoolAId,
      code: `DEL-A-${TEST_RUN_ID}`,
      name: 'Delivery Main Gate',
      status: DismissalGateOperationalStatus.OPEN,
    });
    gateA2Id = await createGate({
      schoolId: schoolAId,
      code: `DEL-B-${TEST_RUN_ID}`,
      name: 'Delivery Side Gate',
      status: DismissalGateOperationalStatus.BUSY,
    });
    gateBId = await createGate({
      schoolId: schoolBId,
      code: `DEL-X-${TEST_RUN_ID}`,
      name: 'Delivery Cross Gate',
      status: DismissalGateOperationalStatus.OPEN,
    });

    const admin = await createUserWithMembership({
      email: `dismissal-delivery-${TEST_RUN_ID}-admin@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: schoolAdminRole.id,
      userType: UserType.SCHOOL_USER,
      firstName: 'Delivery',
      lastName: 'Admin',
    });
    const staffGate = await createUserWithMembership({
      email: `dismissal-delivery-${TEST_RUN_ID}-staff-gate@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
      firstName: 'Gate',
      lastName: 'Delivery',
    });
    const staffClassroom = await createUserWithMembership({
      email: `dismissal-delivery-${TEST_RUN_ID}-staff-class@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
      firstName: 'Classroom',
      lastName: 'Delivery',
    });
    const staffNonMatching = await createUserWithMembership({
      email: `dismissal-delivery-${TEST_RUN_ID}-staff-other@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
      firstName: 'Other',
      lastName: 'Delivery',
    });
    const staffExpired = await createUserWithMembership({
      email: `dismissal-delivery-${TEST_RUN_ID}-staff-expired@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
      firstName: 'Expired',
      lastName: 'Delivery',
    });
    const parentA = await createUserWithMembership({
      email: `dismissal-delivery-${TEST_RUN_ID}-parent-a@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: parentRole.id,
      userType: UserType.PARENT,
      firstName: 'Parent',
      lastName: 'Delivery A',
    });
    const parentB = await createUserWithMembership({
      email: `dismissal-delivery-${TEST_RUN_ID}-parent-b@moazez.local`,
      schoolId: schoolBId,
      organizationId: organizationBId,
      roleId: parentRole.id,
      userType: UserType.PARENT,
      firstName: 'Parent',
      lastName: 'Delivery B',
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

  it('issues pickup codes once through parent request creation when required', async () => {
    await configureSettings({ requirePickupCode: true, defaultGateId: gateAId });
    const child = await createOwnedActiveChild('code-required');
    const clientRequestId = `delivery-code-${TEST_RUN_ID}`;

    const first = await postPickupRequest({
      childId: child.studentId,
      gateId: gateAId,
      clientRequestId,
    }).expect(201);

    expect(first.body.pickup).toEqual({
      codeRequired: true,
      codeIssued: true,
      pickupCode: expect.stringMatching(/^\d{6}$/),
    });
    assertNoParentRequestLeak(first.body, { allowPickupCode: true });

    const stored = await prisma.dismissalRequest.findUniqueOrThrow({
      where: { id: first.body.request.id },
      select: {
        pickupCodeHash: true,
        pickupCodeSalt: true,
        pickupCodeIssuedAt: true,
      },
    });
    expect(stored.pickupCodeHash).toEqual(expect.any(String));
    expect(stored.pickupCodeSalt).toEqual(expect.any(String));
    expect(stored.pickupCodeIssuedAt).toBeInstanceOf(Date);
    expect(JSON.stringify(stored)).not.toContain(first.body.pickup.pickupCode);

    const retry = await postPickupRequest({
      childId: child.studentId,
      gateId: gateAId,
      clientRequestId,
    }).expect(201);
    expect(retry.body.request.id).toBe(first.body.request.id);
    expect(retry.body.pickup).toEqual({
      codeRequired: true,
      codeIssued: true,
    });
  });

  it('does not issue pickup codes when policy disables them', async () => {
    await configureSettings({ requirePickupCode: false, defaultGateId: gateAId });
    const child = await createOwnedActiveChild('code-disabled');

    const response = await postPickupRequest({
      childId: child.studentId,
      gateId: gateAId,
      clientRequestId: `delivery-no-code-${TEST_RUN_ID}`,
    }).expect(201);

    expect(response.body.pickup).toEqual({
      codeRequired: false,
      codeIssued: false,
    });
    expect(response.body.pickup.pickupCode).toBeUndefined();

    const stored = await prisma.dismissalRequest.findUniqueOrThrow({
      where: { id: response.body.request.id },
      select: {
        pickupCodeHash: true,
        pickupCodeSalt: true,
        pickupCodeIssuedAt: true,
      },
    });
    expect(stored).toEqual({
      pickupCodeHash: null,
      pickupCodeSalt: null,
      pickupCodeIssuedAt: null,
    });
  });

  it('lets school admin deliver READY request with a valid pickup code', async () => {
    await configureSettings({ requirePickupCode: true, defaultGateId: gateAId });
    const issued = issuePickupCode();
    const requestId = await createDismissalRequest({
      status: DismissalRequestStatus.READY,
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: classroomAId,
      gateId: gateAId,
      firstName: 'Ready',
      lastName: 'Deliver',
      pickupCodeHash: issued.hash,
      pickupCodeSalt: issued.salt,
      pickupCodeIssuedAt: issued.issuedAt,
    });

    const pickupRecipientToken = await getPickupRecipientToken(adminToken, requestId);
    const response = await deliver(adminToken, requestId, {
      pickupCode: issued.code,
      pickupRecipientToken,
      note: '  Delivered at main gate  ',
    }).expect(201);

    expect(response.body.delivery).toEqual(
      expect.objectContaining({
        id: requestId,
        status: 'handed_over',
        previousStatus: 'ready',
        handedOverAt: expect.any(String),
        pickupCodeVerified: true,
        pickupRecipientVerified: true,
        receiver: {
          name: 'Delivery Guardian a',
          relation: 'guardian',
          verified: true,
          source: 'guardian_link',
        },
      }),
    );
    expect(response.body.delivery.pickupCode).toBeUndefined();
    assertNoDeliveryLeak(response.body);

    const stored = await prisma.dismissalRequest.findUniqueOrThrow({
      where: { id: requestId },
      select: {
        status: true,
        handedOverAt: true,
        handedOverById: true,
        pickupCodeVerifiedAt: true,
        handoverReceiverName: true,
        handoverReceiverRelation: true,
        handoverNote: true,
      },
    });
    expect(stored.status).toBe(DismissalRequestStatus.HANDED_OVER);
    expect(stored.handedOverAt).toBeInstanceOf(Date);
    expect(stored.handedOverById).toEqual(expect.any(String));
    expect(stored.pickupCodeVerifiedAt).toBeInstanceOf(Date);
    expect(stored.handoverReceiverName).toBe('Delivery Guardian a');
    expect(stored.handoverReceiverRelation).toBe('guardian');
    expect(stored.handoverNote).toBe('Delivered at main gate');

    const event = await prisma.dismissalRequestEvent.findFirstOrThrow({
      where: {
        requestId,
        type: DismissalRequestEventType.REQUEST_STATUS_CHANGED,
      },
      select: { statusFrom: true, statusTo: true, note: true, metadata: true },
    });
    expect(event).toEqual({
      statusFrom: DismissalRequestStatus.READY,
      statusTo: DismissalRequestStatus.HANDED_OVER,
      note: 'Delivered at main gate',
      metadata: {
        pickupRecipientVerified: true,
        pickupRecipientSource: 'guardian_link',
      },
    });

    const audit = await prisma.auditLog.findFirst({
      where: {
        schoolId: schoolAId,
        action: 'dismissal.request.delivered',
        resourceId: requestId,
        outcome: AuditOutcome.SUCCESS,
      },
      select: { before: true, after: true },
    });
    expect(audit).toEqual(
      expect.objectContaining({
        before: expect.objectContaining({ status: 'READY' }),
        after: expect.objectContaining({
          status: 'HANDED_OVER',
          pickupCodeVerified: true,
          pickupRecipientVerified: true,
          pickupRecipientSource: 'guardian_link',
          note: true,
        }),
      }),
    );

    await expectDeliveredRequestHidden(requestId);
  });

  it('lets school admin deliver without pickup code when policy disables it', async () => {
    await configureSettings({ requirePickupCode: false, defaultGateId: gateAId });
    const requestId = await createDismissalRequest({
      status: DismissalRequestStatus.READY,
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: classroomAId,
      gateId: gateAId,
      firstName: 'NoCode',
      lastName: 'Deliver',
    });

    const response = await deliverWithRecipient(adminToken, requestId);
    expect(response.body.delivery).toEqual(
      expect.objectContaining({
        id: requestId,
        status: 'handed_over',
        pickupCodeVerified: false,
        pickupRecipientVerified: true,
      }),
    );

    const stored = await prisma.dismissalRequest.findUniqueOrThrow({
      where: { id: requestId },
      select: { status: true, pickupCodeVerifiedAt: true },
    });
    expect(stored.status).toBe(DismissalRequestStatus.HANDED_OVER);
    expect(stored.pickupCodeVerifiedAt).toBeNull();
  });

  it('rejects pickup code failures without status or event writes', async () => {
    await configureSettings({ requirePickupCode: true, defaultGateId: gateAId });
    const issued = issuePickupCode();
    const missingId = await createReadyWithPickupCode(issued);
    await expectFailedDelivery({
      requestId: missingId,
      body: {},
      expectedStatus: 422,
      expectedCode: 'dismissal.delivery.pickup_code_required',
    });

    const invalidFormatId = await createReadyWithPickupCode(issuePickupCode());
    await expectFailedDelivery({
      requestId: invalidFormatId,
      body: { pickupCode: '12ab' },
      expectedStatus: 422,
      expectedCode: 'dismissal.delivery.invalid_pickup_code',
    });

    const incorrectId = await createReadyWithPickupCode(issuePickupCode());
    await expectFailedDelivery({
      requestId: incorrectId,
      body: { pickupCode: '000000' },
      expectedStatus: 422,
      expectedCode: 'dismissal.delivery.invalid_pickup_code',
    });

    const notIssuedId = await createDismissalRequest({
      status: DismissalRequestStatus.READY,
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: classroomAId,
      gateId: gateAId,
      firstName: 'Missing',
      lastName: 'Code',
    });
    await expectFailedDelivery({
      requestId: notIssuedId,
      body: { pickupCode: '123456' },
      expectedStatus: 409,
      expectedCode: 'dismissal.delivery.pickup_code_not_issued',
    });
  });

  it('rejects non-ready, terminal, deleted, cross-school, and already delivered requests', async () => {
    await configureSettings({ requirePickupCode: false, defaultGateId: gateAId });

    for (const status of [
      DismissalRequestStatus.REQUESTED,
      DismissalRequestStatus.QUEUED,
      DismissalRequestStatus.CALLED,
      DismissalRequestStatus.MOVING,
      DismissalRequestStatus.AT_GATE,
    ]) {
      const requestId = await createDismissalRequest({
        status,
        schoolId: schoolAId,
        organizationId: organizationAId,
        guardianId: guardianAId,
        requestedById: parentAId,
        classroomId: classroomAId,
        gateId: gateAId,
        firstName: `NotReady${status}`,
        lastName: 'Deliver',
      });
      await expectFailedDelivery({
        requestId,
        body: {},
        expectedStatus: 409,
        expectedCode: 'dismissal.delivery.not_ready',
        expectedPersistedStatus: status,
      });
    }

    const deliveredId = await createDismissalRequest({
      status: DismissalRequestStatus.HANDED_OVER,
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: classroomAId,
      gateId: gateAId,
      firstName: 'Already',
      lastName: 'Delivered',
    });
    await expectFailedDelivery({
      requestId: deliveredId,
      body: {},
      expectedStatus: 409,
      expectedCode: 'dismissal.delivery.already_delivered',
      expectedPersistedStatus: DismissalRequestStatus.HANDED_OVER,
    });

    for (const status of [
      DismissalRequestStatus.CANCELLED,
      DismissalRequestStatus.EXPIRED,
    ]) {
      const requestId = await createDismissalRequest({
        status,
        schoolId: schoolAId,
        organizationId: organizationAId,
        guardianId: guardianAId,
        requestedById: parentAId,
        classroomId: classroomAId,
        gateId: gateAId,
        firstName: `Safe${status}`,
        lastName: 'Terminal',
      });
      const response = await deliver(adminToken, requestId, {}).expect(404);
      expect(response.body?.error?.code).toBe('dismissal.delivery.not_found');
    }

    const deletedId = await createDismissalRequest({
      status: DismissalRequestStatus.READY,
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: classroomAId,
      gateId: gateAId,
      firstName: 'Deleted',
      lastName: 'Delivery',
      deletedAt: new Date(),
    });
    const crossSchoolId = await createDismissalRequest({
      status: DismissalRequestStatus.READY,
      schoolId: schoolBId,
      organizationId: organizationBId,
      guardianId: guardianBId,
      requestedById: parentBId,
      classroomId: classroomBId,
      gateId: gateBId,
      firstName: 'Cross',
      lastName: 'Delivery',
    });

    for (const requestId of [deletedId, crossSchoolId]) {
      const response = await deliver(adminToken, requestId, {}).expect(404);
      expect(response.body?.error?.code).toBe('dismissal.delivery.not_found');
    }
  });

  it('keeps PATCH status, active queue, detail, and waiting arrival behavior consistent after delivery', async () => {
    await configureSettings({ requirePickupCode: false, defaultGateId: gateAId });
    const requestId = await createDismissalRequest({
      status: DismissalRequestStatus.READY,
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: classroomAId,
      gateId: gateAId,
      firstName: 'Regression',
      lastName: 'Delivery',
    });

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/requests/${requestId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'handed_over' })
      .expect(409);

    await deliverWithRecipient(adminToken, requestId);
    await expectDeliveredRequestHidden(requestId);

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/requests/${requestId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'ready' })
      .expect(404);
  });

  it('assignment-scopes delivery for DISMISSAL_STAFF and forbids parents', async () => {
    await configureSettings({ requirePickupCode: false, defaultGateId: gateAId });
    const gateVisibleId = await createDismissalRequest({
      status: DismissalRequestStatus.READY,
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: classroomAId,
      gateId: gateAId,
      firstName: 'Gate',
      lastName: 'Visible',
    });
    const classroomVisibleId = await createDismissalRequest({
      status: DismissalRequestStatus.READY,
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: classroomAId,
      gateId: gateA2Id,
      firstName: 'Classroom',
      lastName: 'Visible',
    });
    const hiddenId = await createDismissalRequest({
      status: DismissalRequestStatus.READY,
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: alternateClassroomAId,
      gateId: gateA2Id,
      firstName: 'Hidden',
      lastName: 'Assignment',
    });
    const expiredHiddenId = await createDismissalRequest({
      status: DismissalRequestStatus.READY,
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: classroomAId,
      gateId: gateAId,
      firstName: 'Expired',
      lastName: 'Assignment',
    });

    await deliverWithRecipient(staffGateToken, gateVisibleId);
    await deliverWithRecipient(staffClassroomToken, classroomVisibleId);

    for (const [token, requestId] of [
      [staffNonMatchingToken, hiddenId],
      [staffExpiredToken, expiredHiddenId],
    ]) {
      const response = await deliver(token, requestId, {}).expect(404);
      expect(response.body?.error?.code).toBe('dismissal.delivery.not_found');
      await expect(getRequestStatus(requestId)).resolves.toBe(
        DismissalRequestStatus.READY,
      );
    }

    await deliver(parentToken, hiddenId, {}).expect(403);
  });

  function postPickupRequest(params: {
    childId: string;
    gateId: string;
    clientRequestId: string;
  }) {
    return request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/smart-pickup/requests`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        childId: params.childId,
        latitude: SCHOOL_LATITUDE,
        longitude: SCHOOL_LONGITUDE,
        gateId: params.gateId,
        clientRequestId: params.clientRequestId,
      });
  }

  function deliver(
    token: string,
    requestId: string,
    body: Record<string, unknown>,
  ) {
    return request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/requests/${requestId}/deliver`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  async function deliverWithRecipient(
    token: string,
    requestId: string,
    body: Record<string, unknown> = {},
  ) {
    return deliver(token, requestId, {
      ...body,
      pickupRecipientToken: await getPickupRecipientToken(token, requestId),
    }).expect(201);
  }

  async function getPickupRecipientToken(
    token: string,
    requestId: string,
    index = 0,
  ): Promise<string> {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/${requestId}/pickup-recipients`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    assertNoPickupRecipientsLeak(response.body);
    expect(response.body.recipients[index]?.pickupRecipientToken).toEqual(
      expect.any(String),
    );
    return response.body.recipients[index].pickupRecipientToken as string;
  }

  async function expectDeliveredRequestHidden(requestId: string) {
    const active = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/active`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(active.body.data.map((item: { id: string }) => item.id)).not.toContain(
      requestId,
    );

    const waiting = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/waiting-students`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(waiting.body.data.map((item: { id: string }) => item.id)).not.toContain(
      requestId,
    );

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/requests/${requestId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/waiting-students/${requestId}/arrival`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(404);
  }

  async function expectFailedDelivery(params: {
    requestId: string;
    body: Record<string, unknown>;
    expectedStatus: number;
    expectedCode: string;
    expectedPersistedStatus?: DismissalRequestStatus;
  }) {
    const eventsBefore = await countStatusChangeEvents(params.requestId);
    const response = await deliver(
      adminToken,
      params.requestId,
      params.body,
    ).expect(params.expectedStatus);
    expect(response.body?.error?.code).toBe(params.expectedCode);
    await expect(countStatusChangeEvents(params.requestId)).resolves.toBe(
      eventsBefore,
    );

    const persisted = await prisma.dismissalRequest.findUnique({
      where: { id: params.requestId },
      select: { status: true, handedOverAt: true },
    });
    expect(persisted?.status).toBe(
      params.expectedPersistedStatus ?? DismissalRequestStatus.READY,
    );
    if (params.expectedPersistedStatus !== DismissalRequestStatus.HANDED_OVER) {
      expect(persisted?.handedOverAt).toBeNull();
    }
  }

  async function createReadyWithPickupCode(
    issued: ReturnType<typeof issuePickupCode>,
  ): Promise<string> {
    return createDismissalRequest({
      status: DismissalRequestStatus.READY,
      schoolId: schoolAId,
      organizationId: organizationAId,
      guardianId: guardianAId,
      requestedById: parentAId,
      classroomId: classroomAId,
      gateId: gateAId,
      firstName: 'Pickup',
      lastName: 'Code',
      pickupCodeHash: issued.hash,
      pickupCodeSalt: issued.salt,
      pickupCodeIssuedAt: issued.issuedAt,
    });
  }

  async function countStatusChangeEvents(requestId: string): Promise<number> {
    return prisma.dismissalRequestEvent.count({
      where: {
        requestId,
        type: DismissalRequestEventType.REQUEST_STATUS_CHANGED,
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

  async function configureSettings(params: {
    requirePickupCode: boolean;
    defaultGateId: string | null;
  }) {
    const nowMinutes = currentLocalMinutes(TIMEZONE);
    await prisma.dismissalSettings.upsert({
      where: { schoolId: schoolAId },
      create: {
        schoolId: schoolAId,
        enabled: true,
        timezone: TIMEZONE,
        schoolLatitude: SCHOOL_LATITUDE,
        schoolLongitude: SCHOOL_LONGITUDE,
        allowedRadiusMeters: 150,
        requestWindowStartLocal: minutesToTime(nowMinutes - 30),
        requestWindowEndLocal: minutesToTime(nowMinutes + 30),
        requirePickupCode: params.requirePickupCode,
        allowParentCancelBeforeCalled: true,
        defaultGateId: params.defaultGateId,
      },
      update: {
        enabled: true,
        timezone: TIMEZONE,
        schoolLatitude: SCHOOL_LATITUDE,
        schoolLongitude: SCHOOL_LONGITUDE,
        allowedRadiusMeters: 150,
        requestWindowStartLocal: minutesToTime(nowMinutes - 30),
        requestWindowEndLocal: minutesToTime(nowMinutes + 30),
        requirePickupCode: params.requirePickupCode,
        allowParentCancelBeforeCalled: true,
        defaultGateId: params.defaultGateId,
      },
    });
  }

  async function createOwnedActiveChild(marker: string) {
    return createStudentFixture({
      schoolId: schoolAId,
      organizationId: organizationAId,
      classroomId: classroomAId,
      firstName: 'Delivery',
      lastName: marker,
      status: StudentStatus.ACTIVE,
      guardianId: guardianAId,
    });
  }

  async function createSchoolFixture(label: string): Promise<{
    organizationId: string;
    schoolId: string;
  }> {
    const organization = await prisma.organization.create({
      data: {
        slug: `dismissal-delivery-${TEST_RUN_ID}-org-${label}`,
        name: `Dismissal Delivery Org ${label}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);

    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `dismissal-delivery-${TEST_RUN_ID}-school-${label}`,
        name: `Dismissal Delivery School ${label}`,
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
        mapPlaceLabel: 'Delivery Test Zone',
      },
    });
  }

  async function createAcademicFixture(label: string, schoolId: string) {
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId,
        nameAr: `delivery-year-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Delivery Year ${label}`,
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
        nameAr: `delivery-term-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Delivery Term ${label}`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-01-15T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    const stage = await prisma.stage.create({
      data: {
        schoolId,
        nameAr: `delivery-stage-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Delivery Stage ${label}`,
      },
      select: { id: true },
    });
    const grade = await prisma.grade.create({
      data: {
        schoolId,
        stageId: stage.id,
        nameAr: `delivery-grade-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Delivery Grade ${label}`,
      },
      select: { id: true },
    });
    const section = await prisma.section.create({
      data: {
        schoolId,
        gradeId: grade.id,
        nameAr: `delivery-section-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Delivery Section ${label}`,
      },
      select: { id: true },
    });
    const alternateSection = await prisma.section.create({
      data: {
        schoolId,
        gradeId: grade.id,
        nameAr: `delivery-section-alt-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Delivery Section Alt ${label}`,
      },
      select: { id: true },
    });
    const classroom = await prisma.classroom.create({
      data: {
        schoolId,
        sectionId: section.id,
        nameAr: `delivery-classroom-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Delivery Classroom ${label}`,
      },
      select: { id: true },
    });
    const alternateClassroom = await prisma.classroom.create({
      data: {
        schoolId,
        sectionId: alternateSection.id,
        nameAr: `delivery-classroom-alt-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Delivery Classroom Alt ${label}`,
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
        firstName: 'Delivery',
        lastName: `Guardian ${params.marker}`,
        relation: 'guardian',
        phone: `0102000${params.marker === 'a' ? '1' : '2'}`,
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
    firstName: string;
    lastName: string;
    status: StudentStatus;
    guardianId: string;
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
        status: params.status,
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

  async function createDismissalRequest(params: {
    status: DismissalRequestStatus;
    schoolId: string;
    organizationId: string;
    guardianId: string;
    requestedById: string;
    classroomId: string;
    gateId: string;
    firstName: string;
    lastName: string;
    deletedAt?: Date | null;
    pickupCodeHash?: string | null;
    pickupCodeSalt?: string | null;
    pickupCodeIssuedAt?: Date | null;
  }): Promise<string> {
    const student = await createStudentFixture({
      schoolId: params.schoolId,
      organizationId: params.organizationId,
      classroomId: params.classroomId,
      firstName: params.firstName,
      lastName: params.lastName,
      status: StudentStatus.ACTIVE,
      guardianId: params.guardianId,
    });
    const dismissalRequest = await prisma.dismissalRequest.create({
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
        pickupCodeHash: params.pickupCodeHash ?? null,
        pickupCodeSalt: params.pickupCodeSalt ?? null,
        pickupCodeIssuedAt: params.pickupCodeIssuedAt ?? null,
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

function currentLocalMinutes(timezone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value]),
  );

  return Number(parts.hour) * 60 + Number(parts.minute);
}

function minutesToTime(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;

  return `${hour.toString().padStart(2, '0')}:${minute
    .toString()
    .padStart(2, '0')}`;
}

function assertNoParentRequestLeak(
  body: unknown,
  options: { allowPickupCode: boolean },
): void {
  assertNoForbiddenKeys(body);
  if (!options.allowPickupCode) {
    expect(JSON.stringify(body)).not.toContain('pickupCode');
  }
  expect(JSON.stringify(body)).not.toContain('pickupCodeHash');
  expect(JSON.stringify(body)).not.toContain('pickupCodeSalt');
}

function assertNoDeliveryLeak(body: unknown): void {
  assertNoForbiddenKeys(body);
  assertNoExactKey(body, 'pickupCode');
  assertNoExactKey(body, 'pickupRecipientToken');
  expect(JSON.stringify(body)).not.toContain('pickupCodeHash');
  expect(JSON.stringify(body)).not.toContain('pickupCodeSalt');
}

function assertNoPickupRecipientsLeak(body: unknown): void {
  assertNoForbiddenKeys(body);
  expect(JSON.stringify(body)).not.toContain('0102000');
  expect(JSON.stringify(body)).not.toContain('guardian.userId');
}

function assertNoForbiddenKeys(body: unknown): void {
  const forbiddenKeys = new Set([
    'schoolId',
    'organizationId',
    'membershipId',
    'roleId',
    'guardianId',
    'studentGuardianId',
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
