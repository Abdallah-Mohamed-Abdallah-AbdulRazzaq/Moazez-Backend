import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  ReinforcementSource,
  ReinforcementTaskStatus,
  SchoolStatus,
  StudentEnrollmentStatus,
  StudentStatus,
  UserStatus,
  UserType,
  XpSourceType,
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
import { StudentAppAccessService } from '../../src/modules/student-app/access/student-app-access.service';
import { StudentAppStudentReadAdapter } from '../../src/modules/student-app/access/student-app-student-read.adapter';
import type {
  StudentAppEnrollmentRecord,
  StudentAppStudentRecord,
} from '../../src/modules/student-app/shared/student-app.types';

const STUDENT_USER_ID = 'student-user-1';
const STUDENT_ID = 'student-1';
const ENROLLMENT_ID = 'enrollment-1';
const CLASSROOM_ID = 'classroom-1';
const SCHOOL_ID = 'school-1';
const ORGANIZATION_ID = 'org-1';
const GLOBAL_PREFIX = '/api/v1';
const E2E_PASSWORD = 'StudentApp123!';
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(45000);

describe('Student App ownership foundation (security)', () => {
  it('does not allow a linked student identity to access another same-school student', async () => {
    const { service, adapter } = createValidService();
    adapter.findOwnedStudentById.mockResolvedValue(null);

    await expect(
      withStudentRequestContext(() =>
        service.assertStudentOwnsStudent('same-school-other-student'),
      ),
    ).rejects.toMatchObject({
      code: 'student_app.student.not_found',
    });
    expect(adapter.findOwnedStudentById).toHaveBeenCalledWith({
      studentId: 'same-school-other-student',
      studentUserId: STUDENT_USER_ID,
    });
  });

  it('hides cross-school guessed student, enrollment, and classroom ids', async () => {
    const { service, adapter } = createValidService();
    adapter.findOwnedStudentById.mockResolvedValue(null);
    adapter.findOwnedEnrollmentById.mockResolvedValue(null);
    adapter.findOwnedClassroomEnrollment.mockResolvedValue(null);

    await expect(
      withStudentRequestContext(() =>
        service.assertStudentOwnsStudent('cross-school-student'),
      ),
    ).rejects.toMatchObject({
      code: 'student_app.student.not_found',
    });
    await expect(
      withStudentRequestContext(() =>
        service.assertStudentOwnsEnrollment('cross-school-enrollment'),
      ),
    ).rejects.toMatchObject({
      code: 'student_app.enrollment.not_found',
    });
    await expect(
      withStudentRequestContext(() =>
        service.assertStudentOwnsClassroom('cross-school-classroom'),
      ),
    ).rejects.toMatchObject({
      code: 'student_app.classroom.not_found',
    });
  });

  it('requires the authenticated actor to be a student with an active school membership', async () => {
    const { service } = createValidService();

    await expect(
      withStudentRequestContext(() => service.getStudentAppContext(), {
        userType: UserType.TEACHER,
      }),
    ).rejects.toMatchObject({
      code: 'student_app.actor.required_student',
    });

    await expect(
      runWithRequestContext(createRequestContext(), async () => {
        setActor({ id: STUDENT_USER_ID, userType: UserType.STUDENT });
        return service.getStudentAppContext();
      }),
    ).rejects.toMatchObject({
      code: 'student_app.actor.required_student',
    });
  });
});

async function withStudentRequestContext<T>(
  fn: () => T | Promise<T>,
  options?: { userType?: UserType },
): Promise<T> {
  return runWithRequestContext(createRequestContext(), async () => {
    setActor({
      id: STUDENT_USER_ID,
      userType: options?.userType ?? UserType.STUDENT,
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
  service: StudentAppAccessService;
  adapter: jest.Mocked<StudentAppStudentReadAdapter>;
} {
  const adapter = {
    findLinkedStudentByUserId: jest.fn().mockResolvedValue(studentFixture()),
    findActiveEnrollmentForStudent: jest
      .fn()
      .mockResolvedValue(enrollmentFixture()),
    findOwnedStudentById: jest.fn(),
    findOwnedEnrollmentById: jest.fn(),
    findOwnedClassroomEnrollment: jest.fn(),
  } as unknown as jest.Mocked<StudentAppStudentReadAdapter>;

  return {
    service: new StudentAppAccessService(adapter),
    adapter,
  };
}

function studentFixture(): StudentAppStudentRecord {
  return {
    id: STUDENT_ID,
    schoolId: SCHOOL_ID,
    organizationId: ORGANIZATION_ID,
    userId: STUDENT_USER_ID,
    status: StudentStatus.ACTIVE,
    deletedAt: null,
    user: {
      id: STUDENT_USER_ID,
      userType: UserType.STUDENT,
      status: UserStatus.ACTIVE,
      deletedAt: null,
    },
  };
}

function enrollmentFixture(): StudentAppEnrollmentRecord {
  return {
    id: ENROLLMENT_ID,
    schoolId: SCHOOL_ID,
    studentId: STUDENT_ID,
    academicYearId: 'year-1',
    termId: null,
    classroomId: CLASSROOM_ID,
    status: StudentEnrollmentStatus.ACTIVE,
    deletedAt: null,
  };
}

describe('Student App Home/Profile routes (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationId: string;
  let schoolId: string;
  let academicYearId: string;
  let termId: string;
  let classroomId: string;
  let linkedStudentUserId: string;
  let linkedStudentId: string;
  let linkedEnrollmentId: string;
  let linkedStudentEmail: string;
  let unlinkedStudentEmail: string;
  let noEnrollmentStudentEmail: string;
  let adminEmail: string;
  let teacherEmail: string;
  let parentEmail: string;

  const testSuffix = `student-app-security-${Date.now()}`;
  const createdUserIds: string[] = [];
  const createdStudentIds: string[] = [];
  const createdEnrollmentIds: string[] = [];
  const createdXpLedgerIds: string[] = [];
  const createdAssignmentIds: string[] = [];
  const createdTaskIds: string[] = [];
  const createdAllocationIds: string[] = [];
  const createdSubjectIds: string[] = [];
  const createdClassroomIds: string[] = [];
  const createdSectionIds: string[] = [];
  const createdGradeIds: string[] = [];
  const createdStageIds: string[] = [];
  const createdTermIds: string[] = [];
  const createdYearIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [studentRole, schoolAdminRole, teacherRole, parentRole] =
      await Promise.all([
        findSystemRole('student'),
        findSystemRole('school_admin'),
        findSystemRole('teacher'),
        findSystemRole('parent'),
      ]);

    const organization = await prisma.organization.create({
      data: {
        slug: `${testSuffix}-org`,
        name: `${testSuffix} Org`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    organizationId = organization.id;

    const school = await prisma.school.create({
      data: {
        organizationId,
        slug: `${testSuffix}-school`,
        name: `${testSuffix} School`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    schoolId = school.id;

    await prisma.schoolProfile.create({
      data: {
        schoolId,
        schoolName: `${testSuffix} Profile School`,
        shortName: `${testSuffix} PS`,
      },
    });

    adminEmail = `${testSuffix}-admin@example.test`;
    teacherEmail = `${testSuffix}-teacher@example.test`;
    parentEmail = `${testSuffix}-parent@example.test`;
    linkedStudentEmail = `${testSuffix}-linked-student@example.test`;
    unlinkedStudentEmail = `${testSuffix}-unlinked-student@example.test`;
    noEnrollmentStudentEmail = `${testSuffix}-no-enrollment@example.test`;

    await createUserWithMembership({
      email: adminEmail,
      userType: UserType.SCHOOL_USER,
      roleId: schoolAdminRole.id,
    });
    const teacherUserId = await createUserWithMembership({
      email: teacherEmail,
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
    });
    await createUserWithMembership({
      email: parentEmail,
      userType: UserType.PARENT,
      roleId: parentRole.id,
    });
    linkedStudentUserId = await createUserWithMembership({
      email: linkedStudentEmail,
      userType: UserType.STUDENT,
      roleId: studentRole.id,
    });
    await createUserWithMembership({
      email: unlinkedStudentEmail,
      userType: UserType.STUDENT,
      roleId: studentRole.id,
    });
    const noEnrollmentStudentUserId = await createUserWithMembership({
      email: noEnrollmentStudentEmail,
      userType: UserType.STUDENT,
      roleId: studentRole.id,
    });

    const academic = await createAcademicFixture(teacherUserId);
    academicYearId = academic.academicYearId;
    termId = academic.termId;
    classroomId = academic.classroomId;

    const linkedStudent = await prisma.student.create({
      data: {
        schoolId,
        organizationId,
        userId: linkedStudentUserId,
        firstName: 'Linked',
        lastName: 'Student',
        status: StudentStatus.ACTIVE,
      },
      select: { id: true },
    });
    linkedStudentId = linkedStudent.id;
    createdStudentIds.push(linkedStudent.id);

    const noEnrollmentStudent = await prisma.student.create({
      data: {
        schoolId,
        organizationId,
        userId: noEnrollmentStudentUserId,
        firstName: 'NoEnrollment',
        lastName: 'Student',
        status: StudentStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdStudentIds.push(noEnrollmentStudent.id);

    const enrollment = await prisma.enrollment.create({
      data: {
        schoolId,
        studentId: linkedStudentId,
        academicYearId,
        termId,
        classroomId,
        status: StudentEnrollmentStatus.ACTIVE,
        enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
      },
      select: { id: true },
    });
    linkedEnrollmentId = enrollment.id;
    createdEnrollmentIds.push(enrollment.id);

    const task = await prisma.reinforcementTask.create({
      data: {
        schoolId,
        academicYearId,
        termId,
        titleEn: `${testSuffix} Student Task`,
        source: ReinforcementSource.TEACHER,
        status: ReinforcementTaskStatus.NOT_COMPLETED,
        assignedById: teacherUserId,
        createdById: teacherUserId,
      },
      select: { id: true },
    });
    createdTaskIds.push(task.id);

    const assignment = await prisma.reinforcementAssignment.create({
      data: {
        schoolId,
        taskId: task.id,
        academicYearId,
        termId,
        studentId: linkedStudentId,
        enrollmentId: linkedEnrollmentId,
        status: ReinforcementTaskStatus.NOT_COMPLETED,
        progress: 0,
      },
      select: { id: true },
    });
    createdAssignmentIds.push(assignment.id);

    const xpLedger = await prisma.xpLedger.create({
      data: {
        schoolId,
        academicYearId,
        termId,
        studentId: linkedStudentId,
        enrollmentId: linkedEnrollmentId,
        sourceType: XpSourceType.SYSTEM,
        sourceId: `${testSuffix}-xp-source`,
        amount: 25,
        reason: 'Student App security fixture',
      },
      select: { id: true },
    });
    createdXpLedgerIds.push(xpLedger.id);

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
      await prisma.xpLedger.deleteMany({
        where: { id: { in: createdXpLedgerIds } },
      });
      await prisma.reinforcementAssignment.deleteMany({
        where: { id: { in: createdAssignmentIds } },
      });
      await prisma.reinforcementTask.deleteMany({
        where: { id: { in: createdTaskIds } },
      });
      await prisma.teacherSubjectAllocation.deleteMany({
        where: { id: { in: createdAllocationIds } },
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
      await prisma.subject.deleteMany({
        where: { id: { in: createdSubjectIds } },
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
      if (schoolId) {
        await prisma.schoolProfile.deleteMany({ where: { schoolId } });
        await prisma.school.deleteMany({ where: { id: schoolId } });
      }
      if (organizationId) {
        await prisma.organization.deleteMany({ where: { id: organizationId } });
      }
    } finally {
      if (app) await app.close();
      await prisma.$disconnect();
    }
  });

  it('allows a linked student to read own home and profile', async () => {
    const { accessToken } = await login(linkedStudentEmail);

    const home = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/home`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(home.body.student).toMatchObject({
      studentId: linkedStudentId,
      displayName: 'Linked Student',
      avatarUrl: null,
    });
    expect(home.body.enrollment).toMatchObject({
      enrollmentId: linkedEnrollmentId,
      academicYearId,
      termId,
      classroom: { id: classroomId },
    });
    expect(home.body.today.schedule).toEqual({
      available: false,
      reason: 'timetable_not_available',
    });
    expect(home.body.summaries).toMatchObject({
      subjectsCount: 1,
      pendingTasksCount: 1,
      totalXp: 25,
      behaviorPoints: null,
    });
    assertNoForbiddenStudentAppFields(home.body);

    const profile = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/profile`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(profile.body.student).toMatchObject({
      studentId: linkedStudentId,
      userId: linkedStudentUserId,
      displayName: 'Linked Student',
      email: linkedStudentEmail,
      avatarUrl: null,
      studentNumber: null,
      status: 'active',
    });
    expect(profile.body.unsupported).toEqual({
      avatarUpload: true,
      preferences: true,
      seatNumber: true,
    });
    assertNoForbiddenStudentAppFields(profile.body);
  });

  it('forbids non-student actors from home and profile', async () => {
    for (const email of [adminEmail, teacherEmail, parentEmail]) {
      const { accessToken } = await login(email);

      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/student/home`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/student/profile`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    }
  });

  it('rejects an unlinked student user', async () => {
    const { accessToken } = await login(unlinkedStudentEmail);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/home`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/profile`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  it('rejects a linked student without an active enrollment', async () => {
    const { accessToken } = await login(noEnrollmentStudentEmail);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/home`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/profile`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  it('does not expose mutation or avatar upload routes', async () => {
    const { accessToken } = await login(linkedStudentEmail);

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/student/profile`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ firstName: 'Changed' })
      .expect(404);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/student/profile/avatar`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  it('does not expose schedule, homework, pickup, messages, announcements, or notifications routes', async () => {
    const { accessToken } = await login(linkedStudentEmail);

    for (const path of [
      'schedule',
      'homework',
      'homeworks',
      'pickup',
      'messages',
      'announcements',
      'notifications',
    ]) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/student/${path}`)
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
  }): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: params.email,
        firstName: 'StudentApp',
        lastName: params.userType.toLowerCase(),
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
        organizationId,
        schoolId,
        roleId: params.roleId,
        userType: params.userType,
        status: MembershipStatus.ACTIVE,
      },
    });

    return user.id;
  }

  async function createAcademicFixture(teacherUserId: string): Promise<{
    academicYearId: string;
    termId: string;
    classroomId: string;
  }> {
    const year = await prisma.academicYear.create({
      data: {
        schoolId,
        nameAr: `${testSuffix}-year-ar`,
        nameEn: `${testSuffix}-year`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-06-30T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    createdYearIds.push(year.id);

    const term = await prisma.term.create({
      data: {
        schoolId,
        academicYearId: year.id,
        nameAr: `${testSuffix}-term-ar`,
        nameEn: `${testSuffix}-term`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    createdTermIds.push(term.id);

    const stage = await prisma.stage.create({
      data: {
        schoolId,
        nameAr: `${testSuffix}-stage-ar`,
        nameEn: `${testSuffix}-stage`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    createdStageIds.push(stage.id);

    const grade = await prisma.grade.create({
      data: {
        schoolId,
        stageId: stage.id,
        nameAr: `${testSuffix}-grade-ar`,
        nameEn: `${testSuffix}-grade`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    createdGradeIds.push(grade.id);

    const section = await prisma.section.create({
      data: {
        schoolId,
        gradeId: grade.id,
        nameAr: `${testSuffix}-section-ar`,
        nameEn: `${testSuffix}-section`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    createdSectionIds.push(section.id);

    const classroom = await prisma.classroom.create({
      data: {
        schoolId,
        sectionId: section.id,
        nameAr: `${testSuffix}-classroom-ar`,
        nameEn: `${testSuffix}-classroom`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    createdClassroomIds.push(classroom.id);

    const subject = await prisma.subject.create({
      data: {
        schoolId,
        nameAr: `${testSuffix}-subject-ar`,
        nameEn: `${testSuffix}-subject`,
        code: `${testSuffix.toUpperCase()}-SUBJECT`,
        isActive: true,
      },
      select: { id: true },
    });
    createdSubjectIds.push(subject.id);

    const allocation = await prisma.teacherSubjectAllocation.create({
      data: {
        schoolId,
        teacherUserId,
        subjectId: subject.id,
        classroomId: classroom.id,
        termId: term.id,
      },
      select: { id: true },
    });
    createdAllocationIds.push(allocation.id);

    return {
      academicYearId: year.id,
      termId: term.id,
      classroomId: classroom.id,
    };
  }

  async function login(email: string): Promise<{ accessToken: string }> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: E2E_PASSWORD })
      .expect(200);

    return { accessToken: response.body.accessToken };
  }

  function assertNoForbiddenStudentAppFields(body: unknown): void {
    const serialized = JSON.stringify(body);
    for (const forbidden of [
      'schoolId',
      'organizationId',
      'scheduleId',
      'guardian',
      'medical',
      'document',
      'note',
      'password',
      'session',
      'token',
      'applicationId',
      'bucket',
      'objectKey',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  }
});
