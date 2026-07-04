import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  DismissalGateOperationalStatus,
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
const PASSWORD = 'ParentSmartPickup123!';
const TEST_RUN_ID = randomUUID().slice(0, 8);
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};
const TIMEZONE = 'Africa/Cairo';

jest.setTimeout(90_000);

describe('PARENT-DISMISSAL-1A smart pickup readiness (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let organizationAId: string;
  let organizationBId: string;
  let schoolAId: string;
  let schoolBId: string;
  let parentAId: string;
  let parentAToken: string;
  let activeChildId: string;
  let noEnrollmentChildId: string;
  let pickupDeniedChildId: string;
  let crossSchoolChildId: string;
  let openGateId: string;
  let busyGateId: string;
  let closedGateId: string;
  let maintenanceGateId: string;
  let inactiveGateId: string;
  let deletedGateId: string;
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

    await createSchoolProfileFixture({
      schoolId: schoolAId,
      timezone: TIMEZONE,
      latitude: 30.04442,
      longitude: 31.235712,
      mapPlaceLabel: 'Parent Smart Pickup Main Gate',
      formattedAddress: 'Tahrir Square, Cairo',
    });
    await createSchoolProfileFixture({
      schoolId: schoolBId,
      timezone: 'Europe/Berlin',
      latitude: 52.52,
      longitude: 13.405,
      mapPlaceLabel: 'Cross School Gate',
    });

    const academicA = await createAcademicFixture('a', schoolAId);
    const academicB = await createAcademicFixture('b', schoolBId);
    const parent = await createUserWithMembership({
      email: `parent-smart-pickup-${TEST_RUN_ID}@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: parentRole.id,
      userType: UserType.PARENT,
      firstName: 'Parent',
      lastName: 'Pickup',
    });
    parentAId = parent.userId;

    const pickupGuardianId = await createGuardian({
      schoolId: schoolAId,
      organizationId: organizationAId,
      userId: parentAId,
      marker: 'pickup',
      canPickup: true,
    });
    const deniedGuardianId = await createGuardian({
      schoolId: schoolAId,
      organizationId: organizationAId,
      userId: parentAId,
      marker: 'denied',
      canPickup: false,
    });

    const activeChild = await createStudentWithOptionalEnrollment({
      schoolId: schoolAId,
      organizationId: organizationAId,
      academicYearId: academicA.academicYearId,
      termId: academicA.termId,
      classroomId: academicA.classroomId,
      firstName: 'Amina',
      lastName: 'Eligible',
      createEnrollment: true,
    });
    activeChildId = activeChild.studentId;
    await linkGuardianToStudent({
      schoolId: schoolAId,
      studentId: activeChildId,
      guardianId: pickupGuardianId,
    });

    const noEnrollmentChild = await createStudentWithOptionalEnrollment({
      schoolId: schoolAId,
      organizationId: organizationAId,
      academicYearId: academicA.academicYearId,
      termId: academicA.termId,
      classroomId: academicA.classroomId,
      firstName: 'Bassem',
      lastName: 'No Enrollment',
      createEnrollment: false,
    });
    noEnrollmentChildId = noEnrollmentChild.studentId;
    await linkGuardianToStudent({
      schoolId: schoolAId,
      studentId: noEnrollmentChildId,
      guardianId: pickupGuardianId,
    });

    const deniedChild = await createStudentWithOptionalEnrollment({
      schoolId: schoolAId,
      organizationId: organizationAId,
      academicYearId: academicA.academicYearId,
      termId: academicA.termId,
      classroomId: academicA.classroomId,
      firstName: 'Celine',
      lastName: 'Denied',
      createEnrollment: true,
    });
    pickupDeniedChildId = deniedChild.studentId;
    await linkGuardianToStudent({
      schoolId: schoolAId,
      studentId: pickupDeniedChildId,
      guardianId: deniedGuardianId,
    });

    const unlinkedChild = await createStudentWithOptionalEnrollment({
      schoolId: schoolAId,
      organizationId: organizationAId,
      academicYearId: academicA.academicYearId,
      termId: academicA.termId,
      classroomId: academicA.classroomId,
      firstName: 'Unlinked',
      lastName: 'Child',
      createEnrollment: true,
    });

    const crossSchoolGuardianId = await createGuardian({
      schoolId: schoolBId,
      organizationId: organizationBId,
      userId: parentAId,
      marker: 'cross',
      canPickup: true,
    });
    const crossSchoolChild = await createStudentWithOptionalEnrollment({
      schoolId: schoolBId,
      organizationId: organizationBId,
      academicYearId: academicB.academicYearId,
      termId: academicB.termId,
      classroomId: academicB.classroomId,
      firstName: 'Cross',
      lastName: 'School',
      createEnrollment: true,
    });
    crossSchoolChildId = crossSchoolChild.studentId;
    await linkGuardianToStudent({
      schoolId: schoolBId,
      studentId: crossSchoolChildId,
      guardianId: crossSchoolGuardianId,
    });

    openGateId = await createGate({
      schoolId: schoolAId,
      code: `OPEN-${TEST_RUN_ID}`,
      name: 'Open Parent Gate',
      status: DismissalGateOperationalStatus.OPEN,
      isActive: true,
      sortOrder: 1,
    });
    busyGateId = await createGate({
      schoolId: schoolAId,
      code: `BUSY-${TEST_RUN_ID}`,
      name: 'Busy Parent Gate',
      status: DismissalGateOperationalStatus.BUSY,
      isActive: true,
      sortOrder: 2,
    });
    closedGateId = await createGate({
      schoolId: schoolAId,
      code: `CLOSED-${TEST_RUN_ID}`,
      name: 'Closed Parent Gate',
      status: DismissalGateOperationalStatus.CLOSED,
      isActive: true,
      sortOrder: 3,
    });
    maintenanceGateId = await createGate({
      schoolId: schoolAId,
      code: `MAINT-${TEST_RUN_ID}`,
      name: 'Maintenance Parent Gate',
      status: DismissalGateOperationalStatus.MAINTENANCE,
      isActive: true,
      sortOrder: 4,
    });
    inactiveGateId = await createGate({
      schoolId: schoolAId,
      code: `INACTIVE-${TEST_RUN_ID}`,
      name: 'Inactive Parent Gate',
      status: DismissalGateOperationalStatus.OPEN,
      isActive: false,
      sortOrder: 5,
    });
    deletedGateId = await createGate({
      schoolId: schoolAId,
      code: `DELETED-${TEST_RUN_ID}`,
      name: 'Deleted Parent Gate',
      status: DismissalGateOperationalStatus.BUSY,
      isActive: true,
      sortOrder: 6,
      deletedAt: new Date(),
    });
    await createGate({
      schoolId: schoolBId,
      code: `CROSS-${TEST_RUN_ID}`,
      name: 'Cross School Gate',
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

    parentAToken = await login(parent.email);

    expect(unlinkedChild.studentId).toBeTruthy();
  });

  afterAll(async () => {
    if (prisma) {
      const schoolIds = [schoolAId, schoolBId].filter(Boolean);
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

  it('returns disabled defaults from SchoolProfile without persisting settings', async () => {
    await prisma.dismissalSettings.deleteMany({ where: { schoolId: schoolAId } });

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/smart-pickup`)
      .set('Authorization', `Bearer ${parentAToken}`)
      .expect(200);

    expect(response.body.status).toMatchObject({
      enabled: false,
      configured: false,
      requestWindowOpen: false,
      canRequestNow: false,
    });
    expect(response.body.status.reasons).toEqual(
      expect.arrayContaining([
        'dismissal_disabled',
        'settings_not_configured',
        'outside_request_window',
      ]),
    );
    expect(response.body.schoolZone).toEqual({
      latitude: 30.04442,
      longitude: 31.235712,
      radiusMeters: 150,
      label: 'Parent Smart Pickup Main Gate',
      source: 'school_profile',
    });
    expect(response.body.requestWindow).toMatchObject({
      startLocal: null,
      endLocal: null,
      timezone: TIMEZONE,
    });
    expect(response.body.requestWindow.serverNowLocal).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/,
    );
    expect(response.body.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: activeChildId,
          displayName: 'Amina Eligible',
          canPickup: true,
          pickupEligible: false,
          eligibilityReasons: ['dismissal_disabled'],
        }),
      ]),
    );
    assertNoSmartPickupLeak(response.body);

    await expect(
      prisma.dismissalSettings.count({ where: { schoolId: schoolAId } }),
    ).resolves.toBe(0);
  });

  it('uses configured settings coordinates and policies and allows requests when ready', async () => {
    await replaceSettings({
      enabled: true,
      schoolLatitude: 29.987654,
      schoolLongitude: 31.123456,
      allowedRadiusMeters: 275,
      requestWindowStartLocal: '00:00',
      requestWindowEndLocal: '23:59',
      requirePickupCode: false,
      allowDelegatePickup: false,
      allowParentCancelBeforeCalled: false,
    });

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/smart-pickup`)
      .set('Authorization', `Bearer ${parentAToken}`)
      .expect(200);

    expect(response.body.status).toEqual({
      enabled: true,
      configured: true,
      requestWindowOpen: true,
      canRequestNow: true,
      reasons: [],
    });
    expect(response.body.schoolZone).toEqual({
      latitude: 29.987654,
      longitude: 31.123456,
      radiusMeters: 275,
      label: 'Parent Smart Pickup Main Gate',
      source: 'settings',
    });
    expect(response.body.policies).toEqual({
      requirePickupCode: false,
      allowDelegatePickup: false,
      allowParentCancelBeforeCalled: false,
    });
    expect(response.body.summary).toEqual({
      childCount: 3,
      eligibleChildCount: 1,
      availableGateCount: 2,
    });
    expect(childById(response.body.children, activeChildId)).toMatchObject({
      pickupEligible: true,
      eligibilityReasons: [],
      grade: 'Grade A',
      section: 'Section A',
      classroom: 'Classroom A',
    });
    expect(childById(response.body.children, noEnrollmentChildId)).toMatchObject({
      pickupEligible: false,
      eligibilityReasons: ['no_active_enrollment'],
    });
    expect(childById(response.body.children, pickupDeniedChildId)).toMatchObject({
      canPickup: false,
      pickupEligible: false,
      eligibilityReasons: ['guardian_not_allowed'],
    });
    expect(JSON.stringify(response.body)).not.toContain(crossSchoolChildId);
    assertNoSmartPickupLeak(response.body);
  });

  it('computes requestWindowOpen=false outside the configured window', async () => {
    const closedWindow = closedWindowAroundNow(TIMEZONE);
    await replaceSettings({
      enabled: true,
      schoolLatitude: 29.987654,
      schoolLongitude: 31.123456,
      requestWindowStartLocal: closedWindow.startLocal,
      requestWindowEndLocal: closedWindow.endLocal,
    });

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/smart-pickup`)
      .set('Authorization', `Bearer ${parentAToken}`)
      .expect(200);

    expect(response.body.requestWindow).toMatchObject(closedWindow);
    expect(response.body.status.requestWindowOpen).toBe(false);
    expect(response.body.status.canRequestNow).toBe(false);
    expect(response.body.status.reasons).toContain('outside_request_window');
    expect(childById(response.body.children, activeChildId).pickupEligible).toBe(
      true,
    );
  });

  it('computes normal and overnight request windows server-side', async () => {
    await replaceSettings({
      enabled: true,
      schoolLatitude: 29.987654,
      schoolLongitude: 31.123456,
      requestWindowStartLocal: '00:00',
      requestWindowEndLocal: '23:59',
    });

    const openResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/smart-pickup`)
      .set('Authorization', `Bearer ${parentAToken}`)
      .expect(200);
    expect(openResponse.body.status.requestWindowOpen).toBe(true);
    expect(openResponse.body.status.canRequestNow).toBe(true);

    const overnightWindow = openOvernightWindowAroundNow(TIMEZONE);
    await replaceSettings({
      enabled: true,
      schoolLatitude: 29.987654,
      schoolLongitude: 31.123456,
      requestWindowStartLocal: overnightWindow.startLocal,
      requestWindowEndLocal: overnightWindow.endLocal,
    });

    const overnightResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/smart-pickup`)
      .set('Authorization', `Bearer ${parentAToken}`)
      .expect(200);
    expect(overnightResponse.body.requestWindow).toMatchObject(overnightWindow);
    expect(overnightResponse.body.status.requestWindowOpen).toBe(true);
    expect(overnightResponse.body.status.canRequestNow).toBe(true);
  });

  it('returns only active non-deleted OPEN/BUSY current-school gates', async () => {
    await replaceSettings({
      enabled: true,
      schoolLatitude: 29.987654,
      schoolLongitude: 31.123456,
      requestWindowStartLocal: '00:00',
      requestWindowEndLocal: '23:59',
    });

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/smart-pickup`)
      .set('Authorization', `Bearer ${parentAToken}`)
      .expect(200);
    const gateIds = response.body.gates.map((gate: { id: string }) => gate.id);

    expect(gateIds).toEqual([openGateId, busyGateId]);
    expect(gateIds).not.toEqual(
      expect.arrayContaining([
        closedGateId,
        maintenanceGateId,
        inactiveGateId,
        deletedGateId,
      ]),
    );
    expect(response.body.gates).toEqual([
      expect.objectContaining({
        id: openGateId,
        status: 'open',
        isActive: true,
      }),
      expect.objectContaining({
        id: busyGateId,
        status: 'busy',
        isActive: true,
      }),
    ]);
    assertNoSmartPickupLeak(response.body);
  });

  async function replaceSettings(params: {
    enabled: boolean;
    schoolLatitude: number;
    schoolLongitude: number;
    allowedRadiusMeters?: number;
    requestWindowStartLocal: string;
    requestWindowEndLocal: string;
    requirePickupCode?: boolean;
    allowDelegatePickup?: boolean;
    allowParentCancelBeforeCalled?: boolean;
  }): Promise<void> {
    await prisma.dismissalSettings.deleteMany({ where: { schoolId: schoolAId } });
    await prisma.dismissalSettings.create({
      data: {
        schoolId: schoolAId,
        enabled: params.enabled,
        timezone: TIMEZONE,
        schoolLatitude: params.schoolLatitude,
        schoolLongitude: params.schoolLongitude,
        allowedRadiusMeters: params.allowedRadiusMeters ?? 150,
        requestWindowStartLocal: params.requestWindowStartLocal,
        requestWindowEndLocal: params.requestWindowEndLocal,
        requirePickupCode: params.requirePickupCode ?? true,
        allowDelegatePickup: params.allowDelegatePickup ?? true,
        allowParentCancelBeforeCalled:
          params.allowParentCancelBeforeCalled ?? true,
      },
    });
  }

  async function createSchoolFixture(label: string): Promise<{
    organizationId: string;
    schoolId: string;
  }> {
    const organization = await prisma.organization.create({
      data: {
        slug: `parent-smart-pickup-${TEST_RUN_ID}-org-${label}`,
        name: `Parent Smart Pickup Org ${label}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);

    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `parent-smart-pickup-${TEST_RUN_ID}-school-${label}`,
        name: `Parent Smart Pickup School ${label}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdSchoolIds.push(school.id);

    return { organizationId: organization.id, schoolId: school.id };
  }

  async function createSchoolProfileFixture(params: {
    schoolId: string;
    timezone: string;
    latitude: number;
    longitude: number;
    mapPlaceLabel: string;
    formattedAddress?: string;
  }): Promise<void> {
    await prisma.schoolProfile.create({
      data: {
        schoolId: params.schoolId,
        timezone: params.timezone,
        latitude: params.latitude,
        longitude: params.longitude,
        mapPlaceLabel: params.mapPlaceLabel,
        formattedAddress: params.formattedAddress,
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
        nameAr: `pickup-year-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Pickup Year ${TEST_RUN_ID} ${label}`,
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
        nameAr: `pickup-term-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Pickup Term ${TEST_RUN_ID} ${label}`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-01-31T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    const stage = await prisma.stage.create({
      data: {
        schoolId,
        nameAr: `stage-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Stage ${label.toUpperCase()}`,
      },
      select: { id: true },
    });
    const grade = await prisma.grade.create({
      data: {
        schoolId,
        stageId: stage.id,
        nameAr: `grade-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Grade ${label.toUpperCase()}`,
      },
      select: { id: true },
    });
    const section = await prisma.section.create({
      data: {
        schoolId,
        gradeId: grade.id,
        nameAr: `section-${TEST_RUN_ID}-${label}-ar`,
        nameEn: `Section ${label.toUpperCase()}`,
      },
      select: { id: true },
    });
    const classroom = await prisma.classroom.create({
      data: {
        schoolId,
        sectionId: section.id,
        nameAr: `classroom-${TEST_RUN_ID}-${label}-ar`,
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
    firstName: string;
    lastName: string;
  }): Promise<{ userId: string; email: string }> {
    const passwordHash = await argon2.hash(PASSWORD, ARGON2_OPTIONS);
    const user = await prisma.user.create({
      data: {
        email: params.email,
        firstName: params.firstName,
        lastName: params.lastName,
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
        firstName: 'Pickup',
        lastName: `Guardian ${params.marker}`,
        phone: `${TEST_RUN_ID}-${params.marker}`,
        email: `${TEST_RUN_ID}-${params.marker}@example.test`,
        relation: 'parent',
        isPrimary: params.marker === 'pickup',
        canPickup: params.canPickup,
        canReceiveNotifications: true,
      },
      select: { id: true },
    });

    return guardian.id;
  }

  async function createStudentWithOptionalEnrollment(params: {
    schoolId: string;
    organizationId: string;
    academicYearId: string;
    termId: string;
    classroomId: string;
    firstName: string;
    lastName: string;
    createEnrollment: boolean;
  }): Promise<{ studentId: string; enrollmentId: string | null }> {
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

    if (!params.createEnrollment) {
      return { studentId: student.id, enrollmentId: null };
    }

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

    return { studentId: student.id, enrollmentId: enrollment.id };
  }

  async function linkGuardianToStudent(params: {
    schoolId: string;
    studentId: string;
    guardianId: string;
  }): Promise<void> {
    await prisma.studentGuardian.create({
      data: {
        schoolId: params.schoolId,
        studentId: params.studentId,
        guardianId: params.guardianId,
        isPrimary: true,
      },
    });
  }

  async function createGate(params: {
    schoolId: string;
    code: string;
    name: string;
    status: DismissalGateOperationalStatus;
    isActive: boolean;
    sortOrder: number;
    deletedAt?: Date;
  }): Promise<string> {
    const gate = await prisma.dismissalGate.create({
      data: {
        schoolId: params.schoolId,
        code: params.code,
        name: params.name,
        status: params.status,
        isActive: params.isActive,
        sortOrder: params.sortOrder,
        deletedAt: params.deletedAt,
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
});

function childById(
  children: Array<{ id: string }>,
  childId: string,
): Record<string, unknown> {
  const child = children.find((entry) => entry.id === childId);
  expect(child).toBeTruthy();
  return child as Record<string, unknown>;
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

function assertNoSmartPickupLeak(body: unknown): void {
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
    'updatedById',
    'deletedAt',
    'actorId',
    'school_id',
    'organization_id',
    'membership_id',
    'role_id',
    'guardian_id',
    'user_id',
    'application_id',
    'enrollment_id',
    'updated_by_id',
    'deleted_at',
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}
