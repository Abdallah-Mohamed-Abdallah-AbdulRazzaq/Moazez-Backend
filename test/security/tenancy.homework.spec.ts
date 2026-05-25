import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  HomeworkAssignmentMode,
  HomeworkAssignmentStatus,
  HomeworkTargetMode,
  HomeworkTargetStatus,
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  SchoolStatus,
  StudentEnrollmentStatus,
  StudentStatus,
  TimetableConfigStatus,
  TimetableEntryStatus,
  TimetablePeriodType,
  TimetablePublicationStatus,
  TimetableScopeType,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';

const GLOBAL_PREFIX = '/api/v1';

const DEMO_ADMIN_EMAIL = 'admin@academy.moazez.dev';
const DEMO_ADMIN_PASSWORD = 'School123!';

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(45000);

function expectNoTenantIds(body: unknown): void {
  const serialized = JSON.stringify(body);
  expect(serialized).not.toContain('schoolId');
  expect(serialized).not.toContain('organizationId');
}

describe('Homework tenancy isolation (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  const suffix = `homework-security-${Date.now()}`;

  let demoOrganizationId: string;
  let demoSchoolId: string;
  let tenantBOrganizationId: string;
  let tenantBSchoolId: string;

  let demoYearId: string;
  let demoTermId: string;
  let demoClassroomId: string;
  let demoSubjectId: string;
  let demoTeacherId: string;
  let demoAllocationId: string;
  let demoTimetableEntryId: string;
  let demoStudentId: string;
  let demoStudentTwoId: string;
  let demoEnrollmentId: string;
  let demoEnrollmentTwoId: string;
  let demoHomeworkId: string;

  let tenantBAllocationId: string;
  let tenantBStudentId: string;
  let tenantBHomeworkId: string;
  let otherTeacherAllocationId: string;
  let otherTeacherHomeworkId: string;

  let viewOnlyEmail: string;
  let manageOnlyEmail: string;
  let teacherEmail: string;
  let studentEmail: string;
  let parentEmail: string;
  let studentUserId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const demoSchool = await prisma.school.findFirst({
      where: { slug: 'moazez-academy' },
      select: { id: true, organizationId: true },
    });
    if (!demoSchool) {
      throw new Error('Demo school not found - run `npm run seed` first.');
    }
    demoSchoolId = demoSchool.id;
    demoOrganizationId = demoSchool.organizationId;

    const [
      schoolAdminRole,
      teacherRole,
      studentRole,
      parentRole,
      assignmentsViewPermission,
      assignmentsManagePermission,
      targetsViewPermission,
      targetsManagePermission,
    ] = await Promise.all([
      prisma.role.findFirst({
        where: { key: 'school_admin', schoolId: null, isSystem: true },
        select: { id: true },
      }),
      prisma.role.findFirst({
        where: { key: 'teacher', schoolId: null, isSystem: true },
        select: { id: true },
      }),
      prisma.role.findFirst({
        where: { key: 'student', schoolId: null, isSystem: true },
        select: { id: true },
      }),
      prisma.role.findFirst({
        where: { key: 'parent', schoolId: null, isSystem: true },
        select: { id: true },
      }),
      prisma.permission.findUnique({
        where: { code: 'homework.assignments.view' },
        select: { id: true },
      }),
      prisma.permission.findUnique({
        where: { code: 'homework.assignments.manage' },
        select: { id: true },
      }),
      prisma.permission.findUnique({
        where: { code: 'homework.targets.view' },
        select: { id: true },
      }),
      prisma.permission.findUnique({
        where: { code: 'homework.targets.manage' },
        select: { id: true },
      }),
    ]);

    if (
      !schoolAdminRole ||
      !teacherRole ||
      !studentRole ||
      !parentRole ||
      !assignmentsViewPermission ||
      !assignmentsManagePermission ||
      !targetsViewPermission ||
      !targetsManagePermission
    ) {
      throw new Error('Homework permissions missing - run `npm run seed`.');
    }

    const demoAdmin = await prisma.user.findUnique({
      where: { email: DEMO_ADMIN_EMAIL },
      select: { id: true },
    });
    if (!demoAdmin) {
      throw new Error('Demo admin not found - run `npm run seed` first.');
    }

    await prisma.membership.updateMany({
      where: {
        userId: demoAdmin.id,
        schoolId: demoSchoolId,
        deletedAt: null,
      },
      data: {
        roleId: schoolAdminRole.id,
        userType: UserType.SCHOOL_USER,
        status: MembershipStatus.ACTIVE,
        endedAt: null,
      },
    });

    const viewOnlyRole = await createRoleWithPermissions({
      key: `${suffix}-viewer`,
      name: 'Homework Security Viewer',
      permissionIds: [assignmentsViewPermission.id, targetsViewPermission.id],
    });
    const manageOnlyRole = await createRoleWithPermissions({
      key: `${suffix}-manager`,
      name: 'Homework Security Manager',
      permissionIds: [
        assignmentsManagePermission.id,
        targetsManagePermission.id,
      ],
    });

    viewOnlyEmail = `viewer@${suffix}.moazez.local`;
    manageOnlyEmail = `manager@${suffix}.moazez.local`;
    teacherEmail = `teacher@${suffix}.moazez.local`;
    studentEmail = `student@${suffix}.moazez.local`;
    parentEmail = `parent@${suffix}.moazez.local`;

    await createUserWithMembership({
      email: viewOnlyEmail,
      password: 'HomeworkView123!',
      roleId: viewOnlyRole.id,
      userType: UserType.SCHOOL_USER,
    });
    await createUserWithMembership({
      email: manageOnlyEmail,
      password: 'HomeworkManage123!',
      roleId: manageOnlyRole.id,
      userType: UserType.SCHOOL_USER,
    });
    demoTeacherId = await createUserWithMembership({
      email: teacherEmail,
      password: 'HomeworkTeacher123!',
      roleId: teacherRole.id,
      userType: UserType.TEACHER,
    });
    studentUserId = await createUserWithMembership({
      email: studentEmail,
      password: 'HomeworkStudent123!',
      roleId: studentRole.id,
      userType: UserType.STUDENT,
    });
    await createUserWithMembership({
      email: parentEmail,
      password: 'HomeworkParent123!',
      roleId: parentRole.id,
      userType: UserType.PARENT,
    });

    const tenantB = await createTenantB(schoolAdminRole.id);
    tenantBOrganizationId = tenantB.organizationId;
    tenantBSchoolId = tenantB.schoolId;

    const demoFixture = await createSchoolFixture({
      schoolId: demoSchoolId,
      organizationId: demoOrganizationId,
      teacherUserId: demoTeacherId,
      prefix: `${suffix}-a`,
    });
    demoYearId = demoFixture.yearId;
    demoTermId = demoFixture.termId;
    demoClassroomId = demoFixture.classroomId;
    demoSubjectId = demoFixture.subjectId;
    demoAllocationId = demoFixture.allocationId;
    demoTimetableEntryId = demoFixture.timetableEntryId;
    demoStudentId = demoFixture.studentId;
    demoStudentTwoId = demoFixture.studentTwoId;
    demoEnrollmentId = demoFixture.enrollmentId;
    demoEnrollmentTwoId = demoFixture.enrollmentTwoId;
    demoHomeworkId = demoFixture.homeworkId;
    await prisma.student.update({
      where: { id: demoStudentId },
      data: { userId: studentUserId },
    });

    const otherTeacherId = await createUserWithMembership({
      email: `other-teacher@${suffix}.moazez.local`,
      password: 'HomeworkOtherTeacher123!',
      roleId: teacherRole.id,
      userType: UserType.TEACHER,
    });
    const otherTeacherFixture = await createSchoolFixture({
      schoolId: demoSchoolId,
      organizationId: demoOrganizationId,
      teacherUserId: otherTeacherId,
      prefix: `${suffix}-other`,
    });
    otherTeacherAllocationId = otherTeacherFixture.allocationId;
    otherTeacherHomeworkId = otherTeacherFixture.homeworkId;

    const tenantBTeacherId = await createTenantBUser({
      email: `teacher-b@${suffix}.moazez.local`,
      password: 'HomeworkTeacherB123!',
      roleId: teacherRole.id,
      userType: UserType.TEACHER,
    });
    const tenantBFixture = await createSchoolFixture({
      schoolId: tenantBSchoolId,
      organizationId: tenantBOrganizationId,
      teacherUserId: tenantBTeacherId,
      prefix: `${suffix}-b`,
    });
    tenantBAllocationId = tenantBFixture.allocationId;
    tenantBStudentId = tenantBFixture.studentId;
    tenantBHomeworkId = tenantBFixture.homeworkId;

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
  });

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) {
      await prisma.homeworkTarget.deleteMany({
        where: { homeworkAssignment: { title: { contains: suffix } } },
      });
      await prisma.homeworkAssignment.deleteMany({
        where: { title: { contains: suffix } },
      });
      await prisma.timetablePublication.deleteMany({
        where: { timetableConfig: { name: { contains: suffix } } },
      });
      await prisma.timetableEntry.deleteMany({
        where: { timetableConfig: { name: { contains: suffix } } },
      });
      await prisma.timetablePeriod.deleteMany({
        where: { timetableConfig: { name: { contains: suffix } } },
      });
      await prisma.timetableConfig.deleteMany({
        where: { name: { contains: suffix } },
      });
      await prisma.teacherSubjectAllocation.deleteMany({
        where: {
          OR: [
            { id: demoAllocationId },
            { id: tenantBAllocationId },
            { classroom: { nameEn: { contains: suffix } } },
            { subject: { nameEn: { contains: suffix } } },
          ],
        },
      });
      await prisma.enrollment.deleteMany({
        where: { student: { firstName: { contains: suffix } } },
      });
      await prisma.student.deleteMany({
        where: { firstName: { contains: suffix } },
      });
      await prisma.classroom.deleteMany({
        where: { nameEn: { contains: suffix } },
      });
      await prisma.section.deleteMany({
        where: { nameEn: { contains: suffix } },
      });
      await prisma.grade.deleteMany({
        where: { nameEn: { contains: suffix } },
      });
      await prisma.subject.deleteMany({
        where: { nameEn: { contains: suffix } },
      });
      await prisma.stage.deleteMany({
        where: { nameEn: { contains: suffix } },
      });
      await prisma.term.deleteMany({
        where: { nameEn: { contains: suffix } },
      });
      await prisma.academicYear.deleteMany({
        where: { nameEn: { contains: suffix } },
      });
      await prisma.membership.deleteMany({
        where: { user: { email: { contains: suffix } } },
      });
      await prisma.user.deleteMany({
        where: { email: { contains: suffix } },
      });
      await prisma.rolePermission.deleteMany({
        where: { role: { key: { contains: suffix } } },
      });
      await prisma.role.deleteMany({
        where: { key: { contains: suffix } },
      });
      await prisma.school.deleteMany({
        where: { slug: `${suffix}-school-b` },
      });
      await prisma.organization.deleteMany({
        where: { slug: `${suffix}-org-b` },
      });
      await prisma.$disconnect();
    }
  });

  async function createRoleWithPermissions(input: {
    key: string;
    name: string;
    permissionIds: string[];
  }) {
    const role = await prisma.role.create({
      data: {
        key: input.key,
        name: input.name,
        description: input.name,
        schoolId: demoSchoolId,
        isSystem: false,
      },
    });
    await prisma.rolePermission.createMany({
      data: input.permissionIds.map((permissionId) => ({
        roleId: role.id,
        permissionId,
      })),
    });
    return role;
  }

  async function createUserWithMembership(input: {
    email: string;
    password: string;
    roleId: string;
    userType: UserType;
  }): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: input.email,
        firstName: 'Homework',
        lastName: 'Security',
        userType: input.userType,
        status: UserStatus.ACTIVE,
        passwordHash: await argon2.hash(input.password, ARGON2_OPTIONS),
      },
    });
    await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: demoOrganizationId,
        schoolId: demoSchoolId,
        roleId: input.roleId,
        userType: input.userType,
        status: MembershipStatus.ACTIVE,
      },
    });
    return user.id;
  }

  async function createTenantB(systemRoleId: string) {
    const organization = await prisma.organization.create({
      data: {
        slug: `${suffix}-org-b`,
        name: 'Homework Security Org B',
        status: OrganizationStatus.ACTIVE,
      },
    });
    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `${suffix}-school-b`,
        name: 'Homework Security School B',
        status: SchoolStatus.ACTIVE,
      },
    });
    await createTenantBUser({
      email: `admin-b@${suffix}.moazez.local`,
      password: 'HomeworkAdminB123!',
      roleId: systemRoleId,
      userType: UserType.SCHOOL_USER,
      schoolId: school.id,
      organizationId: organization.id,
    });
    return { organizationId: organization.id, schoolId: school.id };
  }

  async function createTenantBUser(input: {
    email: string;
    password: string;
    roleId: string;
    userType: UserType;
    schoolId?: string;
    organizationId?: string;
  }): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: input.email,
        firstName: 'Homework',
        lastName: 'TenantB',
        userType: input.userType,
        status: UserStatus.ACTIVE,
        passwordHash: await argon2.hash(input.password, ARGON2_OPTIONS),
      },
    });
    await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: input.organizationId ?? tenantBOrganizationId,
        schoolId: input.schoolId ?? tenantBSchoolId,
        roleId: input.roleId,
        userType: input.userType,
        status: MembershipStatus.ACTIVE,
      },
    });
    return user.id;
  }

  async function createSchoolFixture(input: {
    schoolId: string;
    organizationId: string;
    teacherUserId: string;
    prefix: string;
  }) {
    const year = await prisma.academicYear.create({
      data: {
        schoolId: input.schoolId,
        nameAr: `${input.prefix} year`,
        nameEn: `${input.prefix} year`,
        startDate: new Date('2026-09-01'),
        endDate: new Date('2027-06-30'),
        isActive: false,
      },
    });
    const term = await prisma.term.create({
      data: {
        schoolId: input.schoolId,
        academicYearId: year.id,
        nameAr: `${input.prefix} term`,
        nameEn: `${input.prefix} term`,
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-12-31'),
        isActive: true,
      },
    });
    const stage = await prisma.stage.create({
      data: {
        schoolId: input.schoolId,
        nameAr: `${input.prefix} stage`,
        nameEn: `${input.prefix} stage`,
      },
    });
    const grade = await prisma.grade.create({
      data: {
        schoolId: input.schoolId,
        stageId: stage.id,
        nameAr: `${input.prefix} grade`,
        nameEn: `${input.prefix} grade`,
      },
    });
    const section = await prisma.section.create({
      data: {
        schoolId: input.schoolId,
        gradeId: grade.id,
        nameAr: `${input.prefix} section`,
        nameEn: `${input.prefix} section`,
      },
    });
    const classroom = await prisma.classroom.create({
      data: {
        schoolId: input.schoolId,
        sectionId: section.id,
        nameAr: `${input.prefix} classroom`,
        nameEn: `${input.prefix} classroom`,
      },
    });
    const subject = await prisma.subject.create({
      data: {
        schoolId: input.schoolId,
        nameAr: `${input.prefix} subject`,
        nameEn: `${input.prefix} subject`,
        code: input.prefix.slice(-12),
      },
    });
    const allocation = await prisma.teacherSubjectAllocation.create({
      data: {
        schoolId: input.schoolId,
        teacherUserId: input.teacherUserId,
        subjectId: subject.id,
        classroomId: classroom.id,
        termId: term.id,
      },
    });
    const config = await prisma.timetableConfig.create({
      data: {
        schoolId: input.schoolId,
        academicYearId: year.id,
        termId: term.id,
        name: `${input.prefix} timetable`,
        weekStartDay: 0,
        activeDays: [0, 1, 2, 3, 4],
        scopeType: TimetableScopeType.CLASSROOM,
        scopeKey: `classroom:${classroom.id}`,
        gradeId: grade.id,
        sectionId: section.id,
        classroomId: classroom.id,
        status: TimetableConfigStatus.ACTIVE,
      },
    });
    const period = await prisma.timetablePeriod.create({
      data: {
        schoolId: input.schoolId,
        timetableConfigId: config.id,
        periodIndex: 1,
        label: 'P1',
        startTime: '08:00',
        endTime: '08:45',
        type: TimetablePeriodType.CLASS,
        isInstructional: true,
      },
    });
    const entry = await prisma.timetableEntry.create({
      data: {
        schoolId: input.schoolId,
        academicYearId: year.id,
        termId: term.id,
        timetableConfigId: config.id,
        periodId: period.id,
        dayOfWeek: 1,
        gradeId: grade.id,
        sectionId: section.id,
        classroomId: classroom.id,
        subjectId: subject.id,
        teacherUserId: input.teacherUserId,
        teacherSubjectAllocationId: allocation.id,
        status: TimetableEntryStatus.ACTIVE,
      },
    });
    await prisma.timetablePublication.create({
      data: {
        schoolId: input.schoolId,
        academicYearId: year.id,
        termId: term.id,
        timetableConfigId: config.id,
        status: TimetablePublicationStatus.PUBLISHED,
        publishedAt: new Date(),
        publishedByUserId: input.teacherUserId,
        revision: 1,
      },
    });
    const student = await prisma.student.create({
      data: {
        schoolId: input.schoolId,
        organizationId: input.organizationId,
        firstName: `${input.prefix} student one`,
        lastName: 'Learner',
        status: StudentStatus.ACTIVE,
      },
    });
    const studentTwo = await prisma.student.create({
      data: {
        schoolId: input.schoolId,
        organizationId: input.organizationId,
        firstName: `${input.prefix} student two`,
        lastName: 'Learner',
        status: StudentStatus.ACTIVE,
      },
    });
    const enrollment = await prisma.enrollment.create({
      data: {
        schoolId: input.schoolId,
        studentId: student.id,
        academicYearId: year.id,
        termId: term.id,
        classroomId: classroom.id,
        status: StudentEnrollmentStatus.ACTIVE,
        enrolledAt: new Date('2026-09-01'),
      },
    });
    const enrollmentTwo = await prisma.enrollment.create({
      data: {
        schoolId: input.schoolId,
        studentId: studentTwo.id,
        academicYearId: year.id,
        termId: term.id,
        classroomId: classroom.id,
        status: StudentEnrollmentStatus.ACTIVE,
        enrolledAt: new Date('2026-09-01'),
      },
    });
    const homework = await prisma.homeworkAssignment.create({
      data: {
        schoolId: input.schoolId,
        academicYearId: year.id,
        termId: term.id,
        classroomId: classroom.id,
        subjectId: subject.id,
        teacherUserId: input.teacherUserId,
        teacherSubjectAllocationId: allocation.id,
        timetableEntryId: entry.id,
        scheduleDate: new Date('2026-09-14'),
        title: `${input.prefix} homework`,
        description: 'Security homework fixture',
        mode: HomeworkAssignmentMode.HOMEWORK,
        status: HomeworkAssignmentStatus.DRAFT,
        targetMode: HomeworkTargetMode.CLASSROOM,
        dueAt: new Date('2027-01-15T10:00:00.000Z'),
        createdByUserId: input.teacherUserId,
      },
    });
    await prisma.homeworkTarget.create({
      data: {
        schoolId: input.schoolId,
        homeworkAssignmentId: homework.id,
        studentId: student.id,
        enrollmentId: enrollment.id,
        status: HomeworkTargetStatus.ASSIGNED,
      },
    });

    return {
      yearId: year.id,
      termId: term.id,
      classroomId: classroom.id,
      subjectId: subject.id,
      allocationId: allocation.id,
      timetableEntryId: entry.id,
      studentId: student.id,
      studentTwoId: studentTwo.id,
      enrollmentId: enrollment.id,
      enrollmentTwoId: enrollmentTwo.id,
      homeworkId: homework.id,
    };
  }

  async function login(
    email: string,
    password: string,
  ): Promise<{ accessToken: string }> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password })
      .expect(200);

    return { accessToken: response.body.accessToken };
  }

  function homeworkCreatePayload(overrides?: Record<string, unknown>) {
    return {
      academicYearId: demoYearId,
      termId: demoTermId,
      teacherSubjectAllocationId: demoAllocationId,
      timetableEntryId: demoTimetableEntryId,
      scheduleDate: '2026-09-14',
      title: `${suffix} API homework`,
      targetMode: HomeworkTargetMode.CLASSROOM,
      dueAt: '2027-02-01T10:00:00.000Z',
      ...overrides,
    };
  }

  function teacherHomeworkCreatePayload(overrides?: Record<string, unknown>) {
    return {
      title: `${suffix} teacher app homework`,
      targetMode: HomeworkTargetMode.CLASSROOM,
      dueAt: '2027-02-01T10:00:00.000Z',
      ...overrides,
    };
  }

  async function createStudentReadHomework(input: {
    title: string;
    studentId?: string;
    enrollmentId?: string;
    assignmentStatus?: HomeworkAssignmentStatus;
    targetStatus?: HomeworkTargetStatus;
    dueAt?: Date;
  }): Promise<string> {
    const homework = await prisma.homeworkAssignment.create({
      data: {
        schoolId: demoSchoolId,
        academicYearId: demoYearId,
        termId: demoTermId,
        classroomId: demoClassroomId,
        subjectId: demoSubjectId,
        teacherUserId: demoTeacherId,
        teacherSubjectAllocationId: demoAllocationId,
        title: input.title,
        description: 'Student read security fixture',
        mode: HomeworkAssignmentMode.HOMEWORK,
        status: input.assignmentStatus ?? HomeworkAssignmentStatus.PUBLISHED,
        targetMode: HomeworkTargetMode.SELECTED_STUDENTS,
        publishedAt:
          input.assignmentStatus === HomeworkAssignmentStatus.DRAFT
            ? null
            : new Date('2026-09-10T08:00:00.000Z'),
        dueAt: input.dueAt ?? new Date('2027-03-01T10:00:00.000Z'),
        createdByUserId: demoTeacherId,
        publishedByUserId:
          input.assignmentStatus === HomeworkAssignmentStatus.DRAFT
            ? null
            : demoTeacherId,
      },
    });

    await prisma.homeworkTarget.create({
      data: {
        schoolId: demoSchoolId,
        homeworkAssignmentId: homework.id,
        studentId: input.studentId ?? demoStudentId,
        enrollmentId: input.enrollmentId ?? demoEnrollmentId,
        status: input.targetStatus ?? HomeworkTargetStatus.ASSIGNED,
        submittedAt:
          input.targetStatus === HomeworkTargetStatus.SUBMITTED
            ? new Date('2026-09-11T08:00:00.000Z')
            : null,
        reviewedAt:
          input.targetStatus === HomeworkTargetStatus.REVIEWED
            ? new Date('2026-09-12T08:00:00.000Z')
            : null,
      },
    });

    return homework.id;
  }

  it('requires authentication', async () => {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/homework/assignments`)
      .expect(401);
  });

  it('requires view permission for list, detail, and targets', async () => {
    const { accessToken } = await login(manageOnlyEmail, 'HomeworkManage123!');

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/homework/assignments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/homework/assignments/${demoHomeworkId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/homework/assignments/${demoHomeworkId}/targets`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('requires manage permission for write and lifecycle endpoints', async () => {
    const { accessToken } = await login(viewOnlyEmail, 'HomeworkView123!');

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/homework/assignments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(homeworkCreatePayload())
      .expect(403);
    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/homework/assignments/${demoHomeworkId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: `${suffix} blocked` })
      .expect(403);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/homework/assignments/${demoHomeworkId}/publish`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/homework/assignments/${demoHomeworkId}/close`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/homework/assignments/${demoHomeworkId}/cancel`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/homework/assignments/${demoHomeworkId}/targets/resolve`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('prevents school A admin from reading school B homework', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/homework/assignments/${tenantBHomeworkId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/homework/assignments?limit=100&search=${suffix}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const ids = response.body.items.map((item: { id: string }) => item.id);
    expect(ids).toContain(demoHomeworkId);
    expect(ids).not.toContain(tenantBHomeworkId);
    expectNoTenantIds(response.body);
  });

  it('prevents school A admin from mutating school B homework', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/homework/assignments/${tenantBHomeworkId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: `${suffix} cross-school mutation` })
      .expect(404);
  });

  it('returns validation-safe errors for cross-school allocation and selected student IDs', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const allocationResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/homework/assignments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(
        homeworkCreatePayload({
          teacherSubjectAllocationId: tenantBAllocationId,
          timetableEntryId: null,
          scheduleDate: null,
        }),
      )
      .expect(422);
    expect(allocationResponse.body.error.code).toBe(
      'homework.assignment.allocation_mismatch',
    );
    expect(JSON.stringify(allocationResponse.body)).not.toContain(
      tenantBSchoolId,
    );

    const selectedStudentResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/homework/assignments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(
        homeworkCreatePayload({
          targetMode: HomeworkTargetMode.SELECTED_STUDENTS,
          studentIds: [demoStudentId, tenantBStudentId],
        }),
      )
      .expect(409);
    expect(selectedStudentResponse.body.error.code).toBe(
      'homework.assignment.target_conflict',
    );
    expect(JSON.stringify(selectedStudentResponse.body)).not.toContain(
      tenantBSchoolId,
    );
  });

  it('does not expose tenant ids in detail or target responses', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const detail = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/homework/assignments/${demoHomeworkId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expectNoTenantIds(detail.body);

    const targets = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/homework/assignments/${demoHomeworkId}/targets`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expectNoTenantIds(targets.body);
    expect(targets.body.items[0]).toEqual(
      expect.objectContaining({
        studentId: demoStudentId,
        enrollmentId: demoEnrollmentId,
      }),
    );
  });

  it('does not grant dashboard homework management to teacher, student, or parent actors', async () => {
    for (const [email, password] of [
      [teacherEmail, 'HomeworkTeacher123!'],
      [studentEmail, 'HomeworkStudent123!'],
      [parentEmail, 'HomeworkParent123!'],
    ]) {
      const { accessToken } = await login(email, password);
      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/homework/assignments`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(homeworkCreatePayload())
        .expect(403);
    }

    const teacher = await login(teacherEmail, 'HomeworkTeacher123!');
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/homework/assignments`)
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .expect(403);
  });

  it('allows school admin to continue managing homework through Core APIs', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const createResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/homework/assignments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(
        homeworkCreatePayload({
          title: `${suffix} core admin homework`,
          timetableEntryId: null,
          scheduleDate: null,
        }),
      )
      .expect(201);

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/homework/assignments/${createResponse.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: `${suffix} core admin homework updated` })
      .expect(200);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/homework/assignments/${createResponse.body.id}/publish`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  it('lets teachers manage owned homework through Teacher App routes only', async () => {
    const { accessToken } = await login(teacherEmail, 'HomeworkTeacher123!');

    const dashboard = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/homeworks/dashboard`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      dashboard.body.classes.map((item: { classId: string }) => item.classId),
    ).toContain(demoAllocationId);
    expectNoTenantIds(dashboard.body);

    const createResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/teacher/homeworks/classes/${demoAllocationId}/assignments`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send(
        teacherHomeworkCreatePayload({
          title: `${suffix} teacher app owned homework`,
          timetableEntryId: demoTimetableEntryId,
          scheduleDate: '2026-09-14',
          estimatedMinutes: 25,
        }),
      )
      .expect(201);

    expect(createResponse.body).toMatchObject({
      title: `${suffix} teacher app owned homework`,
      classId: demoAllocationId,
      timetableEntryId: demoTimetableEntryId,
      scheduleDate: '2026-09-14',
    });
    expect(createResponse.body).not.toHaveProperty(
      'teacherSubjectAllocationId',
    );
    expectNoTenantIds(createResponse.body);

    const listResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/homeworks/classes/${demoAllocationId}/assignments?search=teacher app owned`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      listResponse.body.items.map((item: { id: string }) => item.id),
    ).toContain(createResponse.body.id);
    expectNoTenantIds(listResponse.body);

    const publishResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/teacher/homeworks/classes/${demoAllocationId}/assignments/${createResponse.body.id}/publish`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(publishResponse.body.status).toBe('published');

    const targetsResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/homeworks/classes/${demoAllocationId}/assignments/${createResponse.body.id}/targets`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(targetsResponse.body.items.length).toBeGreaterThan(0);
    expect(targetsResponse.body.items[0]).toEqual(
      expect.objectContaining({
        studentId: expect.any(String),
        enrollmentId: expect.any(String),
      }),
    );
    expect(JSON.stringify(targetsResponse.body)).not.toContain('guardian');
    expectNoTenantIds(targetsResponse.body);

    const closeResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/teacher/homeworks/classes/${demoAllocationId}/assignments/${createResponse.body.id}/close`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(closeResponse.body.status).toBe('closed');
  });

  it('supports teacher draft update, selected-student targets, resolve, and cancel without side effects', async () => {
    const { accessToken } = await login(teacherEmail, 'HomeworkTeacher123!');

    const createResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/teacher/homeworks/classes/${demoAllocationId}/assignments`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send(
        teacherHomeworkCreatePayload({
          title: `${suffix} teacher selected homework`,
          targetMode: HomeworkTargetMode.SELECTED_STUDENTS,
          studentIds: [demoStudentTwoId],
        }),
      )
      .expect(201);

    await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/teacher/homeworks/classes/${demoAllocationId}/assignments/${createResponse.body.id}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: `${suffix} teacher selected homework updated` })
      .expect(200);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/teacher/homeworks/classes/${demoAllocationId}/assignments/${createResponse.body.id}/targets/resolve`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const targets = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/homeworks/classes/${demoAllocationId}/assignments/${createResponse.body.id}/targets`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      targets.body.items.map((item: { studentId: string }) => item.studentId),
    ).toEqual([demoStudentTwoId]);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/teacher/homeworks/classes/${demoAllocationId}/assignments/${createResponse.body.id}/cancel`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  it('blocks Teacher App access to another teacher and cross-school homework', async () => {
    const { accessToken } = await login(teacherEmail, 'HomeworkTeacher123!');

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/homeworks/classes/${otherTeacherAllocationId}/assignments`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/homeworks/classes/${demoAllocationId}/assignments/${otherTeacherHomeworkId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/homeworks/classes/${tenantBAllocationId}/assignments`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/homeworks/classes/${demoAllocationId}/assignments/${tenantBHomeworkId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  it('blocks student and parent actors from Teacher Homework routes', async () => {
    for (const [email, password] of [
      [studentEmail, 'HomeworkStudent123!'],
      [parentEmail, 'HomeworkParent123!'],
    ]) {
      const { accessToken } = await login(email, password);
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/teacher/homeworks/dashboard`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .post(
          `${GLOBAL_PREFIX}/teacher/homeworks/classes/${demoAllocationId}/assignments`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .send(teacherHomeworkCreatePayload())
        .expect(403);
    }
  });

  it('lets students read only their own assigned visible homework', async () => {
    const { accessToken } = await login(studentEmail, 'HomeworkStudent123!');
    const ownHomeworkId = await createStudentReadHomework({
      title: `${suffix} student read own`,
    });
    const sameSchoolOtherHomeworkId = await createStudentReadHomework({
      title: `${suffix} student read other`,
      studentId: demoStudentTwoId,
      enrollmentId: demoEnrollmentTwoId,
    });
    const draftHomeworkId = await createStudentReadHomework({
      title: `${suffix} student read draft`,
      assignmentStatus: HomeworkAssignmentStatus.DRAFT,
    });
    const cancelledHomeworkId = await createStudentReadHomework({
      title: `${suffix} student read cancelled`,
      assignmentStatus: HomeworkAssignmentStatus.CANCELLED,
    });

    const listResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/homeworks?limit=100&search=student read`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const returnedIds = listResponse.body.homeworks.map(
      (item: { homeworkId: string }) => item.homeworkId,
    );
    expect(returnedIds).toContain(ownHomeworkId);
    expect(returnedIds).not.toContain(sameSchoolOtherHomeworkId);
    expect(returnedIds).not.toContain(draftHomeworkId);
    expect(returnedIds).not.toContain(cancelledHomeworkId);
    expect(listResponse.body.homeworks[0]).toEqual(
      expect.objectContaining({
        status: 'waiting',
        questionCount: 0,
        attachmentsCount: 0,
      }),
    );
    expectNoTenantIds(listResponse.body);

    const detailResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/homeworks/${ownHomeworkId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(detailResponse.body.homework).toMatchObject({
      homeworkId: ownHomeworkId,
      questions: [],
      attachments: [],
      submission: null,
    });
    expectNoTenantIds(detailResponse.body);

    for (const homeworkId of [
      sameSchoolOtherHomeworkId,
      draftHomeworkId,
      cancelledHomeworkId,
      tenantBHomeworkId,
    ]) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/student/homeworks/${homeworkId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    }
  });

  it('maps Student App homework statuses without submission side effects', async () => {
    const { accessToken } = await login(studentEmail, 'HomeworkStudent123!');
    const waitingHomeworkId = await createStudentReadHomework({
      title: `${suffix} student status waiting`,
      dueAt: new Date('2027-03-02T10:00:00.000Z'),
    });
    const completedHomeworkId = await createStudentReadHomework({
      title: `${suffix} student status completed`,
      targetStatus: HomeworkTargetStatus.SUBMITTED,
      dueAt: new Date('2027-03-03T10:00:00.000Z'),
    });
    const notCompletedHomeworkId = await createStudentReadHomework({
      title: `${suffix} student status not completed`,
      targetStatus: HomeworkTargetStatus.MISSING,
      dueAt: new Date('2026-01-03T10:00:00.000Z'),
    });

    for (const [status, expectedId] of [
      ['waiting', waitingHomeworkId],
      ['completed', completedHomeworkId],
      ['not_completed', notCompletedHomeworkId],
    ] as const) {
      const response = await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/student/homeworks?status=${status}&search=student status`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const ids = response.body.homeworks.map(
        (item: { homeworkId: string }) => item.homeworkId,
      );
      expect(ids).toContain(expectedId);
      expect(
        response.body.homeworks.find(
          (item: { homeworkId: string }) => item.homeworkId === expectedId,
        ),
      ).toMatchObject({ status });
      expectNoTenantIds(response.body);
    }
  });

  it('blocks teacher and parent actors from Student Homework routes', async () => {
    const ownHomeworkId = await createStudentReadHomework({
      title: `${suffix} student actor boundary`,
    });

    for (const [email, password] of [
      [teacherEmail, 'HomeworkTeacher123!'],
      [parentEmail, 'HomeworkParent123!'],
    ]) {
      const { accessToken } = await login(email, password);
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/student/homeworks`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/student/homeworks/${ownHomeworkId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    }
  });

  it('keeps parent, submission, question, and attachment homework routes unregistered', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    for (const route of [
      `/parent/children/${demoStudentTwoId}/homeworks`,
      '/homework/submissions',
      '/homework/questions',
      '/homework/attachments',
      `/student/homeworks/${demoHomeworkId}/submission/resolve`,
      `/student/homeworks/${demoHomeworkId}/submission/submit`,
      `/student/homeworks/${demoHomeworkId}/submission/answers`,
      `/student/homeworks/${demoHomeworkId}/submission/answers/${demoHomeworkId}`,
      `/student/homeworks/${demoHomeworkId}/attachments`,
      `/student/homeworks/${demoHomeworkId}/files`,
      `/teacher/homeworks/classes/${demoAllocationId}/assignments/${demoHomeworkId}/submissions`,
      `/teacher/homeworks/classes/${demoAllocationId}/assignments/${demoHomeworkId}/questions`,
      `/teacher/homeworks/classes/${demoAllocationId}/assignments/${demoHomeworkId}/attachments`,
    ]) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}${route}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    }
  });
});
