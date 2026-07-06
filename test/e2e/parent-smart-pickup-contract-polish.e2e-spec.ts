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
const PASSWORD = 'ParentContractPolish123!';
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

describe('PARENT-DISMISSAL-1D smart pickup contract polish (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let organizationId: string;
  let schoolId: string;
  let parentUserId: string;
  let guardianId: string;
  let classroomId: string;
  let gateId: string;
  let parentToken: string;
  let activeChildId: string;
  let requestableChildId: string;
  let terminalChildId: string;
  let activeRequestId: string;
  const createdUserIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdOrganizationIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const parentRole = await prisma.role.findFirst({
      where: { key: 'parent', schoolId: null, isSystem: true },
      select: { id: true },
    });
    if (!parentRole) {
      throw new Error('parent system role not found - run `npm run seed`.');
    }

    const fixture = await createSchoolFixture();
    organizationId = fixture.organizationId;
    schoolId = fixture.schoolId;
    classroomId = (await createAcademicFixture()).classroomId;
    gateId = await createGate();

    const parent = await createUserWithMembership({
      email: `parent-contract-${TEST_RUN_ID}@moazez.local`,
      roleId: parentRole.id,
      userType: UserType.PARENT,
    });
    parentUserId = parent.userId;
    guardianId = await createGuardian(parentUserId);

    activeChildId = (
      await createStudentFixture({
        firstName: 'Active',
        lastName: 'Request',
      })
    ).studentId;
    requestableChildId = (
      await createStudentFixture({
        firstName: 'Ready',
        lastName: 'Create',
      })
    ).studentId;
    terminalChildId = (
      await createStudentFixture({
        firstName: 'Terminal',
        lastName: 'Delivered',
      })
    ).studentId;

    await configureSettings({ allowParentCancelBeforeCalled: true });
    activeRequestId = await createRequest({
      studentId: activeChildId,
      status: DismissalRequestStatus.QUEUED,
      pickupCodeIssuedAt: new Date('2026-07-06T09:00:00.000Z'),
    });
    await createRequest({
      studentId: terminalChildId,
      status: DismissalRequestStatus.HANDED_OVER,
      handedOverAt: new Date('2026-07-06T09:15:00.000Z'),
      handoverReceiverName: 'Hidden Receiver',
      handoverReceiverRelation: 'Hidden Relation',
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
  });

  afterAll(async () => {
    if (prisma && schoolId) {
      await prisma.auditLog.deleteMany({ where: { schoolId } });
      await prisma.dismissalRequestEvent.deleteMany({ where: { schoolId } });
      await prisma.dismissalRequest.deleteMany({ where: { schoolId } });
      await prisma.dismissalSettings.deleteMany({ where: { schoolId } });
      await prisma.dismissalGate.deleteMany({ where: { schoolId } });
      await prisma.studentGuardian.deleteMany({ where: { schoolId } });
      await prisma.enrollment.deleteMany({ where: { schoolId } });
      await prisma.guardian.deleteMany({ where: { schoolId } });
      await prisma.student.deleteMany({ where: { schoolId } });
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
    }
    if (prisma) await prisma.$disconnect().catch(() => undefined);
    if (app) await app.close();
  });

  it('returns polished readiness policy, child requestability, active request, and no leaks', async () => {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/smart-pickup`)
      .set('Authorization', `Bearer ${parentToken}`)
      .expect(200);

    expect(response.body.enabled).toBe(true);
    expect(response.body.school).toEqual({ name: `Contract School ${TEST_RUN_ID}` });
    expect(response.body.policy).toMatchObject({
      geofenceRequired: true,
      pickupCodeRequired: true,
      parentCancelBeforeCalledAllowed: true,
      delegatePickupAllowed: true,
      requestWindow: {
        start: '00:00',
        end: '23:59',
        timezone: TIMEZONE,
        isOpenNow: true,
      },
    });
    expect(response.body.policies).toMatchObject({
      requirePickupCode: true,
      allowParentCancelBeforeCalled: true,
    });

    const activeChild = childById(response.body.children, activeChildId);
    expect(activeChild).toMatchObject({
      canRequestPickup: false,
      blockedReason: 'active_request_exists',
      activeRequest: {
        id: activeRequestId,
        status: 'queued',
        isActive: true,
        isTerminal: false,
        canCancel: true,
        canTrack: true,
        gate: {
          id: gateId,
          code: `PCON-${TEST_RUN_ID}`,
          name: 'Parent Contract Gate',
        },
        pickup: {
          codeRequired: true,
          codeIssued: true,
          codeIssuedAt: '2026-07-06T09:00:00.000Z',
        },
      },
    });

    const requestableChild = childById(response.body.children, requestableChildId);
    expect(requestableChild).toMatchObject({
      canRequestPickup: true,
      blockedReason: null,
      activeRequest: null,
    });
    assertNoParentSmartPickupLeak(response.body);
  });

  it('returns polished creation response and keeps idempotent retry one-time-code safe', async () => {
    const first = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/smart-pickup/requests`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        childId: requestableChildId,
        gateId,
        latitude: SCHOOL_LATITUDE,
        longitude: SCHOOL_LONGITUDE,
        clientRequestId: `contract-${TEST_RUN_ID}`,
      })
      .expect(201);

    expect(first.body.request).toMatchObject({
      status: 'requested',
      isActive: true,
      isTerminal: false,
      canCancel: true,
      canTrack: true,
      pickup: {
        codeRequired: true,
        codeIssued: true,
        codeIssuedAt: expect.any(String),
        code: expect.stringMatching(/^\d{6}$/),
      },
    });
    expect(first.body.pickup).toMatchObject({
      codeRequired: true,
      codeIssued: true,
      pickupCode: expect.stringMatching(/^\d{6}$/),
    });
    assertNoParentSmartPickupLeak(first.body);

    const retry = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/smart-pickup/requests`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        childId: requestableChildId,
        gateId,
        latitude: SCHOOL_LATITUDE,
        longitude: SCHOOL_LONGITUDE,
        clientRequestId: `contract-${TEST_RUN_ID}`,
      })
      .expect(201);

    expect(retry.body.request.id).toBe(first.body.request.id);
    expect(retry.body.request.pickup).toMatchObject({
      codeRequired: true,
      codeIssued: true,
      codeIssuedAt: expect.any(String),
    });
    expect(retry.body.request.pickup).not.toHaveProperty('code');
    expect(retry.body.pickup).not.toHaveProperty('pickupCode');
    await expect(countEvents(first.body.request.id)).resolves.toBe(1);
  });

  it('returns polished recent calls, filters safely, and hides recipient internals', async () => {
    const list = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/smart-pickup/recent-calls`)
      .set('Authorization', `Bearer ${parentToken}`)
      .expect(200);

    expect(list.body.summary).toMatchObject({
      activeCount: 2,
      terminalCount: 1,
      canCancelCount: 2,
    });
    const queued = list.body.data.find(
      (item: { id: string }) => item.id === activeRequestId,
    );
    expect(queued).toMatchObject({
      status: 'queued',
      isActive: true,
      isTerminal: false,
      canCancel: true,
      canTrack: true,
      pickup: {
        codeRequired: true,
        codeIssued: true,
        codeIssuedAt: '2026-07-06T09:00:00.000Z',
      },
    });

    const handedOver = list.body.data.find(
      (item: { status: string }) => item.status === 'handed_over',
    );
    expect(handedOver).toMatchObject({
      isActive: false,
      isTerminal: true,
      canCancel: false,
      canTrack: false,
      handedOverAt: '2026-07-06T09:15:00.000Z',
    });
    expect(JSON.stringify(handedOver)).not.toContain('Hidden Receiver');
    expect(JSON.stringify(handedOver)).not.toContain('Hidden Relation');

    const activeOnly = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/smart-pickup/recent-calls`)
      .query({ activeOnly: 'true' })
      .set('Authorization', `Bearer ${parentToken}`)
      .expect(200);
    expect(activeOnly.body.data.every((item: { isActive: boolean }) => item.isActive))
      .toBe(true);

    const terminalFilter = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/smart-pickup/recent-calls`)
      .query({ status: 'handed_over' })
      .set('Authorization', `Bearer ${parentToken}`)
      .expect(200);
    expect(terminalFilter.body.data).toHaveLength(1);
    expect(terminalFilter.body.data[0].status).toBe('handed_over');

    const invalid = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/smart-pickup/recent-calls`)
      .query({ status: 'not_a_real_status' })
      .set('Authorization', `Bearer ${parentToken}`)
      .expect(422);
    expect(invalid.body?.error?.code).toBe(
      'parent.smart_pickup.invalid_status_filter',
    );
    assertNoParentSmartPickupLeak(list.body);
  });

  it('returns stable idempotent cancel response and rejects ownership spoofing fields', async () => {
    const created = await createStudentFixture({
      firstName: 'Cancel',
      lastName: 'Stable',
    });
    const requestId = await createRequest({
      studentId: created.studentId,
      status: DismissalRequestStatus.REQUESTED,
    });

    const cancel = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/smart-pickup/requests/${requestId}/cancel`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({ note: 'contract cancel' })
      .expect(201);
    expect(cancel.body.request).toMatchObject({
      id: requestId,
      status: 'cancelled',
      previousStatus: 'requested',
      changed: true,
      isActive: false,
      isTerminal: true,
      canCancel: false,
      canTrack: false,
      cancelledAt: expect.any(String),
    });

    const retry = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/smart-pickup/requests/${requestId}/cancel`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({})
      .expect(201);
    expect(retry.body.request).toMatchObject({
      id: requestId,
      status: 'cancelled',
      previousStatus: 'cancelled',
      changed: false,
      isActive: false,
      isTerminal: true,
      canCancel: false,
      canTrack: false,
    });
    await expect(countStatusChangeEvents(requestId)).resolves.toBe(1);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/smart-pickup/requests`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        childId: created.studentId,
        gateId,
        latitude: SCHOOL_LATITUDE,
        longitude: SCHOOL_LONGITUDE,
        schoolId,
        guardianId,
        requestedById: parentUserId,
        pickupRecipientToken: 'forbidden',
      })
      .expect(400);
    assertNoParentSmartPickupLeak(cancel.body);
  });

  async function configureSettings(params: {
    allowParentCancelBeforeCalled: boolean;
  }) {
    await prisma.dismissalSettings.upsert({
      where: { schoolId },
      create: {
        schoolId,
        enabled: true,
        timezone: TIMEZONE,
        schoolLatitude: SCHOOL_LATITUDE,
        schoolLongitude: SCHOOL_LONGITUDE,
        allowedRadiusMeters: 150,
        requestWindowStartLocal: '00:00',
        requestWindowEndLocal: '23:59',
        requirePickupCode: true,
        allowDelegatePickup: true,
        allowParentCancelBeforeCalled: params.allowParentCancelBeforeCalled,
        defaultGateId: gateId,
      },
      update: {
        enabled: true,
        timezone: TIMEZONE,
        schoolLatitude: SCHOOL_LATITUDE,
        schoolLongitude: SCHOOL_LONGITUDE,
        allowedRadiusMeters: 150,
        requestWindowStartLocal: '00:00',
        requestWindowEndLocal: '23:59',
        requirePickupCode: true,
        allowDelegatePickup: true,
        allowParentCancelBeforeCalled: params.allowParentCancelBeforeCalled,
        defaultGateId: gateId,
      },
    });
  }

  async function createRequest(params: {
    studentId: string;
    status: DismissalRequestStatus;
    pickupCodeIssuedAt?: Date | null;
    handedOverAt?: Date | null;
    handoverReceiverName?: string | null;
    handoverReceiverRelation?: string | null;
  }): Promise<string> {
    const enrollment = await prisma.enrollment.findFirstOrThrow({
      where: { studentId: params.studentId, schoolId },
      select: { id: true },
    });
    const requestRecord = await prisma.dismissalRequest.create({
      data: {
        schoolId,
        studentId: params.studentId,
        enrollmentId: enrollment.id,
        guardianId,
        requestedById: parentUserId,
        gateId,
        status: params.status,
        clientRequestId: null,
        parentLatitude: SCHOOL_LATITUDE,
        parentLongitude: SCHOOL_LONGITUDE,
        distanceMeters: 0,
        geofencePassed: true,
        pickupCodeHash: params.pickupCodeIssuedAt ? 'hidden-hash' : null,
        pickupCodeSalt: params.pickupCodeIssuedAt ? 'hidden-salt' : null,
        pickupCodeIssuedAt: params.pickupCodeIssuedAt ?? null,
        handedOverAt: params.handedOverAt ?? null,
        handoverReceiverName: params.handoverReceiverName ?? null,
        handoverReceiverRelation: params.handoverReceiverRelation ?? null,
        requestedAt: new Date('2026-07-06T08:55:00.000Z'),
      },
      select: { id: true },
    });
    await prisma.dismissalRequestEvent.create({
      data: {
        schoolId,
        requestId: requestRecord.id,
        type: DismissalRequestEventType.REQUEST_CREATED,
        actorUserId: parentUserId,
        statusFrom: null,
        statusTo: DismissalRequestStatus.REQUESTED,
        metadata: { source: 'test' },
      },
    });
    if (params.status !== DismissalRequestStatus.REQUESTED) {
      await prisma.dismissalRequestEvent.create({
        data: {
          schoolId,
          requestId: requestRecord.id,
          type: DismissalRequestEventType.REQUEST_STATUS_CHANGED,
          actorUserId: parentUserId,
          statusFrom: DismissalRequestStatus.REQUESTED,
          statusTo: params.status,
        },
      });
    }

    return requestRecord.id;
  }

  async function createSchoolFixture(): Promise<{
    organizationId: string;
    schoolId: string;
  }> {
    const organization = await prisma.organization.create({
      data: {
        slug: `parent-contract-${TEST_RUN_ID}-org`,
        name: `Parent Contract Org ${TEST_RUN_ID}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);

    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `parent-contract-${TEST_RUN_ID}-school`,
        name: `Parent Contract School ${TEST_RUN_ID}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdSchoolIds.push(school.id);

    await prisma.schoolProfile.create({
      data: {
        schoolId: school.id,
        schoolName: `Contract School ${TEST_RUN_ID}`,
        timezone: TIMEZONE,
        latitude: SCHOOL_LATITUDE,
        longitude: SCHOOL_LONGITUDE,
        mapPlaceLabel: 'Parent Contract Zone',
      },
    });

    return { organizationId: organization.id, schoolId: school.id };
  }

  async function createAcademicFixture(): Promise<{ classroomId: string }> {
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId,
        nameAr: `contract-year-${TEST_RUN_ID}-ar`,
        nameEn: `Contract Year ${TEST_RUN_ID}`,
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
        nameAr: `contract-term-${TEST_RUN_ID}-ar`,
        nameEn: `Contract Term ${TEST_RUN_ID}`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-01-31T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    const stage = await prisma.stage.create({
      data: {
        schoolId,
        nameAr: `contract-stage-${TEST_RUN_ID}-ar`,
        nameEn: `Contract Stage ${TEST_RUN_ID}`,
      },
      select: { id: true },
    });
    const grade = await prisma.grade.create({
      data: {
        schoolId,
        stageId: stage.id,
        nameAr: `contract-grade-${TEST_RUN_ID}-ar`,
        nameEn: `Contract Grade ${TEST_RUN_ID}`,
      },
      select: { id: true },
    });
    const section = await prisma.section.create({
      data: {
        schoolId,
        gradeId: grade.id,
        nameAr: `contract-section-${TEST_RUN_ID}-ar`,
        nameEn: `Contract Section ${TEST_RUN_ID}`,
      },
      select: { id: true },
    });
    const classroom = await prisma.classroom.create({
      data: {
        schoolId,
        sectionId: section.id,
        nameAr: `contract-classroom-${TEST_RUN_ID}-ar`,
        nameEn: `Contract Classroom ${TEST_RUN_ID}`,
      },
      select: { id: true },
    });

    return { classroomId: classroom.id };
  }

  async function createUserWithMembership(params: {
    email: string;
    roleId: string;
    userType: UserType;
  }): Promise<{ userId: string; email: string }> {
    const user = await prisma.user.create({
      data: {
        email: params.email,
        username: params.email,
        firstName: 'Parent',
        lastName: 'Contract',
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
        firstName: 'Parent',
        lastName: 'Guardian',
        relation: 'parent',
        phone: `${TEST_RUN_ID}-guardian`,
        isPrimary: true,
        canPickup: true,
        canReceiveNotifications: true,
      },
      select: { id: true },
    });
    return guardian.id;
  }

  async function createStudentFixture(params: {
    firstName: string;
    lastName: string;
  }): Promise<{ studentId: string; enrollmentId: string }> {
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
        firstName: params.firstName,
        lastName: params.lastName,
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

    return { studentId: student.id, enrollmentId: enrollment.id };
  }

  async function createGate(): Promise<string> {
    const gate = await prisma.dismissalGate.create({
      data: {
        schoolId,
        code: `PCON-${TEST_RUN_ID}`,
        name: 'Parent Contract Gate',
        status: DismissalGateOperationalStatus.OPEN,
        isActive: true,
        sortOrder: 1,
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

  async function countEvents(requestId: string): Promise<number> {
    return prisma.dismissalRequestEvent.count({ where: { requestId } });
  }

  async function countStatusChangeEvents(requestId: string): Promise<number> {
    return prisma.dismissalRequestEvent.count({
      where: {
        requestId,
        type: DismissalRequestEventType.REQUEST_STATUS_CHANGED,
      },
    });
  }
});

function childById(
  children: Array<{ id: string } & Record<string, unknown>>,
  id: string,
) {
  const child = children.find((item) => item.id === id);
  if (!child) throw new Error(`Expected child ${id} in readiness response`);
  return child;
}

function assertNoParentSmartPickupLeak(body: unknown): void {
  assertNoForbiddenKeys(body);
  expect(JSON.stringify(body)).not.toContain('pickupCodeHash');
  expect(JSON.stringify(body)).not.toContain('pickupCodeSalt');
  expect(JSON.stringify(body)).not.toContain('pickupRecipientToken');
  expect(JSON.stringify(body)).not.toContain('handoverReceiverName');
  expect(JSON.stringify(body)).not.toContain('handoverReceiverRelation');
}

function assertNoForbiddenKeys(body: unknown): void {
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
    'parentLatitude',
    'parentLongitude',
    'distanceMeters',
    'geofencePassed',
    'clientRequestId',
    'deletedAt',
    'assignmentId',
    'metadata',
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
