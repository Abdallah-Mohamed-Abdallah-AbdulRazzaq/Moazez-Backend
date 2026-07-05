import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  DismissalGateOperationalStatus,
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
const PASSWORD = 'ParentPickupRequest123!';
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

describe('PARENT-DISMISSAL-1B pickup request creation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let organizationAId: string;
  let organizationBId: string;
  let schoolAId: string;
  let schoolBId: string;
  let parentUserId: string;
  let parentToken: string;
  let pickupGuardianId: string;
  let deniedGuardianId: string;
  let academicYearAId: string;
  let termAId: string;
  let classroomAId: string;
  let academicYearBId: string;
  let termBId: string;
  let classroomBId: string;
  let openGateId: string;
  let busyGateId: string;
  let closedGateId: string;
  let maintenanceGateId: string;
  let inactiveGateId: string;
  let crossSchoolGateId: string;
  let crossSchoolChildId: string;
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

    const fixtureA = await createSchoolFixture('a');
    const fixtureB = await createSchoolFixture('b');
    organizationAId = fixtureA.organizationId;
    organizationBId = fixtureB.organizationId;
    schoolAId = fixtureA.schoolId;
    schoolBId = fixtureB.schoolId;

    await createSchoolProfileFixture(schoolAId, SCHOOL_LATITUDE, SCHOOL_LONGITUDE);
    await createSchoolProfileFixture(schoolBId, 52.52, 13.405);

    const academicA = await createAcademicFixture('a', schoolAId);
    academicYearAId = academicA.academicYearId;
    termAId = academicA.termId;
    classroomAId = academicA.classroomId;
    const academicB = await createAcademicFixture('b', schoolBId);
    academicYearBId = academicB.academicYearId;
    termBId = academicB.termId;
    classroomBId = academicB.classroomId;

    const parent = await createUserWithMembership({
      email: `parent-request-${TEST_RUN_ID}@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: parentRole.id,
      userType: UserType.PARENT,
    });
    parentUserId = parent.userId;

    pickupGuardianId = await createGuardian({
      schoolId: schoolAId,
      organizationId: organizationAId,
      userId: parentUserId,
      marker: 'pickup',
      canPickup: true,
    });
    deniedGuardianId = await createGuardian({
      schoolId: schoolAId,
      organizationId: organizationAId,
      userId: parentUserId,
      marker: 'denied',
      canPickup: false,
    });

    const crossSchoolGuardianId = await createGuardian({
      schoolId: schoolBId,
      organizationId: organizationBId,
      userId: parentUserId,
      marker: 'cross',
      canPickup: true,
    });
    const crossChild = await createStudentFixture({
      schoolId: schoolBId,
      organizationId: organizationBId,
      academicYearId: academicYearBId,
      termId: termBId,
      classroomId: classroomBId,
      firstName: 'Cross',
      lastName: 'Hidden',
      status: StudentStatus.ACTIVE,
      createEnrollment: true,
      guardianId: crossSchoolGuardianId,
    });
    crossSchoolChildId = crossChild.studentId;

    openGateId = await createGate({
      schoolId: schoolAId,
      code: `OPEN-${TEST_RUN_ID}`,
      name: 'Open Request Gate',
      status: DismissalGateOperationalStatus.OPEN,
      isActive: true,
      sortOrder: 1,
    });
    busyGateId = await createGate({
      schoolId: schoolAId,
      code: `BUSY-${TEST_RUN_ID}`,
      name: 'Busy Request Gate',
      status: DismissalGateOperationalStatus.BUSY,
      isActive: true,
      sortOrder: 2,
    });
    closedGateId = await createGate({
      schoolId: schoolAId,
      code: `CLOSED-${TEST_RUN_ID}`,
      name: 'Closed Request Gate',
      status: DismissalGateOperationalStatus.CLOSED,
      isActive: true,
      sortOrder: 3,
    });
    maintenanceGateId = await createGate({
      schoolId: schoolAId,
      code: `MAINT-${TEST_RUN_ID}`,
      name: 'Maintenance Request Gate',
      status: DismissalGateOperationalStatus.MAINTENANCE,
      isActive: true,
      sortOrder: 4,
    });
    inactiveGateId = await createGate({
      schoolId: schoolAId,
      code: `INACTIVE-${TEST_RUN_ID}`,
      name: 'Inactive Request Gate',
      status: DismissalGateOperationalStatus.OPEN,
      isActive: false,
      sortOrder: 5,
    });
    crossSchoolGateId = await createGate({
      schoolId: schoolBId,
      code: `CROSS-${TEST_RUN_ID}`,
      name: 'Cross Request Gate',
      status: DismissalGateOperationalStatus.OPEN,
      isActive: true,
      sortOrder: 1,
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

  beforeEach(async () => {
    await resetRequestState();
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
      await prisma.guardian.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.student.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.classroom.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.section.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.grade.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.stage.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.term.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.academicYear.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.schoolProfile.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.auditLog.deleteMany({
        where: { module: 'dismissal', schoolId: { in: schoolIds } },
      });
      await prisma.session.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.membership.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
      await prisma.school.deleteMany({
        where: { id: { in: createdSchoolIds } },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: createdOrganizationIds } },
      });
      await prisma.$disconnect();
    }
    if (app) await app.close();
  });

  it('creates REQUESTED request, REQUEST_CREATED event, and audit for an owned child', async () => {
    await configureSettings({ defaultGateId: openGateId });
    const child = await createOwnedActiveChild('create');

    const response = await postPickupRequest({
      childId: child.studentId,
      gateId: openGateId,
      clientRequestId: ' create-request-1 ',
    }).expect(201);

    expect(response.body.request).toMatchObject({
      id: expect.any(String),
      status: 'requested',
      requestedAt: expect.any(String),
      child: {
        id: child.studentId,
        displayName: 'Pickup create',
        grade: 'Grade A',
        section: 'Section A',
        classroom: 'Classroom A',
      },
      gate: {
        id: openGateId,
        code: `OPEN-${TEST_RUN_ID}`,
        name: 'Open Request Gate',
        status: 'open',
      },
      policies: {
        requirePickupCode: true,
        allowParentCancelBeforeCalled: true,
      },
    });
    assertNoRequestLeak(response.body);

    const stored = await prisma.dismissalRequest.findUniqueOrThrow({
      where: { id: response.body.request.id },
      select: {
        schoolId: true,
        studentId: true,
        enrollmentId: true,
        guardianId: true,
        requestedById: true,
        gateId: true,
        status: true,
        clientRequestId: true,
        parentLatitude: true,
        parentLongitude: true,
        distanceMeters: true,
        geofencePassed: true,
      },
    });
    expect(stored).toMatchObject({
      schoolId: schoolAId,
      studentId: child.studentId,
      enrollmentId: child.enrollmentId,
      guardianId: pickupGuardianId,
      requestedById: parentUserId,
      gateId: openGateId,
      status: DismissalRequestStatus.REQUESTED,
      clientRequestId: 'create-request-1',
      geofencePassed: true,
    });
    expect(stored.parentLatitude.toNumber()).toBe(SCHOOL_LATITUDE);
    expect(stored.parentLongitude.toNumber()).toBe(SCHOOL_LONGITUDE);
    expect(stored.distanceMeters).toBe(0);

    const events = await prisma.dismissalRequestEvent.findMany({
      where: { requestId: response.body.request.id },
      select: {
        schoolId: true,
        type: true,
        actorUserId: true,
        statusFrom: true,
        statusTo: true,
        metadata: true,
      },
    });
    expect(events).toEqual([
      {
        schoolId: schoolAId,
        type: 'REQUEST_CREATED',
        actorUserId: parentUserId,
        statusFrom: null,
        statusTo: DismissalRequestStatus.REQUESTED,
        metadata: { source: 'parent_smart_pickup', geofencePassed: true },
      },
    ]);

    const audit = await prisma.auditLog.findFirst({
      where: {
        module: 'dismissal',
        action: 'dismissal.request.created',
        resourceId: response.body.request.id,
      },
      select: { outcome: true, actorId: true, schoolId: true },
    });
    expect(audit).toEqual({
      outcome: 'SUCCESS',
      actorId: parentUserId,
      schoolId: schoolAId,
    });
  });

  it('uses default gate when omitted and the default gate is available', async () => {
    await configureSettings({ defaultGateId: busyGateId });
    const child = await createOwnedActiveChild('default');

    const response = await postPickupRequest({
      childId: child.studentId,
      gateId: undefined,
    }).expect(201);

    expect(response.body.request.gate).toMatchObject({
      id: busyGateId,
      status: 'busy',
    });
  });

  it('uses the only available gate when no default gate is configured', async () => {
    await prisma.dismissalGate.update({
      where: { id: busyGateId },
      data: { isActive: false },
    });
    await configureSettings({ defaultGateId: null });
    const child = await createOwnedActiveChild('only-gate');

    const response = await postPickupRequest({
      childId: child.studentId,
      gateId: undefined,
    }).expect(201);

    expect(response.body.request.gate.id).toBe(openGateId);
  });

  it('rejects omitted gate when multiple available gates exist and no default is configured', async () => {
    await configureSettings({ defaultGateId: null });
    const child = await createOwnedActiveChild('gate-required');

    const response = await postPickupRequest({
      childId: child.studentId,
      gateId: undefined,
    }).expect(422);

    expect(response.body?.error?.code).toBe('dismissal.request.gate_required');
    await expectRequestCounts({ requests: 0, events: 0 });
  });

  it('rejects unowned and cross-school child ids with safe 404', async () => {
    await configureSettings({ defaultGateId: openGateId });
    const unowned = await createStudentFixture({
      schoolId: schoolAId,
      organizationId: organizationAId,
      academicYearId: academicYearAId,
      termId: termAId,
      classroomId: classroomAId,
      firstName: 'Unowned',
      lastName: 'Child',
      status: StudentStatus.ACTIVE,
      createEnrollment: true,
      guardianId: null,
    });

    for (const childId of [unowned.studentId, crossSchoolChildId]) {
      const response = await postPickupRequest({
        childId,
        gateId: openGateId,
      }).expect(404);
      expect(response.body?.error?.code).toBe(
        'dismissal.request.student_not_owned',
      );
    }
    await expectRequestCounts({ requests: 0, events: 0 });
  });

  it('rejects child without active enrollment, inactive student, and canPickup=false guardian', async () => {
    await configureSettings({ defaultGateId: openGateId });
    const noEnrollment = await createStudentFixture({
      schoolId: schoolAId,
      organizationId: organizationAId,
      academicYearId: academicYearAId,
      termId: termAId,
      classroomId: classroomAId,
      firstName: 'No',
      lastName: 'Enrollment',
      status: StudentStatus.ACTIVE,
      createEnrollment: false,
      guardianId: pickupGuardianId,
    });
    const inactive = await createStudentFixture({
      schoolId: schoolAId,
      organizationId: organizationAId,
      academicYearId: academicYearAId,
      termId: termAId,
      classroomId: classroomAId,
      firstName: 'Inactive',
      lastName: 'Student',
      status: StudentStatus.SUSPENDED,
      createEnrollment: true,
      guardianId: pickupGuardianId,
    });
    const denied = await createStudentFixture({
      schoolId: schoolAId,
      organizationId: organizationAId,
      academicYearId: academicYearAId,
      termId: termAId,
      classroomId: classroomAId,
      firstName: 'Denied',
      lastName: 'Pickup',
      status: StudentStatus.ACTIVE,
      createEnrollment: true,
      guardianId: deniedGuardianId,
    });

    const noEnrollmentResponse = await postPickupRequest({
      childId: noEnrollment.studentId,
      gateId: openGateId,
    }).expect(404);
    expect(noEnrollmentResponse.body?.error?.code).toBe(
      'dismissal.request.no_active_enrollment',
    );

    const inactiveResponse = await postPickupRequest({
      childId: inactive.studentId,
      gateId: openGateId,
    }).expect(409);
    expect(inactiveResponse.body?.error?.code).toBe(
      'dismissal.request.student_not_active',
    );

    const deniedResponse = await postPickupRequest({
      childId: denied.studentId,
      gateId: openGateId,
    }).expect(403);
    expect(deniedResponse.body?.error?.code).toBe(
      'dismissal.request.guardian_not_allowed',
    );
    await expectRequestCounts({ requests: 0, events: 0 });
  });

  it('rejects missing or disabled dismissal settings', async () => {
    const child = await createOwnedActiveChild('settings');

    const missing = await postPickupRequest({
      childId: child.studentId,
      gateId: openGateId,
    }).expect(409);
    expect(missing.body?.error?.code).toBe('dismissal.settings.disabled');

    await configureSettings({ enabled: false, defaultGateId: openGateId });
    const disabled = await postPickupRequest({
      childId: child.studentId,
      gateId: openGateId,
    }).expect(409);
    expect(disabled.body?.error?.code).toBe('dismissal.settings.disabled');
    await expectRequestCounts({ requests: 0, events: 0 });
  });

  it('rejects missing zone coordinates, closed windows, invalid coordinates, and outside geofence', async () => {
    const child = await createOwnedActiveChild('zone');

    await prisma.schoolProfile.update({
      where: { schoolId: schoolAId },
      data: { latitude: null, longitude: null },
    });
    await configureSettings({
      defaultGateId: openGateId,
      schoolLatitude: null,
      schoolLongitude: null,
    });
    const noCoordinates = await postPickupRequest({
      childId: child.studentId,
      gateId: openGateId,
    }).expect(422);
    expect(noCoordinates.body?.error?.code).toBe(
      'dismissal.settings.coordinates_required',
    );

    const closedWindow = closedWindowAroundNow(TIMEZONE);
    await configureSettings({
      defaultGateId: openGateId,
      requestWindowStartLocal: closedWindow.startLocal,
      requestWindowEndLocal: closedWindow.endLocal,
    });
    const closedWindowResponse = await postPickupRequest({
      childId: child.studentId,
      gateId: openGateId,
    }).expect(422);
    expect(closedWindowResponse.body?.error?.code).toBe(
      'dismissal.request.outside_window',
    );

    await configureSettings({ defaultGateId: openGateId });
    await postPickupRequest({
      childId: child.studentId,
      gateId: openGateId,
      latitude: 91,
    }).expect(400);

    const outsideGeofence = await postPickupRequest({
      childId: child.studentId,
      gateId: openGateId,
      latitude: 31,
      longitude: 32,
    }).expect(422);
    expect(outsideGeofence.body?.error?.code).toBe(
      'dismissal.request.outside_geofence',
    );
    await expectRequestCounts({ requests: 0, events: 0 });
  });

  it('accepts an overnight open request window', async () => {
    const overnight = openOvernightWindowAroundNow(TIMEZONE);
    await configureSettings({
      defaultGateId: openGateId,
      requestWindowStartLocal: overnight.startLocal,
      requestWindowEndLocal: overnight.endLocal,
    });
    const child = await createOwnedActiveChild('overnight');

    const response = await postPickupRequest({
      childId: child.studentId,
      gateId: openGateId,
    }).expect(201);

    expect(response.body.request.status).toBe('requested');
  });

  it('rejects closed, maintenance, inactive, and cross-school gates', async () => {
    await configureSettings({ defaultGateId: openGateId });

    const cases = [
      { gateId: closedGateId, status: 409, code: 'dismissal.gate.closed' },
      { gateId: maintenanceGateId, status: 409, code: 'dismissal.gate.closed' },
      { gateId: inactiveGateId, status: 409, code: 'dismissal.gate.closed' },
      { gateId: crossSchoolGateId, status: 404, code: 'dismissal.gate.not_found' },
    ];

    for (const entry of cases) {
      const child = await createOwnedActiveChild(`gate-${entry.status}`);
      const response = await postPickupRequest({
        childId: child.studentId,
        gateId: entry.gateId,
      }).expect(entry.status);
      expect(response.body?.error?.code).toBe(entry.code);
    }
    await expectRequestCounts({ requests: 0, events: 0 });
  });

  it('rejects duplicate active requests for the same student', async () => {
    await configureSettings({ defaultGateId: openGateId });
    const child = await createOwnedActiveChild('duplicate');

    await postPickupRequest({ childId: child.studentId, gateId: openGateId }).expect(
      201,
    );
    const duplicate = await postPickupRequest({
      childId: child.studentId,
      gateId: openGateId,
    }).expect(409);

    expect(duplicate.body?.error?.code).toBe(
      'dismissal.request.duplicate_active',
    );
    await expectRequestCounts({ requests: 1, events: 1 });
  });

  it('returns existing request for same clientRequestId and conflicts for a different child', async () => {
    await configureSettings({ defaultGateId: openGateId });
    const child = await createOwnedActiveChild('idempotent');
    const otherChild = await createOwnedActiveChild('other');

    const first = await postPickupRequest({
      childId: child.studentId,
      gateId: openGateId,
      clientRequestId: 'idem-1',
    }).expect(201);
    const retry = await postPickupRequest({
      childId: child.studentId,
      gateId: openGateId,
      clientRequestId: 'idem-1',
    }).expect(201);

    expect(retry.body.request.id).toBe(first.body.request.id);
    await expectRequestCounts({ requests: 1, events: 1 });

    const conflict = await postPickupRequest({
      childId: otherChild.studentId,
      gateId: openGateId,
      clientRequestId: 'idem-1',
    }).expect(409);
    expect(conflict.body?.error?.code).toBe(
      'dismissal.request.idempotency_conflict',
    );
    await expectRequestCounts({ requests: 1, events: 1 });
  });

  it('does not persist request/event on failed validations and readiness still works after success', async () => {
    await configureSettings({ defaultGateId: openGateId });
    const failedChild = await createOwnedActiveChild('failed');
    const failed = await postPickupRequest({
      childId: failedChild.studentId,
      gateId: closedGateId,
    }).expect(409);
    expect(failed.body?.error?.code).toBe('dismissal.gate.closed');
    await expectRequestCounts({ requests: 0, events: 0 });

    const successChild = await createOwnedActiveChild('readiness');
    await postPickupRequest({
      childId: successChild.studentId,
      gateId: openGateId,
    }).expect(201);

    const readiness = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/smart-pickup`)
      .set('Authorization', `Bearer ${parentToken}`)
      .expect(200);
    expect(readiness.body.status.enabled).toBe(true);
    expect(JSON.stringify(readiness.body)).toContain(successChild.studentId);
    assertNoRequestLeak(readiness.body);
  });

  function postPickupRequest(params: {
    childId: string;
    gateId?: string;
    clientRequestId?: string;
    latitude?: number;
    longitude?: number;
  }): request.Test {
    const body: Record<string, unknown> = {
      childId: params.childId,
      latitude: params.latitude ?? SCHOOL_LATITUDE,
      longitude: params.longitude ?? SCHOOL_LONGITUDE,
    };
    if (params.gateId !== undefined) body.gateId = params.gateId;
    if (params.clientRequestId !== undefined) {
      body.clientRequestId = params.clientRequestId;
    }

    return request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/smart-pickup/requests`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send(body);
  }

  async function resetRequestState(): Promise<void> {
    const schoolIds = [schoolAId, schoolBId].filter(Boolean);
    await prisma.dismissalRequestEvent.deleteMany({
      where: { schoolId: { in: schoolIds } },
    });
    await prisma.dismissalRequest.deleteMany({
      where: { schoolId: { in: schoolIds } },
    });
    await prisma.auditLog.deleteMany({
      where: { module: 'dismissal', schoolId: { in: schoolIds } },
    });
    await prisma.dismissalSettings.deleteMany({
      where: { schoolId: { in: schoolIds } },
    });
    await prisma.dismissalGate.update({
      where: { id: openGateId },
      data: { status: DismissalGateOperationalStatus.OPEN, isActive: true },
    });
    await prisma.dismissalGate.update({
      where: { id: busyGateId },
      data: { status: DismissalGateOperationalStatus.BUSY, isActive: true },
    });
    await prisma.dismissalGate.update({
      where: { id: closedGateId },
      data: { status: DismissalGateOperationalStatus.CLOSED, isActive: true },
    });
    await prisma.dismissalGate.update({
      where: { id: maintenanceGateId },
      data: {
        status: DismissalGateOperationalStatus.MAINTENANCE,
        isActive: true,
      },
    });
    await prisma.dismissalGate.update({
      where: { id: inactiveGateId },
      data: { status: DismissalGateOperationalStatus.OPEN, isActive: false },
    });
    await prisma.schoolProfile.update({
      where: { schoolId: schoolAId },
      data: {
        timezone: TIMEZONE,
        latitude: SCHOOL_LATITUDE,
        longitude: SCHOOL_LONGITUDE,
        mapPlaceLabel: 'Parent Pickup Request Main Gate',
      },
    });
  }

  async function configureSettings(params: {
    enabled?: boolean;
    defaultGateId?: string | null;
    schoolLatitude?: number | null;
    schoolLongitude?: number | null;
    requestWindowStartLocal?: string;
    requestWindowEndLocal?: string;
  }): Promise<void> {
    await prisma.dismissalSettings.deleteMany({ where: { schoolId: schoolAId } });
    await prisma.dismissalSettings.create({
      data: {
        schoolId: schoolAId,
        enabled: params.enabled ?? true,
        timezone: TIMEZONE,
        schoolLatitude:
          params.schoolLatitude === undefined
            ? SCHOOL_LATITUDE
            : params.schoolLatitude,
        schoolLongitude:
          params.schoolLongitude === undefined
            ? SCHOOL_LONGITUDE
            : params.schoolLongitude,
        allowedRadiusMeters: 150,
        requestWindowStartLocal: params.requestWindowStartLocal ?? '00:00',
        requestWindowEndLocal: params.requestWindowEndLocal ?? '23:59',
        defaultGateId: params.defaultGateId ?? null,
        requirePickupCode: true,
        allowDelegatePickup: true,
        allowParentCancelBeforeCalled: true,
      },
    });
  }

  async function createOwnedActiveChild(label: string): Promise<{
    studentId: string;
    enrollmentId: string;
  }> {
    const child = await createStudentFixture({
      schoolId: schoolAId,
      organizationId: organizationAId,
      academicYearId: academicYearAId,
      termId: termAId,
      classroomId: classroomAId,
      firstName: 'Pickup',
      lastName: label,
      status: StudentStatus.ACTIVE,
      createEnrollment: true,
      guardianId: pickupGuardianId,
    });
    if (!child.enrollmentId) {
      throw new Error('Expected active enrollment fixture.');
    }

    return { studentId: child.studentId, enrollmentId: child.enrollmentId };
  }

  async function createSchoolFixture(label: string): Promise<{
    organizationId: string;
    schoolId: string;
  }> {
    const organization = await prisma.organization.create({
      data: {
        slug: `parent-request-${TEST_RUN_ID}-org-${label}`,
        name: `Parent Request Org ${label}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);

    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `parent-request-${TEST_RUN_ID}-school-${label}`,
        name: `Parent Request School ${label}`,
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
  ): Promise<void> {
    await prisma.schoolProfile.create({
      data: {
        schoolId,
        timezone: TIMEZONE,
        latitude,
        longitude,
        mapPlaceLabel: 'Parent Pickup Request Main Gate',
      },
    });
  }

  async function createAcademicFixture(
    label: string,
    schoolId: string,
  ): Promise<{
    academicYearId: string;
    termId: string;
    classroomId: string;
  }> {
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId,
        nameAr: `request-year-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Request Year ${label.toUpperCase()}`,
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
        nameAr: `request-term-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Request Term ${label.toUpperCase()}`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-01-31T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    const stage = await prisma.stage.create({
      data: {
        schoolId,
        nameAr: `request-stage-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Stage ${label.toUpperCase()}`,
      },
      select: { id: true },
    });
    const grade = await prisma.grade.create({
      data: {
        schoolId,
        stageId: stage.id,
        nameAr: `request-grade-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Grade ${label.toUpperCase()}`,
      },
      select: { id: true },
    });
    const section = await prisma.section.create({
      data: {
        schoolId,
        gradeId: grade.id,
        nameAr: `request-section-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Section ${label.toUpperCase()}`,
      },
      select: { id: true },
    });
    const classroom = await prisma.classroom.create({
      data: {
        schoolId,
        sectionId: section.id,
        nameAr: `request-classroom-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Classroom ${label.toUpperCase()}`,
      },
      select: { id: true },
    });

    return {
      academicYearId: academicYear.id,
      termId: term.id,
      classroomId: classroom.id,
    };
  }

  async function createUserWithMembership(params: {
    email: string;
    schoolId: string;
    organizationId: string;
    roleId: string;
    userType: UserType;
  }): Promise<{ userId: string; email: string }> {
    const passwordHash = await argon2.hash(PASSWORD, ARGON2_OPTIONS);
    const user = await prisma.user.create({
      data: {
        email: params.email,
        firstName: 'Parent',
        lastName: 'Request',
        userType: params.userType,
        status: UserStatus.ACTIVE,
        passwordHash,
      },
      select: { id: true },
    });
    createdUserIds.push(user.id);

    await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: params.organizationId,
        schoolId: params.schoolId,
        roleId: params.roleId,
        userType: params.userType,
        status: MembershipStatus.ACTIVE,
      },
    });

    return { userId: user.id, email: params.email };
  }

  async function createGuardian(params: {
    schoolId: string;
    organizationId: string;
    userId: string;
    marker: string;
    canPickup: boolean;
  }): Promise<string> {
    const guardian = await prisma.guardian.create({
      data: {
        schoolId: params.schoolId,
        organizationId: params.organizationId,
        userId: params.userId,
        firstName: 'Request',
        lastName: `Guardian ${params.marker}`,
        phone: `${TEST_RUN_ID}-${params.marker}`,
        relation: 'parent',
        isPrimary: params.marker === 'pickup',
        canPickup: params.canPickup,
        canReceiveNotifications: true,
      },
      select: { id: true },
    });

    return guardian.id;
  }

  async function createStudentFixture(params: {
    schoolId: string;
    organizationId: string;
    academicYearId: string;
    termId: string;
    classroomId: string;
    firstName: string;
    lastName: string;
    status: StudentStatus;
    createEnrollment: boolean;
    guardianId: string | null;
  }): Promise<{ studentId: string; enrollmentId: string | null }> {
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

    let enrollmentId: string | null = null;
    if (params.createEnrollment) {
      const enrollment = await prisma.enrollment.create({
        data: {
          schoolId: params.schoolId,
          studentId: student.id,
          academicYearId: params.academicYearId,
          termId: params.termId,
          classroomId: params.classroomId,
          status: StudentEnrollmentStatus.ACTIVE,
          enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
        },
        select: { id: true },
      });
      enrollmentId = enrollment.id;
    }

    if (params.guardianId) {
      await prisma.studentGuardian.create({
        data: {
          schoolId: params.schoolId,
          studentId: student.id,
          guardianId: params.guardianId,
          isPrimary: true,
        },
      });
    }

    return { studentId: student.id, enrollmentId };
  }

  async function createGate(params: {
    schoolId: string;
    code: string;
    name: string;
    status: DismissalGateOperationalStatus;
    isActive: boolean;
    sortOrder: number;
  }): Promise<string> {
    const gate = await prisma.dismissalGate.create({
      data: {
        schoolId: params.schoolId,
        code: params.code,
        name: params.name,
        status: params.status,
        isActive: params.isActive,
        sortOrder: params.sortOrder,
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

  async function expectRequestCounts(expected: {
    requests: number;
    events: number;
  }): Promise<void> {
    await expect(
      prisma.dismissalRequest.count({ where: { schoolId: schoolAId } }),
    ).resolves.toBe(expected.requests);
    await expect(
      prisma.dismissalRequestEvent.count({ where: { schoolId: schoolAId } }),
    ).resolves.toBe(expected.events);
  }
});

function openOvernightWindowAroundNow(timezone: string): {
  startLocal: string;
  endLocal: string;
} {
  const nowMinutes = currentLocalMinutes(timezone);
  if (nowMinutes >= 12 * 60) {
    return {
      startLocal: minutesToTime(nowMinutes - 1),
      endLocal: '00:10',
    };
  }

  return {
    startLocal: '23:00',
    endLocal: minutesToTime(nowMinutes + 1),
  };
}

function closedWindowAroundNow(timezone: string): {
  startLocal: string;
  endLocal: string;
} {
  const nowMinutes = currentLocalMinutes(timezone);
  if (nowMinutes > 10) {
    return { startLocal: '00:00', endLocal: '00:01' };
  }

  return { startLocal: '12:00', endLocal: '12:01' };
}

function currentLocalMinutes(timezone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
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

function assertNoRequestLeak(body: unknown): void {
  const serialized = JSON.stringify(body);
  for (const forbidden of [
    'schoolId',
    'organizationId',
    'membershipId',
    'roleId',
    'guardianId',
    'userId',
    'applicationId',
    'enrollmentId',
    'requestedById',
    'staffUserId',
    'actorId',
    'createdById',
    'updatedById',
    'deletedAt',
    'parentLatitude',
    'parentLongitude',
    'distanceMeters',
    'geofencePassed',
    'school_id',
    'organization_id',
    'membership_id',
    'role_id',
    'guardian_id',
    'user_id',
    'application_id',
    'enrollment_id',
    'requested_by_id',
    'actor_id',
    'parent_latitude',
    'parent_longitude',
    'distance_meters',
    'geofence_passed',
    'deleted_at',
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}
