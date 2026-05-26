import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  HomeworkAssignmentMode,
  HomeworkAssignmentStatus,
  HomeworkSubmissionStatus,
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
  let tenantBEnrollmentId: string;
  let tenantBHomeworkId: string;
  let otherTeacherAllocationId: string;
  let otherTeacherHomeworkId: string;

  let viewOnlyEmail: string;
  let manageOnlyEmail: string;
  let teacherEmail: string;
  let studentEmail: string;
  let parentEmail: string;
  let studentUserId: string;
  let parentUserId: string;

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
    parentUserId = await createUserWithMembership({
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
    const parentGuardian = await prisma.guardian.create({
      data: {
        schoolId: demoSchoolId,
        organizationId: demoOrganizationId,
        userId: parentUserId,
        firstName: 'Homework',
        lastName: 'Parent',
        email: `${suffix}-parent-guardian@example.test`,
        phone: `${suffix}-parent-phone`,
        relation: 'mother',
        isPrimary: true,
      },
      select: { id: true },
    });
    await prisma.studentGuardian.create({
      data: {
        schoolId: demoSchoolId,
        studentId: demoStudentId,
        guardianId: parentGuardian.id,
        isPrimary: true,
      },
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
    tenantBEnrollmentId = tenantBFixture.enrollmentId;
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
      await prisma.homeworkSubmission.deleteMany({
        where: { homeworkAssignment: { title: { contains: suffix } } },
      });
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
      await prisma.studentGuardian.deleteMany({
        where: {
          OR: [
            { guardian: { user: { email: { contains: suffix } } } },
            { student: { firstName: { contains: suffix } } },
          ],
        },
      });
      await prisma.guardian.deleteMany({
        where: { user: { email: { contains: suffix } } },
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
          input.targetStatus === HomeworkTargetStatus.SUBMITTED ||
          input.targetStatus === HomeworkTargetStatus.LATE
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

  async function createParentReadHomework(input: {
    title: string;
    studentId?: string;
    enrollmentId?: string;
    assignmentStatus?: HomeworkAssignmentStatus;
    targetStatus?: HomeworkTargetStatus;
    submissionStatus?: HomeworkSubmissionStatus;
    bodyText?: string;
    reviewNote?: string | null;
    awardedMarks?: number | null;
    totalMarks?: number | null;
    isGraded?: boolean;
    dueAt?: Date;
    deletedAt?: Date | null;
  }): Promise<string> {
    const submissionStatus = input.submissionStatus;
    const targetStatus =
      input.targetStatus ??
      (submissionStatus
        ? targetStatusForSubmission(submissionStatus)
        : HomeworkTargetStatus.ASSIGNED);
    const submittedAt =
      targetStatus === HomeworkTargetStatus.SUBMITTED ||
      targetStatus === HomeworkTargetStatus.LATE ||
      targetStatus === HomeworkTargetStatus.REVIEWED
        ? new Date('2026-09-11T08:00:00.000Z')
        : null;
    const reviewedAt =
      targetStatus === HomeworkTargetStatus.REVIEWED
        ? new Date('2026-09-12T08:00:00.000Z')
        : null;

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
        description: 'Parent read security fixture',
        mode: HomeworkAssignmentMode.HOMEWORK,
        status: input.assignmentStatus ?? HomeworkAssignmentStatus.PUBLISHED,
        targetMode: HomeworkTargetMode.SELECTED_STUDENTS,
        publishedAt:
          input.assignmentStatus === HomeworkAssignmentStatus.DRAFT
            ? null
            : new Date('2026-09-10T08:00:00.000Z'),
        dueAt: input.dueAt ?? new Date('2027-03-01T10:00:00.000Z'),
        totalMarks: input.totalMarks ?? null,
        isGraded: input.isGraded ?? false,
        createdByUserId: demoTeacherId,
        publishedByUserId:
          input.assignmentStatus === HomeworkAssignmentStatus.DRAFT
            ? null
            : demoTeacherId,
        deletedAt: input.deletedAt ?? null,
      },
    });

    const target = await prisma.homeworkTarget.create({
      data: {
        schoolId: demoSchoolId,
        homeworkAssignmentId: homework.id,
        studentId: input.studentId ?? demoStudentId,
        enrollmentId: input.enrollmentId ?? demoEnrollmentId,
        status: targetStatus,
        submittedAt,
        reviewedAt,
      },
      select: { id: true },
    });

    if (submissionStatus) {
      await prisma.homeworkSubmission.create({
        data: {
          schoolId: demoSchoolId,
          homeworkAssignmentId: homework.id,
          homeworkTargetId: target.id,
          studentId: input.studentId ?? demoStudentId,
          enrollmentId: input.enrollmentId ?? demoEnrollmentId,
          status: submissionStatus,
          bodyText: input.bodyText ?? `${input.title} answer`,
          submittedAt,
          reviewedAt,
          reviewedByUserId: reviewedAt ? demoTeacherId : null,
          reviewNote: reviewedAt
            ? (input.reviewNote ?? 'Reviewed by teacher')
            : null,
          awardedMarks:
            reviewedAt && input.awardedMarks !== undefined
              ? input.awardedMarks
              : null,
        },
      });
    }

    return homework.id;
  }

  async function createSubmissionForExistingHomework(input: {
    schoolId: string;
    homeworkId: string;
    studentId: string;
    enrollmentId: string;
    status: HomeworkSubmissionStatus;
    bodyText: string;
  }): Promise<string> {
    const submittedAt =
      input.status === HomeworkSubmissionStatus.DRAFT
        ? null
        : new Date('2026-09-11T08:00:00.000Z');
    const reviewedAt =
      input.status === HomeworkSubmissionStatus.REVIEWED
        ? new Date('2026-09-12T08:00:00.000Z')
        : null;
    const target = await prisma.homeworkTarget.findFirstOrThrow({
      where: {
        schoolId: input.schoolId,
        homeworkAssignmentId: input.homeworkId,
        studentId: input.studentId,
        enrollmentId: input.enrollmentId,
      },
      select: { id: true },
    });

    await prisma.homeworkTarget.update({
      where: { id: target.id },
      data: {
        status: targetStatusForSubmission(input.status),
        submittedAt,
        reviewedAt,
      },
    });

    const submission = await prisma.homeworkSubmission.create({
      data: {
        schoolId: input.schoolId,
        homeworkAssignmentId: input.homeworkId,
        homeworkTargetId: target.id,
        studentId: input.studentId,
        enrollmentId: input.enrollmentId,
        status: input.status,
        bodyText: input.bodyText,
        submittedAt,
        reviewedAt,
        reviewedByUserId: reviewedAt ? demoTeacherId : null,
        reviewNote: reviewedAt ? 'Reviewed by teacher' : null,
        awardedMarks: reviewedAt ? 8 : null,
      },
      select: { id: true },
    });

    return submission.id;
  }

  async function createTeacherReviewSubmission(input: {
    title: string;
    assignmentStatus?: HomeworkAssignmentStatus;
    submissionStatus?: HomeworkSubmissionStatus;
    totalMarks?: number | null;
    isGraded?: boolean;
    dueAt?: Date;
  }): Promise<{ homeworkId: string; targetId: string; submissionId: string }> {
    const assignmentStatus =
      input.assignmentStatus ?? HomeworkAssignmentStatus.PUBLISHED;
    const submissionStatus =
      input.submissionStatus ?? HomeworkSubmissionStatus.SUBMITTED;
    const submittedAt =
      submissionStatus === HomeworkSubmissionStatus.DRAFT
        ? null
        : new Date('2026-09-11T08:00:00.000Z');
    const reviewedAt =
      submissionStatus === HomeworkSubmissionStatus.REVIEWED
        ? new Date('2026-09-12T08:00:00.000Z')
        : null;

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
        description: 'Teacher review security fixture',
        mode: HomeworkAssignmentMode.HOMEWORK,
        status: assignmentStatus,
        targetMode: HomeworkTargetMode.SELECTED_STUDENTS,
        publishedAt:
          assignmentStatus === HomeworkAssignmentStatus.DRAFT
            ? null
            : new Date('2026-09-10T08:00:00.000Z'),
        dueAt: input.dueAt ?? new Date('2027-03-01T10:00:00.000Z'),
        createdByUserId: demoTeacherId,
        publishedByUserId:
          assignmentStatus === HomeworkAssignmentStatus.DRAFT
            ? null
            : demoTeacherId,
        cancelledAt:
          assignmentStatus === HomeworkAssignmentStatus.CANCELLED
            ? new Date('2026-09-12T08:30:00.000Z')
            : null,
        archivedAt:
          assignmentStatus === HomeworkAssignmentStatus.ARCHIVED
            ? new Date('2026-09-12T08:45:00.000Z')
            : null,
        totalMarks: input.totalMarks === undefined ? 10 : input.totalMarks,
        isGraded: input.isGraded ?? true,
      },
    });

    const target = await prisma.homeworkTarget.create({
      data: {
        schoolId: demoSchoolId,
        homeworkAssignmentId: homework.id,
        studentId: demoStudentId,
        enrollmentId: demoEnrollmentId,
        status: targetStatusForSubmission(submissionStatus),
        submittedAt,
        reviewedAt,
      },
    });

    const submission = await prisma.homeworkSubmission.create({
      data: {
        schoolId: demoSchoolId,
        homeworkAssignmentId: homework.id,
        homeworkTargetId: target.id,
        studentId: demoStudentId,
        enrollmentId: demoEnrollmentId,
        status: submissionStatus,
        bodyText: `${input.title} answer`,
        submittedAt,
        reviewedAt,
        reviewedByUserId: reviewedAt ? demoTeacherId : null,
        reviewNote: reviewedAt ? 'Already reviewed' : null,
        awardedMarks: reviewedAt ? 8 : null,
      },
    });

    return {
      homeworkId: homework.id,
      targetId: target.id,
      submissionId: submission.id,
    };
  }

  async function countSubmissionSideEffects(): Promise<Record<string, number>> {
    const [
      gradeAssessments,
      gradeQuestions,
      gradeSubmissions,
      gradeSubmissionAnswers,
      gradeItems,
      notifications,
      xpLedgers,
      rewardRedemptions,
      files,
      attachments,
      emailBatches,
      emailRecipients,
    ] = await Promise.all([
      prisma.gradeAssessment.count(),
      prisma.gradeAssessmentQuestion.count(),
      prisma.gradeSubmission.count(),
      prisma.gradeSubmissionAnswer.count(),
      prisma.gradeItem.count(),
      prisma.communicationNotification.count(),
      prisma.xpLedger.count(),
      prisma.rewardRedemption.count(),
      prisma.file.count(),
      prisma.attachment.count(),
      prisma.schoolEmailDeliveryBatch.count(),
      prisma.schoolEmailDeliveryRecipient.count(),
    ]);

    return {
      gradeAssessments,
      gradeQuestions,
      gradeSubmissions,
      gradeSubmissionAnswers,
      gradeItems,
      notifications,
      xpLedgers,
      rewardRedemptions,
      files,
      attachments,
      emailBatches,
      emailRecipients,
    };
  }

  function targetStatusForSubmission(
    status: HomeworkSubmissionStatus,
  ): HomeworkTargetStatus {
    switch (status) {
      case HomeworkSubmissionStatus.DRAFT:
        return HomeworkTargetStatus.ASSIGNED;
      case HomeworkSubmissionStatus.LATE:
        return HomeworkTargetStatus.LATE;
      case HomeworkSubmissionStatus.REVIEWED:
        return HomeworkTargetStatus.REVIEWED;
      case HomeworkSubmissionStatus.SUBMITTED:
      default:
        return HomeworkTargetStatus.SUBMITTED;
    }
  }

  async function expectHomeworkReviewed(input: {
    homeworkId: string;
    submissionId: string;
    targetId: string;
  }): Promise<void> {
    const [submission, target] = await Promise.all([
      prisma.homeworkSubmission.findFirstOrThrow({
        where: {
          id: input.submissionId,
          homeworkAssignmentId: input.homeworkId,
        },
        select: { status: true, reviewedAt: true },
      }),
      prisma.homeworkTarget.findFirstOrThrow({
        where: {
          id: input.targetId,
          homeworkAssignmentId: input.homeworkId,
        },
        select: { status: true, reviewedAt: true },
      }),
    ]);

    expect(submission.status).toBe(HomeworkSubmissionStatus.REVIEWED);
    expect(submission.reviewedAt).toBeInstanceOf(Date);
    expect(target.status).toBe(HomeworkTargetStatus.REVIEWED);
    expect(target.reviewedAt).toBeInstanceOf(Date);
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

  it('lets teachers list, view, and review owned homework submissions only', async () => {
    const { accessToken } = await login(teacherEmail, 'HomeworkTeacher123!');
    const submitted = await createTeacherReviewSubmission({
      title: `${suffix} teacher review list submitted`,
      submissionStatus: HomeworkSubmissionStatus.SUBMITTED,
    });
    const late = await createTeacherReviewSubmission({
      title: `${suffix} teacher review list late`,
      submissionStatus: HomeworkSubmissionStatus.LATE,
      dueAt: new Date('2026-01-02T10:00:00.000Z'),
    });
    const alreadyReviewed = await createTeacherReviewSubmission({
      title: `${suffix} teacher review list reviewed`,
      submissionStatus: HomeworkSubmissionStatus.REVIEWED,
    });
    const draft = await createTeacherReviewSubmission({
      title: `${suffix} teacher review list draft`,
      submissionStatus: HomeworkSubmissionStatus.DRAFT,
    });
    const overMax = await createTeacherReviewSubmission({
      title: `${suffix} teacher review invalid marks`,
      submissionStatus: HomeworkSubmissionStatus.SUBMITTED,
    });
    const ungraded = await createTeacherReviewSubmission({
      title: `${suffix} teacher review ungraded marks`,
      submissionStatus: HomeworkSubmissionStatus.SUBMITTED,
      totalMarks: null,
      isGraded: false,
    });
    const draftAssignment = await createTeacherReviewSubmission({
      title: `${suffix} teacher review hidden draft assignment`,
      assignmentStatus: HomeworkAssignmentStatus.DRAFT,
      submissionStatus: HomeworkSubmissionStatus.SUBMITTED,
    });
    const cancelledAssignment = await createTeacherReviewSubmission({
      title: `${suffix} teacher review hidden cancelled assignment`,
      assignmentStatus: HomeworkAssignmentStatus.CANCELLED,
      submissionStatus: HomeworkSubmissionStatus.SUBMITTED,
    });
    const archivedAssignment = await createTeacherReviewSubmission({
      title: `${suffix} teacher review hidden archived assignment`,
      assignmentStatus: HomeworkAssignmentStatus.ARCHIVED,
      submissionStatus: HomeworkSubmissionStatus.REVIEWED,
    });
    const closedSubmitted = await createTeacherReviewSubmission({
      title: `${suffix} teacher review closed submitted`,
      assignmentStatus: HomeworkAssignmentStatus.CLOSED,
      submissionStatus: HomeworkSubmissionStatus.SUBMITTED,
    });
    const sideEffectCountsBefore = await countSubmissionSideEffects();

    const list = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/homeworks/classes/${demoAllocationId}/assignments/${submitted.homeworkId}/submissions?limit=100&search=${suffix}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(list.body.submissions).toEqual([
      expect.objectContaining({
        id: submitted.submissionId,
        homeworkId: submitted.homeworkId,
        status: 'submitted',
        bodyText: `${suffix} teacher review list submitted answer`,
        totalMarks: 10,
      }),
    ]);
    expectNoTenantIds(list.body);
    expect(JSON.stringify(list.body)).not.toContain('enrollmentId');
    expect(JSON.stringify(list.body)).not.toContain('reviewedByUserId');

    const pendingReview = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/homeworks/classes/${demoAllocationId}/assignments/${late.homeworkId}/submissions?status=pending_review&limit=100`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      pendingReview.body.submissions.map((item: { id: string }) => item.id),
    ).toEqual([late.submissionId]);

    const reviewedList = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/homeworks/classes/${demoAllocationId}/assignments/${alreadyReviewed.homeworkId}/submissions?status=reviewed&limit=100`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      reviewedList.body.submissions.map((item: { id: string }) => item.id),
    ).toEqual([alreadyReviewed.submissionId]);

    const closedList = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/homeworks/classes/${demoAllocationId}/assignments/${closedSubmitted.homeworkId}/submissions?status=submitted&limit=100`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      closedList.body.submissions.map((item: { id: string }) => item.id),
    ).toEqual([closedSubmitted.submissionId]);

    for (const hidden of [
      draftAssignment,
      cancelledAssignment,
      archivedAssignment,
    ]) {
      const hiddenList = await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/teacher/homeworks/classes/${demoAllocationId}/assignments/${hidden.homeworkId}/submissions?limit=100`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(hiddenList.body.submissions).toEqual([]);
    }

    const detail = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/homeworks/classes/${demoAllocationId}/assignments/${submitted.homeworkId}/submissions/${submitted.submissionId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(detail.body.submission).toMatchObject({
      id: submitted.submissionId,
      homeworkId: submitted.homeworkId,
      targetId: submitted.targetId,
      status: 'submitted',
      bodyText: `${suffix} teacher review list submitted answer`,
      student: expect.objectContaining({
        id: demoStudentId,
        displayName: expect.any(String),
      }),
    });
    expectNoTenantIds(detail.body);

    const closedDetail = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/homeworks/classes/${demoAllocationId}/assignments/${closedSubmitted.homeworkId}/submissions/${closedSubmitted.submissionId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(closedDetail.body.submission).toMatchObject({
      id: closedSubmitted.submissionId,
      homeworkId: closedSubmitted.homeworkId,
      status: 'submitted',
    });

    for (const hidden of [cancelledAssignment, archivedAssignment]) {
      await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/teacher/homeworks/classes/${demoAllocationId}/assignments/${hidden.homeworkId}/submissions/${hidden.submissionId}`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    }

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/homeworks/classes/${demoAllocationId}/assignments/${draft.homeworkId}/submissions/${draft.submissionId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    const reviewed = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/teacher/homeworks/classes/${demoAllocationId}/assignments/${submitted.homeworkId}/submissions/${submitted.submissionId}/review`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reviewNote: '  Good work  ', awardedMarks: 8.5 })
      .expect(200);
    expect(reviewed.body.submission).toMatchObject({
      id: submitted.submissionId,
      status: 'reviewed',
      reviewNote: 'Good work',
      awardedMarks: 8.5,
      reviewedAt: expect.any(String),
    });
    expectNoTenantIds(reviewed.body);

    const lateReviewed = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/teacher/homeworks/classes/${demoAllocationId}/assignments/${late.homeworkId}/submissions/${late.submissionId}/review`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reviewNote: 'Late but complete' })
      .expect(200);
    expect(lateReviewed.body.submission).toMatchObject({
      id: late.submissionId,
      status: 'reviewed',
      isLate: true,
    });

    await expectHomeworkReviewed({
      homeworkId: submitted.homeworkId,
      submissionId: submitted.submissionId,
      targetId: submitted.targetId,
    });
    await expectHomeworkReviewed({
      homeworkId: late.homeworkId,
      submissionId: late.submissionId,
      targetId: late.targetId,
    });

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/teacher/homeworks/classes/${demoAllocationId}/assignments/${submitted.homeworkId}/submissions/${submitted.submissionId}/review`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reviewNote: 'Duplicate review' })
      .expect(409);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/teacher/homeworks/classes/${demoAllocationId}/assignments/${overMax.homeworkId}/submissions/${overMax.submissionId}/review`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ awardedMarks: 11 })
      .expect(422);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/teacher/homeworks/classes/${demoAllocationId}/assignments/${ungraded.homeworkId}/submissions/${ungraded.submissionId}/review`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ awardedMarks: 1 })
      .expect(422);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/teacher/homeworks/classes/${demoAllocationId}/assignments/${draft.homeworkId}/submissions/${draft.submissionId}/review`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reviewNote: 'Hidden draft' })
      .expect(404);

    expect(await countSubmissionSideEffects()).toEqual(sideEffectCountsBefore);
  });

  it('blocks Teacher App access to another teacher and cross-school homework', async () => {
    const { accessToken } = await login(teacherEmail, 'HomeworkTeacher123!');
    const ownedSubmission = await createTeacherReviewSubmission({
      title: `${suffix} teacher review boundary`,
      submissionStatus: HomeworkSubmissionStatus.SUBMITTED,
    });

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

    for (const route of [
      `/teacher/homeworks/classes/${otherTeacherAllocationId}/assignments/${ownedSubmission.homeworkId}/submissions`,
      `/teacher/homeworks/classes/${demoAllocationId}/assignments/${otherTeacherHomeworkId}/submissions`,
      `/teacher/homeworks/classes/${tenantBAllocationId}/assignments/${ownedSubmission.homeworkId}/submissions`,
      `/teacher/homeworks/classes/${demoAllocationId}/assignments/${tenantBHomeworkId}/submissions`,
      `/teacher/homeworks/classes/${demoAllocationId}/assignments/${otherTeacherHomeworkId}/submissions/${ownedSubmission.submissionId}`,
      `/teacher/homeworks/classes/${demoAllocationId}/assignments/${tenantBHomeworkId}/submissions/${ownedSubmission.submissionId}`,
    ]) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}${route}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    }

    for (const route of [
      `/teacher/homeworks/classes/${demoAllocationId}/assignments/${otherTeacherHomeworkId}/submissions/${ownedSubmission.submissionId}/review`,
      `/teacher/homeworks/classes/${demoAllocationId}/assignments/${tenantBHomeworkId}/submissions/${ownedSubmission.submissionId}/review`,
    ]) {
      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}${route}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ reviewNote: 'Hidden' })
        .expect(404);
    }
  });

  it('blocks non-teacher actors from Teacher Homework routes', async () => {
    const ownedSubmission = await createTeacherReviewSubmission({
      title: `${suffix} teacher review actor boundary`,
      submissionStatus: HomeworkSubmissionStatus.SUBMITTED,
    });

    for (const [email, password] of [
      [studentEmail, 'HomeworkStudent123!'],
      [parentEmail, 'HomeworkParent123!'],
      [DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD],
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
      await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/teacher/homeworks/classes/${demoAllocationId}/assignments/${ownedSubmission.homeworkId}/submissions`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .post(
          `${GLOBAL_PREFIX}/teacher/homeworks/classes/${demoAllocationId}/assignments/${ownedSubmission.homeworkId}/submissions/${ownedSubmission.submissionId}/review`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ reviewNote: 'Blocked' })
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

  it('lets students save and submit their own text-only homework submission', async () => {
    const { accessToken } = await login(studentEmail, 'HomeworkStudent123!');
    const ownHomeworkId = await createStudentReadHomework({
      title: `${suffix} student submit own`,
      dueAt: new Date('2027-03-04T10:00:00.000Z'),
    });
    const sideEffectCountsBefore = await countSubmissionSideEffects();

    const draftResponse = await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/student/homeworks/${ownHomeworkId}/submission`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ bodyText: '  Draft answer  ' })
      .expect(200);

    expect(draftResponse.body.submission).toMatchObject({
      homeworkId: ownHomeworkId,
      status: 'draft',
      bodyText: 'Draft answer',
      submittedAt: null,
    });
    expectNoTenantIds(draftResponse.body);
    expect(JSON.stringify(draftResponse.body)).not.toContain('enrollmentId');

    const draftDetail = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/homeworks/${ownHomeworkId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(draftDetail.body.homework).toMatchObject({
      homeworkId: ownHomeworkId,
      submission: expect.objectContaining({
        status: 'draft',
        bodyText: 'Draft answer',
      }),
    });

    const submitResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/student/homeworks/${ownHomeworkId}/submit`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(200);

    expect(submitResponse.body.submission).toMatchObject({
      homeworkId: ownHomeworkId,
      status: 'submitted',
      bodyText: 'Draft answer',
    });
    expect(submitResponse.body.submission.submittedAt).toEqual(
      expect.any(String),
    );
    expectNoTenantIds(submitResponse.body);

    const target = await prisma.homeworkTarget.findFirstOrThrow({
      where: {
        homeworkAssignmentId: ownHomeworkId,
        studentId: demoStudentId,
        enrollmentId: demoEnrollmentId,
      },
      select: { status: true, submittedAt: true },
    });
    expect(target.status).toBe(HomeworkTargetStatus.SUBMITTED);
    expect(target.submittedAt).toBeInstanceOf(Date);

    const submittedDetail = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/homeworks/${ownHomeworkId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(submittedDetail.body.homework).toMatchObject({
      homeworkId: ownHomeworkId,
      status: 'completed',
      targetStatus: 'submitted',
      submission: expect.objectContaining({
        status: 'submitted',
        bodyText: 'Draft answer',
      }),
    });

    const listResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/student/homeworks?status=completed&search=student submit own`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      listResponse.body.homeworks.find(
        (item: { homeworkId: string }) => item.homeworkId === ownHomeworkId,
      ),
    ).toMatchObject({ status: 'completed', targetStatus: 'submitted' });

    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/student/homeworks/${ownHomeworkId}/submission`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ bodyText: 'Cannot edit after submit' })
      .expect(409);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/student/homeworks/${ownHomeworkId}/submit`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ bodyText: 'Cannot submit twice' })
      .expect(409);

    expect(await countSubmissionSideEffects()).toEqual(sideEffectCountsBefore);
  });

  it('hides unsafe student submission targets with safe 404 responses', async () => {
    const { accessToken } = await login(studentEmail, 'HomeworkStudent123!');
    const sameSchoolOtherHomeworkId = await createStudentReadHomework({
      title: `${suffix} student submit other`,
      studentId: demoStudentTwoId,
      enrollmentId: demoEnrollmentTwoId,
    });
    const draftHomeworkId = await createStudentReadHomework({
      title: `${suffix} student submit draft`,
      assignmentStatus: HomeworkAssignmentStatus.DRAFT,
    });
    const cancelledHomeworkId = await createStudentReadHomework({
      title: `${suffix} student submit cancelled`,
      assignmentStatus: HomeworkAssignmentStatus.CANCELLED,
    });

    for (const homeworkId of [
      sameSchoolOtherHomeworkId,
      draftHomeworkId,
      cancelledHomeworkId,
      tenantBHomeworkId,
    ]) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/student/homeworks/${homeworkId}/submission`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .put(`${GLOBAL_PREFIX}/student/homeworks/${homeworkId}/submission`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ bodyText: 'Hidden' })
        .expect(404);
      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/student/homeworks/${homeworkId}/submit`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ bodyText: 'Hidden' })
        .expect(404);
    }
  });

  it('blocks teacher, parent, and school admin actors from Student Homework routes', async () => {
    const ownHomeworkId = await createStudentReadHomework({
      title: `${suffix} student actor boundary`,
    });

    for (const [email, password] of [
      [teacherEmail, 'HomeworkTeacher123!'],
      [parentEmail, 'HomeworkParent123!'],
      [DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD],
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
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/student/homeworks/${ownHomeworkId}/submission`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .put(`${GLOBAL_PREFIX}/student/homeworks/${ownHomeworkId}/submission`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ bodyText: 'Forbidden' })
        .expect(403);
      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/student/homeworks/${ownHomeworkId}/submit`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ bodyText: 'Forbidden' })
        .expect(403);
    }
  });

  it('lets parents read only owned child assigned visible homework', async () => {
    const { accessToken } = await login(parentEmail, 'HomeworkParent123!');
    const ownHomeworkId = await createParentReadHomework({
      title: `${suffix} parent read own`,
    });
    const sameSchoolUnlinkedHomeworkId = await createParentReadHomework({
      title: `${suffix} parent read unlinked`,
      studentId: demoStudentTwoId,
      enrollmentId: demoEnrollmentTwoId,
    });
    const draftHomeworkId = await createParentReadHomework({
      title: `${suffix} parent read draft`,
      assignmentStatus: HomeworkAssignmentStatus.DRAFT,
    });
    const cancelledHomeworkId = await createParentReadHomework({
      title: `${suffix} parent read cancelled`,
      assignmentStatus: HomeworkAssignmentStatus.CANCELLED,
    });
    const archivedHomeworkId = await createParentReadHomework({
      title: `${suffix} parent read archived`,
      assignmentStatus: HomeworkAssignmentStatus.ARCHIVED,
    });
    const deletedHomeworkId = await createParentReadHomework({
      title: `${suffix} parent read deleted`,
      deletedAt: new Date('2026-09-15T08:00:00.000Z'),
    });

    const listResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/parent/children/${demoStudentId}/homeworks?limit=100&search=parent read`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const returnedIds = listResponse.body.homeworks.map(
      (item: { homeworkId: string }) => item.homeworkId,
    );
    expect(returnedIds).toContain(ownHomeworkId);
    expect(returnedIds).not.toContain(sameSchoolUnlinkedHomeworkId);
    expect(returnedIds).not.toContain(draftHomeworkId);
    expect(returnedIds).not.toContain(cancelledHomeworkId);
    expect(returnedIds).not.toContain(archivedHomeworkId);
    expect(returnedIds).not.toContain(deletedHomeworkId);
    expect(listResponse.body.homeworks[0]).toEqual(
      expect.objectContaining({
        status: 'waiting',
        child: expect.objectContaining({
          studentId: demoStudentId,
          displayName: expect.any(String),
        }),
        questionCount: 0,
        attachmentsCount: 0,
      }),
    );
    expect(JSON.stringify(listResponse.body)).not.toContain('enrollmentId');
    expect(JSON.stringify(listResponse.body)).not.toContain('guardian');
    expectNoTenantIds(listResponse.body);

    const detailResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/parent/children/${demoStudentId}/homeworks/${ownHomeworkId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(detailResponse.body.homework).toMatchObject({
      homeworkId: ownHomeworkId,
      child: expect.objectContaining({ studentId: demoStudentId }),
      questions: [],
      attachments: [],
      submission: null,
    });
    expectNoTenantIds(detailResponse.body);

    for (const homeworkId of [
      sameSchoolUnlinkedHomeworkId,
      draftHomeworkId,
      cancelledHomeworkId,
      archivedHomeworkId,
      deletedHomeworkId,
      tenantBHomeworkId,
    ]) {
      await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/parent/children/${demoStudentId}/homeworks/${homeworkId}`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    }

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/children/${demoStudentTwoId}/homeworks`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/children/${tenantBStudentId}/homeworks`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  it('lets parents read owned child homework submission summaries only', async () => {
    const { accessToken } = await login(parentEmail, 'HomeworkParent123!');
    const submittedHomeworkId = await createParentReadHomework({
      title: `${suffix} parent submission submitted`,
      submissionStatus: HomeworkSubmissionStatus.SUBMITTED,
      bodyText: 'Submitted parent-visible answer',
      totalMarks: 10,
      isGraded: true,
    });
    const lateHomeworkId = await createParentReadHomework({
      title: `${suffix} parent submission late`,
      submissionStatus: HomeworkSubmissionStatus.LATE,
      bodyText: 'Late parent-visible answer',
      dueAt: new Date('2026-01-01T10:00:00.000Z'),
      totalMarks: 10,
      isGraded: true,
    });
    const reviewedHomeworkId = await createParentReadHomework({
      title: `${suffix} parent submission reviewed`,
      submissionStatus: HomeworkSubmissionStatus.REVIEWED,
      bodyText: 'Reviewed parent-visible answer',
      reviewNote: 'Strong explanation.',
      awardedMarks: 8.5,
      totalMarks: 10,
      isGraded: true,
    });
    const sameSchoolUnlinkedHomeworkId = await createParentReadHomework({
      title: `${suffix} parent submission unlinked`,
      studentId: demoStudentTwoId,
      enrollmentId: demoEnrollmentTwoId,
      submissionStatus: HomeworkSubmissionStatus.SUBMITTED,
      bodyText: 'Unlinked child answer',
      totalMarks: 10,
      isGraded: true,
    });
    await prisma.homeworkAssignment.update({
      where: { id: tenantBHomeworkId },
      data: {
        status: HomeworkAssignmentStatus.PUBLISHED,
        publishedAt: new Date('2026-09-10T08:00:00.000Z'),
        dueAt: new Date('2027-03-01T10:00:00.000Z'),
      },
    });
    await createSubmissionForExistingHomework({
      schoolId: tenantBSchoolId,
      homeworkId: tenantBHomeworkId,
      studentId: tenantBStudentId,
      enrollmentId: tenantBEnrollmentId,
      status: HomeworkSubmissionStatus.SUBMITTED,
      bodyText: 'Cross-school child answer',
    });

    const sideEffectsBefore = await countSubmissionSideEffects();

    const submitted = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/parent/children/${demoStudentId}/homeworks/${submittedHomeworkId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(submitted.body.homework.submission).toMatchObject({
      status: 'submitted',
      bodyText: 'Submitted parent-visible answer',
      submittedAt: expect.any(String),
      reviewedAt: null,
      reviewNote: null,
      awardedMarks: null,
      totalMarks: 10,
    });

    const late = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/parent/children/${demoStudentId}/homeworks/${lateHomeworkId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(late.body.homework.submission).toMatchObject({
      status: 'late',
      bodyText: 'Late parent-visible answer',
      submittedAt: expect.any(String),
      reviewedAt: null,
      totalMarks: 10,
    });

    const reviewed = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/parent/children/${demoStudentId}/homeworks/${reviewedHomeworkId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(reviewed.body.homework).toMatchObject({
      status: 'completed',
      targetStatus: 'reviewed',
      submission: expect.objectContaining({
        status: 'reviewed',
        bodyText: 'Reviewed parent-visible answer',
        submittedAt: expect.any(String),
        reviewedAt: expect.any(String),
        reviewNote: 'Strong explanation.',
        awardedMarks: 8.5,
        totalMarks: 10,
      }),
      questions: [],
      attachments: [],
      questionCount: 0,
      attachmentsCount: 0,
    });

    for (const body of [submitted.body, late.body, reviewed.body]) {
      expectNoTenantIds(body);
      const serialized = JSON.stringify(body);
      for (const forbidden of [
        'reviewedByUserId',
        'schoolId',
        'organizationId',
        'enrollmentId',
        'deletedAt',
        'gradeAssessmentId',
        'gradeItem',
        'submittedByUserId',
      ]) {
        expect(serialized).not.toContain(forbidden);
      }
    }

    for (const homeworkId of [
      sameSchoolUnlinkedHomeworkId,
      tenantBHomeworkId,
    ]) {
      await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/parent/children/${demoStudentId}/homeworks/${homeworkId}`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    }
    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/parent/children/${demoStudentTwoId}/homeworks/${sameSchoolUnlinkedHomeworkId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/parent/children/${tenantBStudentId}/homeworks/${tenantBHomeworkId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(await countSubmissionSideEffects()).toEqual(sideEffectsBefore);
  });

  it('maps Parent App homework statuses without submission side effects', async () => {
    const { accessToken } = await login(parentEmail, 'HomeworkParent123!');
    const waitingHomeworkId = await createParentReadHomework({
      title: `${suffix} parent status waiting`,
      dueAt: new Date('2027-03-02T10:00:00.000Z'),
    });
    const completedHomeworkId = await createParentReadHomework({
      title: `${suffix} parent status completed`,
      targetStatus: HomeworkTargetStatus.REVIEWED,
      dueAt: new Date('2027-03-03T10:00:00.000Z'),
    });
    const submittedCompletedHomeworkId = await createParentReadHomework({
      title: `${suffix} parent status submitted completed`,
      targetStatus: HomeworkTargetStatus.SUBMITTED,
      dueAt: new Date('2027-03-04T10:00:00.000Z'),
    });
    const lateCompletedHomeworkId = await createParentReadHomework({
      title: `${suffix} parent status late completed`,
      targetStatus: HomeworkTargetStatus.LATE,
      dueAt: new Date('2026-01-02T10:00:00.000Z'),
    });
    const notCompletedHomeworkId = await createParentReadHomework({
      title: `${suffix} parent status not completed`,
      targetStatus: HomeworkTargetStatus.MISSING,
      dueAt: new Date('2026-01-03T10:00:00.000Z'),
    });

    for (const [status, expectedIds] of [
      ['waiting', [waitingHomeworkId]],
      [
        'completed',
        [
          completedHomeworkId,
          submittedCompletedHomeworkId,
          lateCompletedHomeworkId,
        ],
      ],
      ['not_completed', [notCompletedHomeworkId]],
    ] as const) {
      const response = await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/parent/children/${demoStudentId}/homeworks?status=${status}&search=parent status`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const ids = response.body.homeworks.map(
        (item: { homeworkId: string }) => item.homeworkId,
      );
      for (const expectedId of expectedIds) {
        expect(ids).toContain(expectedId);
        expect(
          response.body.homeworks.find(
            (item: { homeworkId: string }) => item.homeworkId === expectedId,
          ),
        ).toMatchObject({ status });
      }

      if (status === 'completed') {
        expect(
          response.body.homeworks.find(
            (item: { homeworkId: string }) =>
              item.homeworkId === lateCompletedHomeworkId,
          ),
        ).toMatchObject({
          status: 'completed',
          targetStatus: 'late',
          submittedAt: expect.any(String),
        });
      }

      if (status === 'not_completed') {
        expect(ids).not.toContain(lateCompletedHomeworkId);
        expect(ids).not.toContain(submittedCompletedHomeworkId);
        expect(ids).not.toContain(completedHomeworkId);
      }
      expectNoTenantIds(response.body);
    }
  });

  it('blocks teacher, student, and school admin actors from Parent Homework routes', async () => {
    const ownHomeworkId = await createParentReadHomework({
      title: `${suffix} parent actor boundary`,
    });

    for (const [email, password] of [
      [teacherEmail, 'HomeworkTeacher123!'],
      [studentEmail, 'HomeworkStudent123!'],
      [DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD],
    ]) {
      const { accessToken } = await login(email, password);
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/parent/children/${demoStudentId}/homeworks`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/parent/children/${demoStudentId}/homeworks/${ownHomeworkId}`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    }
  });

  it('keeps deferred parent submit and upload homework routes unregistered', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    for (const route of [
      '/homework/submissions',
      '/homework/questions',
      '/homework/attachments',
      `/student/homeworks/${demoHomeworkId}/submission/resolve`,
      `/student/homeworks/${demoHomeworkId}/submission/submit`,
      `/student/homeworks/${demoHomeworkId}/attachments`,
      `/student/homeworks/${demoHomeworkId}/files`,
      `/parent/children/${demoStudentId}/homeworks/${demoHomeworkId}/submit`,
      `/parent/children/${demoStudentId}/homeworks/${demoHomeworkId}/submission`,
      `/parent/children/${demoStudentId}/homeworks/${demoHomeworkId}/submission/submit`,
      `/parent/children/${demoStudentId}/homeworks/${demoHomeworkId}/answers`,
      `/parent/children/${demoStudentId}/homeworks/${demoHomeworkId}/questions`,
      `/parent/children/${demoStudentId}/homeworks/${demoHomeworkId}/attachments`,
      `/parent/children/${demoStudentId}/homeworks/${demoHomeworkId}/files`,
    ]) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}${route}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    }
  });
});
