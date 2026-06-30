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
import { AppModule } from '../../src/app.module';

const GLOBAL_PREFIX = '/api/v1';
const E2E_PASSWORD = 'StudentProfileCorrectionSecurity123!';
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(90000);

describe('Student profile correction request tenancy and actor boundaries', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationId: string;
  let schoolId: string;
  let schoolBId: string;
  let academicYearId: string;
  let termId: string;
  let classroomId: string;
  let studentAEmail: string;
  let studentBEmail: string;
  let noEnrollmentStudentEmail: string;
  let unlinkedStudentEmail: string;
  let parentEmail: string;
  let applicantEmail: string;
  let staffAEmail: string;
  let staffBEmail: string;
  let staffNoManageEmail: string;

  const testSuffix = `stu-prof-corr-sec-${Date.now()}`;
  const createdUserIds: string[] = [];
  const createdStudentIds: string[] = [];
  const createdEnrollmentIds: string[] = [];
  const createdClassroomIds: string[] = [];
  const createdSectionIds: string[] = [];
  const createdGradeIds: string[] = [];
  const createdStageIds: string[] = [];
  const createdTermIds: string[] = [];
  const createdYearIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdOrganizationIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [studentRole, parentRole, schoolAdminRole, teacherRole] =
      await Promise.all([
      findSystemRole('student'),
      findSystemRole('parent'),
      findSystemRole('school_admin'),
      findSystemRole('teacher'),
    ]);

    const org = await prisma.organization.create({
      data: {
        slug: `${testSuffix}-org`,
        name: `${testSuffix} Org`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    organizationId = org.id;
    createdOrganizationIds.push(org.id);

    const school = await prisma.school.create({
      data: {
        organizationId,
        slug: `${testSuffix}-school-a`,
        name: `${testSuffix} School A`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    schoolId = school.id;
    createdSchoolIds.push(school.id);
    await prisma.schoolProfile.create({
      data: { schoolId, schoolName: `${testSuffix} A`, shortName: 'A' },
    });

    const schoolB = await prisma.school.create({
      data: {
        organizationId,
        slug: `${testSuffix}-school-b`,
        name: `${testSuffix} School B`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    schoolBId = schoolB.id;
    createdSchoolIds.push(schoolB.id);
    await prisma.schoolProfile.create({
      data: { schoolId: schoolBId, schoolName: `${testSuffix} B`, shortName: 'B' },
    });

    const academic = await createAcademicFixture(schoolId);
    academicYearId = academic.academicYearId;
    termId = academic.termId;
    classroomId = academic.classroomId;

    studentAEmail = `${testSuffix}-student-a@example.test`;
    const studentAUserId = await createUser({
      email: studentAEmail,
      userType: UserType.STUDENT,
      roleId: studentRole.id,
      membershipSchoolId: schoolId,
    });
    await createStudentForUser(studentAUserId, true);

    studentBEmail = `${testSuffix}-student-b@example.test`;
    const studentBUserId = await createUser({
      email: studentBEmail,
      userType: UserType.STUDENT,
      roleId: studentRole.id,
      membershipSchoolId: schoolId,
    });
    await createStudentForUser(studentBUserId, true);

    noEnrollmentStudentEmail = `${testSuffix}-no-enrollment@example.test`;
    const noEnrollmentUserId = await createUser({
      email: noEnrollmentStudentEmail,
      userType: UserType.STUDENT,
      roleId: studentRole.id,
      membershipSchoolId: schoolId,
    });
    await createStudentForUser(noEnrollmentUserId, false);

    unlinkedStudentEmail = `${testSuffix}-unlinked@example.test`;
    await createUser({
      email: unlinkedStudentEmail,
      userType: UserType.STUDENT,
      roleId: studentRole.id,
      membershipSchoolId: schoolId,
    });

    parentEmail = `${testSuffix}-parent@example.test`;
    await createUser({
      email: parentEmail,
      userType: UserType.PARENT,
      roleId: parentRole.id,
      membershipSchoolId: schoolId,
    });

    applicantEmail = `${testSuffix}-applicant@example.test`;
    await createUser({
      email: applicantEmail,
      userType: UserType.APPLICANT,
      roleId: null,
      membershipSchoolId: null,
    });

    staffAEmail = `${testSuffix}-staff-a@example.test`;
    await createUser({
      email: staffAEmail,
      userType: UserType.SCHOOL_USER,
      roleId: schoolAdminRole.id,
      membershipSchoolId: schoolId,
    });

    staffBEmail = `${testSuffix}-staff-b@example.test`;
    await createUser({
      email: staffBEmail,
      userType: UserType.SCHOOL_USER,
      roleId: schoolAdminRole.id,
      membershipSchoolId: schoolBId,
    });

    staffNoManageEmail = `${testSuffix}-staff-no-manage@example.test`;
    await createUser({
      email: staffNoManageEmail,
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
      membershipSchoolId: schoolId,
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
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { actorId: { in: createdUserIds } },
            { resourceId: { in: createdStudentIds } },
          ],
        },
      });
      await prisma.studentProfileCorrectionRequest.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.session.deleteMany({
        where: { userId: { in: createdUserIds } },
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
      await prisma.role.deleteMany({
        where: { id: { in: createdRoleIds } },
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

  it('blocks wrong actors and inactive Student App chains', async () => {
    for (const email of [parentEmail, applicantEmail]) {
      const token = await login(email);

      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/student/profile/correction-requests`)
        .set('Authorization', `Bearer ${token}`)
        .send({ changes: { firstName: 'Blocked' } })
        .expect(403);
    }

    for (const email of [unlinkedStudentEmail, noEnrollmentStudentEmail]) {
      const token = await login(email);

      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/student/profile/correction-requests`)
        .set('Authorization', `Bearer ${token}`)
        .send({ changes: { firstName: 'Blocked' } })
        .expect(404);
    }
  });

  it('does not allow one student to read or cancel another student request', async () => {
    const studentAToken = await login(studentAEmail);
    const studentBToken = await login(studentBEmail);
    const submit = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/student/profile/correction-requests`)
      .set('Authorization', `Bearer ${studentAToken}`)
      .send({ changes: { firstName: 'StudentAOnly' } })
      .expect(201);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/profile/correction-requests/${submit.body.id}`)
      .set('Authorization', `Bearer ${studentBToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/student/profile/correction-requests/${submit.body.id}/cancel`)
      .set('Authorization', `Bearer ${studentBToken}`)
      .expect(404);
  });

  it('blocks cross-school staff guesses and staff missing manage permission', async () => {
    const studentToken = await login(studentAEmail);
    const staffAToken = await login(staffAEmail);
    const staffBToken = await login(staffBEmail);
    const noManageToken = await login(staffNoManageEmail);
    const submit = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/student/profile/correction-requests`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ changes: { city: 'Alexandria' } })
      .expect(201);

    const staffRead = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/students-guardians/profile-correction-requests/${submit.body.id}`)
      .set('Authorization', `Bearer ${staffAToken}`)
      .expect(200);
    assertNoCorrectionLeaks(staffRead.body);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/students-guardians/profile-correction-requests/${submit.body.id}`)
      .set('Authorization', `Bearer ${staffBToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/profile-correction-requests/${submit.body.id}/approve`)
      .set('Authorization', `Bearer ${staffBToken}`)
      .send({ reviewerNote: 'cross-school denied' })
      .expect(404);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/profile-correction-requests/${submit.body.id}/approve`)
      .set('Authorization', `Bearer ${noManageToken}`)
      .send({ reviewerNote: 'missing manage permission' })
      .expect(403);
  });

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: E2E_PASSWORD });

    if (response.status !== 200) {
      throw new Error(
        `Login failed for ${email}: ${response.status} ${JSON.stringify(
          response.body,
        )}`,
      );
    }

    return response.body.accessToken;
  }

  async function findSystemRole(key: string): Promise<{ id: string }> {
    const role = await prisma.role.findFirst({
      where: {
        key,
        schoolId: null,
        isSystem: true,
      },
      select: { id: true },
    });

    if (!role) {
      throw new Error(`Missing system role: ${key}`);
    }

    return role;
  }

  async function createUser(params: {
    email: string;
    userType: UserType;
    roleId: string | null;
    membershipSchoolId: string | null;
  }): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: params.email,
        firstName: 'Security',
        lastName: params.userType.toLowerCase(),
        userType: params.userType,
        status: UserStatus.ACTIVE,
        passwordHash: await argon2.hash(E2E_PASSWORD, ARGON2_OPTIONS),
      },
      select: { id: true },
    });
    createdUserIds.push(user.id);

    if (params.membershipSchoolId && params.roleId) {
      await prisma.membership.create({
        data: {
          userId: user.id,
          organizationId,
          schoolId: params.membershipSchoolId,
          roleId: params.roleId,
          userType: params.userType,
          status: MembershipStatus.ACTIVE,
        },
      });
    }

    return user.id;
  }

  async function createStudentForUser(
    userId: string,
    withEnrollment: boolean,
  ): Promise<string> {
    const student = await prisma.student.create({
      data: {
        schoolId,
        organizationId,
        userId,
        firstName: 'Security',
        lastName: 'Student',
        status: StudentStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdStudentIds.push(student.id);

    if (withEnrollment) {
      const enrollment = await prisma.enrollment.create({
        data: {
          schoolId,
          studentId: student.id,
          academicYearId,
          termId,
          classroomId,
          status: StudentEnrollmentStatus.ACTIVE,
          enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
        },
        select: { id: true },
      });
      createdEnrollmentIds.push(enrollment.id);
    }

    return student.id;
  }

  async function createAcademicFixture(targetSchoolId: string): Promise<{
    academicYearId: string;
    termId: string;
    classroomId: string;
  }> {
    const year = await prisma.academicYear.create({
      data: {
        schoolId: targetSchoolId,
        nameAr: `${testSuffix}-${targetSchoolId}-year-ar`,
        nameEn: `${testSuffix}-${targetSchoolId}-year`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-06-30T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    createdYearIds.push(year.id);

    const term = await prisma.term.create({
      data: {
        schoolId: targetSchoolId,
        academicYearId: year.id,
        nameAr: `${testSuffix}-${targetSchoolId}-term-ar`,
        nameEn: `${testSuffix}-${targetSchoolId}-term`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    createdTermIds.push(term.id);

    const stage = await prisma.stage.create({
      data: {
        schoolId: targetSchoolId,
        nameAr: `${testSuffix}-${targetSchoolId}-stage-ar`,
        nameEn: `${testSuffix}-${targetSchoolId}-stage`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    createdStageIds.push(stage.id);

    const grade = await prisma.grade.create({
      data: {
        schoolId: targetSchoolId,
        stageId: stage.id,
        nameAr: `${testSuffix}-${targetSchoolId}-grade-ar`,
        nameEn: `${testSuffix}-${targetSchoolId}-grade`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    createdGradeIds.push(grade.id);

    const section = await prisma.section.create({
      data: {
        schoolId: targetSchoolId,
        gradeId: grade.id,
        nameAr: `${testSuffix}-${targetSchoolId}-section-ar`,
        nameEn: `${testSuffix}-${targetSchoolId}-section`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    createdSectionIds.push(section.id);

    const classroom = await prisma.classroom.create({
      data: {
        schoolId: targetSchoolId,
        sectionId: section.id,
        nameAr: `${testSuffix}-${targetSchoolId}-classroom-ar`,
        nameEn: `${testSuffix}-${targetSchoolId}-classroom`,
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
});

function assertNoCorrectionLeaks(body: unknown): void {
  const serialized = JSON.stringify(body);
  for (const forbidden of [
    'schoolId',
    'organizationId',
    'membershipId',
    'roleId',
    'requestedByUserId',
    'approvedBy',
    'rejectedBy',
    'cancelledBy',
    'userId',
    'applicationId',
    'password',
    'token',
    'bucket',
    'objectKey',
    'signedUrl',
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}
