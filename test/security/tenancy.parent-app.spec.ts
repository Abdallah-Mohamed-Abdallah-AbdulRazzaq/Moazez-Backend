import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
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
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../src/common/context/request-context';
import { AppModule } from '../../src/app.module';
import { ParentAppAccessService } from '../../src/modules/parent-app/access/parent-app-access.service';
import { ParentAppGuardianReadAdapter } from '../../src/modules/parent-app/access/parent-app-guardian-read.adapter';
import type {
  ParentAppEnrollmentRecord,
  ParentAppGuardianRecord,
  ParentAppStudentGuardianLinkRecord,
} from '../../src/modules/parent-app/shared/parent-app.types';

const PARENT_USER_ID = 'parent-user-1';
const GUARDIAN_ID = 'guardian-1';
const STUDENT_ID = 'student-1';
const SECOND_STUDENT_ID = 'student-2';
const ENROLLMENT_ID = 'enrollment-1';
const SECOND_ENROLLMENT_ID = 'enrollment-2';
const CLASSROOM_ID = 'classroom-1';
const SCHOOL_ID = 'school-1';
const ORGANIZATION_ID = 'org-1';
const GLOBAL_PREFIX = '/api/v1';
const E2E_PASSWORD = 'ParentApp123!';
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(45000);

describe('Parent App ownership foundation (security)', () => {
  it('does not allow a parent to access an unlinked same-school child', async () => {
    const { service, adapter } = createValidService();
    adapter.findOwnedActiveEnrollmentForStudent.mockResolvedValue(null);

    await expect(
      withParentRequestContext(() =>
        service.assertParentOwnsStudent('same-school-unlinked-student'),
      ),
    ).rejects.toMatchObject({
      code: 'parent_app.child.not_found',
    });
    expect(adapter.findOwnedActiveEnrollmentForStudent).toHaveBeenCalledWith({
      studentId: 'same-school-unlinked-student',
      guardianIds: [GUARDIAN_ID],
    });
  });

  it('does not allow a parent to access a cross-school guessed child', async () => {
    const { service, adapter } = createValidService();
    adapter.findOwnedActiveEnrollmentForStudent.mockResolvedValue(null);

    await expect(
      withParentRequestContext(() =>
        service.assertParentOwnsStudent('cross-school-student'),
      ),
    ).rejects.toMatchObject({
      code: 'parent_app.child.not_found',
    });
  });

  it('returns only current-school linked children from the active school context', async () => {
    const { service, adapter } = createValidService();

    const children = await withParentRequestContext(() =>
      service.listAccessibleChildren(),
    );

    expect(children).toEqual([
      {
        studentId: STUDENT_ID,
        enrollmentId: ENROLLMENT_ID,
        classroomId: CLASSROOM_ID,
        academicYearId: 'year-1',
        termId: 'term-1',
      },
      {
        studentId: SECOND_STUDENT_ID,
        enrollmentId: SECOND_ENROLLMENT_ID,
        classroomId: CLASSROOM_ID,
        academicYearId: 'year-1',
        termId: 'term-1',
      },
    ]);
    expect(children.map((child) => child.studentId)).not.toContain(
      'cross-school-student',
    );
    expect(adapter.listActiveEnrollmentsForLinkedStudents).toHaveBeenCalledWith(
      {
        guardianIds: [GUARDIAN_ID],
        studentIds: [STUDENT_ID, SECOND_STUDENT_ID],
      },
    );
  });

  it('rejects non-parent actors before resolving guardian ownership', async () => {
    const { service, adapter } = createValidService();

    await expect(
      withParentRequestContext(() => service.getParentAppContext(), {
        userType: UserType.TEACHER,
      }),
    ).rejects.toMatchObject({
      code: 'parent_app.actor.required_parent',
    });
    expect(adapter.listCurrentSchoolGuardiansByUserId).not.toHaveBeenCalled();
  });
});

async function withParentRequestContext<T>(
  fn: () => T | Promise<T>,
  options?: { userType?: UserType },
): Promise<T> {
  return runWithRequestContext(createRequestContext(), async () => {
    setActor({
      id: PARENT_USER_ID,
      userType: options?.userType ?? UserType.PARENT,
    });
    setActiveMembership({
      membershipId: 'membership-1',
      organizationId: ORGANIZATION_ID,
      schoolId: SCHOOL_ID,
      roleId: 'role-1',
      permissions: ['students.records.view'],
    });

    return fn();
  });
}

function createValidService(): {
  service: ParentAppAccessService;
  adapter: jest.Mocked<ParentAppGuardianReadAdapter>;
} {
  const adapter = {
    listCurrentSchoolGuardiansByUserId: jest
      .fn()
      .mockResolvedValue([guardianFixture()]),
    listLinkedStudentsForGuardians: jest.fn().mockResolvedValue([
      linkFixture(),
      linkFixture({
        id: 'link-2',
        studentId: SECOND_STUDENT_ID,
        student: studentRecordFixture({ id: SECOND_STUDENT_ID }),
      }),
    ]),
    listActiveEnrollmentsForLinkedStudents: jest.fn().mockResolvedValue([
      enrollmentFixture(),
      enrollmentFixture({
        id: SECOND_ENROLLMENT_ID,
        studentId: SECOND_STUDENT_ID,
        student: studentRecordFixture({ id: SECOND_STUDENT_ID }),
      }),
    ]),
    findOwnedActiveEnrollmentForStudent: jest.fn(),
    findOwnedEnrollmentById: jest.fn(),
    findOwnedClassroomEnrollment: jest.fn(),
  } as unknown as jest.Mocked<ParentAppGuardianReadAdapter>;

  return {
    service: new ParentAppAccessService(adapter),
    adapter,
  };
}

function guardianFixture(
  overrides?: Partial<ParentAppGuardianRecord>,
): ParentAppGuardianRecord {
  return {
    id: GUARDIAN_ID,
    schoolId: SCHOOL_ID,
    organizationId: ORGANIZATION_ID,
    userId: PARENT_USER_ID,
    deletedAt: null,
    user: {
      id: PARENT_USER_ID,
      userType: UserType.PARENT,
      status: UserStatus.ACTIVE,
      deletedAt: null,
    },
    ...overrides,
  };
}

function studentRecordFixture(overrides?: {
  id?: string;
  schoolId?: string;
  organizationId?: string;
  status?: StudentStatus;
  deletedAt?: Date | null;
}): NonNullable<ParentAppStudentGuardianLinkRecord['student']> {
  return {
    id: overrides?.id ?? STUDENT_ID,
    schoolId: overrides?.schoolId ?? SCHOOL_ID,
    organizationId: overrides?.organizationId ?? ORGANIZATION_ID,
    status: overrides?.status ?? StudentStatus.ACTIVE,
    deletedAt: overrides?.deletedAt ?? null,
  };
}

function linkFixture(
  overrides?: Partial<ParentAppStudentGuardianLinkRecord>,
): ParentAppStudentGuardianLinkRecord {
  return {
    id: 'link-1',
    schoolId: SCHOOL_ID,
    studentId: STUDENT_ID,
    guardianId: GUARDIAN_ID,
    student: studentRecordFixture(),
    ...overrides,
  };
}

function enrollmentFixture(
  overrides?: Partial<ParentAppEnrollmentRecord>,
): ParentAppEnrollmentRecord {
  return {
    id: ENROLLMENT_ID,
    schoolId: SCHOOL_ID,
    studentId: STUDENT_ID,
    academicYearId: 'year-1',
    termId: 'term-1',
    classroomId: CLASSROOM_ID,
    status: StudentEnrollmentStatus.ACTIVE,
    deletedAt: null,
    student: studentRecordFixture(),
    ...overrides,
  };
}

describe('Parent App Home/Children/Profile routes (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationAId: string;
  let organizationBId: string;
  let schoolAId: string;
  let schoolBId: string;
  let academicYearAId: string;
  let termAId: string;
  let classroomAId: string;
  let parentEmail: string;
  let adminEmail: string;
  let teacherEmail: string;
  let studentEmail: string;
  let parentUserId: string;
  let guardianAId: string;
  let ownedStudentAId: string;
  let secondOwnedStudentAId: string;
  let sameSchoolUnlinkedStudentId: string;
  let crossSchoolLinkedStudentId: string;
  let ownedEnrollmentAId: string;
  let secondOwnedEnrollmentAId: string;

  const testSuffix = `parent-app-security-${Date.now()}`;
  const createdUserIds: string[] = [];
  const createdGuardianIds: string[] = [];
  const createdStudentGuardianIds: string[] = [];
  const createdStudentIds: string[] = [];
  const createdEnrollmentIds: string[] = [];
  const createdClassroomIds: string[] = [];
  const createdSectionIds: string[] = [];
  const createdGradeIds: string[] = [];
  const createdStageIds: string[] = [];
  const createdTermIds: string[] = [];
  const createdYearIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdOrganizationIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [parentRole, schoolAdminRole, teacherRole, studentRole] =
      await Promise.all([
        findSystemRole('parent'),
        findSystemRole('school_admin'),
        findSystemRole('teacher'),
        findSystemRole('student'),
      ]);

    const organizationA = await prisma.organization.create({
      data: {
        slug: `${testSuffix}-org-a`,
        name: `${testSuffix} Org A`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    organizationAId = organizationA.id;
    createdOrganizationIds.push(organizationA.id);

    const organizationB = await prisma.organization.create({
      data: {
        slug: `${testSuffix}-org-b`,
        name: `${testSuffix} Org B`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    organizationBId = organizationB.id;
    createdOrganizationIds.push(organizationB.id);

    const schoolA = await prisma.school.create({
      data: {
        organizationId: organizationAId,
        slug: `${testSuffix}-school-a`,
        name: `${testSuffix} School A`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    schoolAId = schoolA.id;
    createdSchoolIds.push(schoolA.id);

    const schoolB = await prisma.school.create({
      data: {
        organizationId: organizationBId,
        slug: `${testSuffix}-school-b`,
        name: `${testSuffix} School B`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    schoolBId = schoolB.id;
    createdSchoolIds.push(schoolB.id);

    await prisma.schoolProfile.create({
      data: {
        schoolId: schoolAId,
        schoolName: `${testSuffix} Parent Academy`,
        logoUrl: 'raw-parent-logo-should-not-be-returned',
      },
    });

    parentEmail = `${testSuffix}-parent@example.test`;
    adminEmail = `${testSuffix}-admin@example.test`;
    teacherEmail = `${testSuffix}-teacher@example.test`;
    studentEmail = `${testSuffix}-student@example.test`;

    parentUserId = await createUserWithMembership({
      email: parentEmail,
      userType: UserType.PARENT,
      roleId: parentRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
      firstName: 'Mona',
      lastName: 'Parent',
    });
    await createUserWithMembership({
      email: adminEmail,
      userType: UserType.SCHOOL_USER,
      roleId: schoolAdminRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    await createUserWithMembership({
      email: teacherEmail,
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    await createUserWithMembership({
      email: studentEmail,
      userType: UserType.STUDENT,
      roleId: studentRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });

    const academicA = await createAcademicFixture({
      organizationId: organizationAId,
      schoolId: schoolAId,
      marker: 'a',
    });
    academicYearAId = academicA.academicYearId;
    termAId = academicA.termId;
    classroomAId = academicA.classroomId;

    const firstChild = await createStudentWithEnrollment({
      organizationId: organizationAId,
      schoolId: schoolAId,
      academicYearId: academicYearAId,
      termId: termAId,
      classroomId: classroomAId,
      firstName: 'Sara',
      lastName: 'Child',
    });
    ownedStudentAId = firstChild.studentId;
    ownedEnrollmentAId = firstChild.enrollmentId;

    const secondChild = await createStudentWithEnrollment({
      organizationId: organizationAId,
      schoolId: schoolAId,
      academicYearId: academicYearAId,
      termId: termAId,
      classroomId: classroomAId,
      firstName: 'Omar',
      lastName: 'Child',
    });
    secondOwnedStudentAId = secondChild.studentId;
    secondOwnedEnrollmentAId = secondChild.enrollmentId;

    const unlinkedChild = await createStudentWithEnrollment({
      organizationId: organizationAId,
      schoolId: schoolAId,
      academicYearId: academicYearAId,
      termId: termAId,
      classroomId: classroomAId,
      firstName: 'Unlinked',
      lastName: 'Child',
    });
    sameSchoolUnlinkedStudentId = unlinkedChild.studentId;

    guardianAId = await createGuardian({
      organizationId: organizationAId,
      schoolId: schoolAId,
      userId: parentUserId,
      relation: 'mother',
      isPrimary: true,
      marker: 'current-school',
    });
    await linkGuardianToStudent({
      schoolId: schoolAId,
      studentId: ownedStudentAId,
      guardianId: guardianAId,
      isPrimary: true,
    });
    await linkGuardianToStudent({
      schoolId: schoolAId,
      studentId: secondOwnedStudentAId,
      guardianId: guardianAId,
      isPrimary: false,
    });

    const academicB = await createAcademicFixture({
      organizationId: organizationBId,
      schoolId: schoolBId,
      marker: 'b',
    });
    const crossSchoolChild = await createStudentWithEnrollment({
      organizationId: organizationBId,
      schoolId: schoolBId,
      academicYearId: academicB.academicYearId,
      termId: academicB.termId,
      classroomId: academicB.classroomId,
      firstName: 'Cross',
      lastName: 'School',
    });
    crossSchoolLinkedStudentId = crossSchoolChild.studentId;

    const guardianBId = await createGuardian({
      organizationId: organizationBId,
      schoolId: schoolBId,
      userId: parentUserId,
      relation: 'father',
      isPrimary: true,
      marker: 'cross-school',
    });
    await linkGuardianToStudent({
      schoolId: schoolBId,
      studentId: crossSchoolLinkedStudentId,
      guardianId: guardianBId,
      isPrimary: true,
    });

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    try {
      await prisma.session.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.studentGuardian.deleteMany({
        where: { id: { in: createdStudentGuardianIds } },
      });
      await prisma.guardian.deleteMany({
        where: { id: { in: createdGuardianIds } },
      });
      await prisma.enrollment.deleteMany({
        where: { id: { in: createdEnrollmentIds } },
      });
      await prisma.student.deleteMany({
        where: { id: { in: createdStudentIds } },
      });
      await prisma.membership.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
      await prisma.classroom.deleteMany({
        where: { id: { in: createdClassroomIds } },
      });
      await prisma.section.deleteMany({
        where: { id: { in: createdSectionIds } },
      });
      await prisma.grade.deleteMany({
        where: { id: { in: createdGradeIds } },
      });
      await prisma.stage.deleteMany({
        where: { id: { in: createdStageIds } },
      });
      await prisma.term.deleteMany({
        where: { id: { in: createdTermIds } },
      });
      await prisma.academicYear.deleteMany({
        where: { id: { in: createdYearIds } },
      });
      await prisma.schoolProfile.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.school.deleteMany({
        where: { id: { in: createdSchoolIds } },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: createdOrganizationIds } },
      });
    } finally {
      if (app) await app.close();
      await prisma.$disconnect();
    }
  });

  it('linked parent can read own home', async () => {
    const { accessToken } = await login(parentEmail);

    const home = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/home`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(home.body.parent).toMatchObject({
      userId: parentUserId,
      displayName: 'Mona Parent',
      email: parentEmail,
      phone: null,
    });
    expect(home.body.school).toEqual({
      name: `${testSuffix} Parent Academy`,
      logoUrl: null,
    });
    expect(home.body.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          studentId: ownedStudentAId,
          enrollmentId: ownedEnrollmentAId,
        }),
        expect.objectContaining({
          studentId: secondOwnedStudentAId,
          enrollmentId: secondOwnedEnrollmentAId,
        }),
      ]),
    );
    expect(home.body.summaries.childrenCount).toBe(2);
    expect(home.body.schedule).toEqual({
      available: false,
      reason: 'timetable_not_available',
    });
    expect(JSON.stringify(home.body)).not.toContain(crossSchoolLinkedStudentId);
    assertNoForbiddenParentAppFields(home.body);
  });

  it('linked parent can list own current-school children and read owned child detail', async () => {
    const { accessToken } = await login(parentEmail);

    const list = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/children`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(list.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          studentId: ownedStudentAId,
          displayName: 'Sara Child',
          enrollmentId: ownedEnrollmentAId,
        }),
        expect.objectContaining({
          studentId: secondOwnedStudentAId,
          displayName: 'Omar Child',
          enrollmentId: secondOwnedEnrollmentAId,
        }),
      ]),
    );
    expect(JSON.stringify(list.body)).not.toContain(crossSchoolLinkedStudentId);
    assertNoForbiddenParentAppFields(list.body);

    const detail = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/children/${ownedStudentAId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(detail.body.student).toMatchObject({
      studentId: ownedStudentAId,
      displayName: 'Sara Child',
      avatarUrl: null,
      status: 'active',
    });
    expect(detail.body.enrollment).toMatchObject({
      enrollmentId: ownedEnrollmentAId,
      academicYearId: academicYearAId,
      termId: termAId,
      classroom: { id: classroomAId },
    });
    expect(detail.body.summaries).toMatchObject({
      attendance: {
        available: false,
        reason: 'detailed_attendance_not_in_this_slice',
      },
      grades: { available: false, reason: 'grades_slice_not_loaded' },
      behavior: { available: false, reason: 'behavior_slice_not_loaded' },
      progress: { available: false, reason: 'progress_slice_not_loaded' },
    });
    expect(detail.body.unsupported).toEqual({
      schedule: true,
      homeworks: true,
      pickup: true,
    });
    assertNoForbiddenParentAppFields(detail.body);
  });

  it('linked parent can read own profile with guardian and current-school child summaries', async () => {
    const { accessToken } = await login(parentEmail);

    const profile = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/profile`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(profile.body.parent).toMatchObject({
      userId: parentUserId,
      displayName: 'Mona Parent',
      firstName: 'Mona',
      lastName: 'Parent',
      email: parentEmail,
      avatarUrl: null,
    });
    expect(profile.body.guardians).toEqual([
      {
        guardianId: guardianAId,
        relationship: 'mother',
        isPrimary: true,
      },
    ]);
    expect(profile.body.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          studentId: ownedStudentAId,
          enrollmentId: ownedEnrollmentAId,
        }),
        expect.objectContaining({
          studentId: secondOwnedStudentAId,
          enrollmentId: secondOwnedEnrollmentAId,
        }),
      ]),
    );
    expect(profile.body.unsupported).toEqual({
      avatarUpload: true,
      preferences: true,
      supportTickets: true,
      addChild: true,
    });
    expect(JSON.stringify(profile.body)).not.toContain(
      crossSchoolLinkedStudentId,
    );
    assertNoForbiddenParentAppFields(profile.body);
  });

  it('returns safe 404 for same-school unlinked and cross-school child details', async () => {
    const { accessToken } = await login(parentEmail);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/children/${sameSchoolUnlinkedStudentId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/children/${crossSchoolLinkedStudentId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  it('forbids school admin, teacher, and student actors on Parent App routes', async () => {
    for (const email of [adminEmail, teacherEmail, studentEmail]) {
      const { accessToken } = await login(email);

      for (const path of [
        'home',
        'children',
        `children/${ownedStudentAId}`,
        'profile',
      ]) {
        await request(app.getHttpServer())
          .get(`${GLOBAL_PREFIX}/parent/${path}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(403);
      }
    }
  });

  it('does not expose mutation, avatar upload, add-child, or deferred Parent App routes', async () => {
    const { accessToken } = await login(parentEmail);

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/parent/profile`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ firstName: 'Changed' })
      .expect(404);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/profile/avatar`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(404);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/children`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(404);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/add-child`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(404);

    for (const path of [
      'schedule',
      'homework',
      'homeworks',
      'pickup',
      'messages',
      'announcements',
      'notifications',
      'grades',
      'behavior',
      'progress',
      'reports',
      'tasks',
      'applicant-portal',
      'add-child',
    ]) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/parent/${path}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    }
  });

  async function findSystemRole(key: string): Promise<{ id: string }> {
    const role = await prisma.role.findFirst({
      where: { key, schoolId: null, isSystem: true },
      select: { id: true },
    });
    if (!role) throw new Error(`${key} system role not found - run seed.`);
    return role;
  }

  async function createUserWithMembership(params: {
    email: string;
    userType: UserType;
    roleId: string;
    organizationId: string;
    schoolId: string;
    firstName?: string;
    lastName?: string;
  }): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: params.email,
        firstName: params.firstName ?? 'ParentApp',
        lastName: params.lastName ?? params.userType.toLowerCase(),
        userType: params.userType,
        status: UserStatus.ACTIVE,
        passwordHash: await argon2.hash(E2E_PASSWORD, ARGON2_OPTIONS),
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

    return user.id;
  }

  async function createAcademicFixture(params: {
    organizationId: string;
    schoolId: string;
    marker: string;
  }): Promise<{
    academicYearId: string;
    termId: string;
    classroomId: string;
  }> {
    const year = await prisma.academicYear.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `${testSuffix}-year-${params.marker}-ar`,
        nameEn: `${testSuffix}-year-${params.marker}`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-06-30T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    createdYearIds.push(year.id);

    const term = await prisma.term.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: year.id,
        nameAr: `${testSuffix}-term-${params.marker}-ar`,
        nameEn: `${testSuffix}-term-${params.marker}`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    createdTermIds.push(term.id);

    const stage = await prisma.stage.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `${testSuffix}-stage-${params.marker}-ar`,
        nameEn: `${testSuffix}-stage-${params.marker}`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    createdStageIds.push(stage.id);

    const grade = await prisma.grade.create({
      data: {
        schoolId: params.schoolId,
        stageId: stage.id,
        nameAr: `${testSuffix}-grade-${params.marker}-ar`,
        nameEn: `${testSuffix}-grade-${params.marker}`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    createdGradeIds.push(grade.id);

    const section = await prisma.section.create({
      data: {
        schoolId: params.schoolId,
        gradeId: grade.id,
        nameAr: `${testSuffix}-section-${params.marker}-ar`,
        nameEn: `${testSuffix}-section-${params.marker}`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    createdSectionIds.push(section.id);

    const classroom = await prisma.classroom.create({
      data: {
        schoolId: params.schoolId,
        sectionId: section.id,
        nameAr: `${testSuffix}-classroom-${params.marker}-ar`,
        nameEn: `${testSuffix}-classroom-${params.marker}`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    createdClassroomIds.push(classroom.id);

    return {
      academicYearId: year.id,
      termId: term.id,
      classroomId: classroom.id,
    };
  }

  async function createStudentWithEnrollment(params: {
    organizationId: string;
    schoolId: string;
    academicYearId: string;
    termId: string;
    classroomId: string;
    firstName: string;
    lastName: string;
  }): Promise<{ studentId: string; enrollmentId: string }> {
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
    createdStudentIds.push(student.id);

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
    createdEnrollmentIds.push(enrollment.id);

    return { studentId: student.id, enrollmentId: enrollment.id };
  }

  async function createGuardian(params: {
    organizationId: string;
    schoolId: string;
    userId: string;
    relation: string;
    isPrimary: boolean;
    marker: string;
  }): Promise<string> {
    const guardian = await prisma.guardian.create({
      data: {
        schoolId: params.schoolId,
        organizationId: params.organizationId,
        userId: params.userId,
        firstName: 'Mona',
        lastName: `Guardian ${params.marker}`,
        phone: `${testSuffix}-${params.marker}-phone`,
        email: `${testSuffix}-${params.marker}-guardian@example.test`,
        relation: params.relation,
        isPrimary: params.isPrimary,
      },
      select: { id: true },
    });
    createdGuardianIds.push(guardian.id);

    return guardian.id;
  }

  async function linkGuardianToStudent(params: {
    schoolId: string;
    studentId: string;
    guardianId: string;
    isPrimary: boolean;
  }): Promise<void> {
    const link = await prisma.studentGuardian.create({
      data: {
        schoolId: params.schoolId,
        studentId: params.studentId,
        guardianId: params.guardianId,
        isPrimary: params.isPrimary,
      },
      select: { id: true },
    });
    createdStudentGuardianIds.push(link.id);
  }

  async function login(email: string): Promise<{ accessToken: string }> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: E2E_PASSWORD })
      .expect(200);

    return { accessToken: response.body.accessToken };
  }

  function assertNoForbiddenParentAppFields(body: unknown): void {
    const serialized = JSON.stringify(body);
    for (const forbidden of [
      'schoolId',
      'organizationId',
      'scheduleId',
      'raw-parent-logo-should-not-be-returned',
      'medical',
      'allergy',
      'condition',
      'medication',
      'document',
      'internalNote',
      'password',
      'passwordHash',
      'session',
      'refreshToken',
      'bucket',
      'objectKey',
      'storageKey',
      'applicationId',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  }
});
