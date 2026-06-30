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
const E2E_PASSWORD = 'StudentProfileCorrection123!';
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(90000);

describe('Student profile correction requests (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationId: string;
  let schoolId: string;
  let academicYearId: string;
  let termId: string;
  let classroomId: string;
  let studentId: string;
  let studentEmail: string;
  let adminEmail: string;

  const testSuffix = `student-profile-correction-${Date.now()}`;
  const createdUserIds: string[] = [];
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

    const [studentRole, schoolAdminRole] = await Promise.all([
      findSystemRole('student'),
      findSystemRole('school_admin'),
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
    createdOrganizationIds.push(organization.id);

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
    createdSchoolIds.push(school.id);

    await prisma.schoolProfile.create({
      data: {
        schoolId,
        schoolName: `${testSuffix} School Profile`,
        shortName: `${testSuffix} SP`,
      },
    });

    const academic = await createAcademicFixture();
    academicYearId = academic.academicYearId;
    termId = academic.termId;
    classroomId = academic.classroomId;

    adminEmail = `${testSuffix}-admin@example.test`;
    await createUserWithMembership({
      email: adminEmail,
      userType: UserType.SCHOOL_USER,
      roleId: schoolAdminRole.id,
    });

    studentEmail = `${testSuffix}-student@example.test`;
    const studentUserId = await createUserWithMembership({
      email: studentEmail,
      userType: UserType.STUDENT,
      roleId: studentRole.id,
    });

    const student = await prisma.student.create({
      data: {
        schoolId,
        organizationId,
        userId: studentUserId,
        firstName: 'Original',
        lastName: 'Student',
        gender: 'FEMALE',
        birthDate: new Date('2010-01-01T00:00:00.000Z'),
        studentEmail: 'original@example.test',
        status: StudentStatus.ACTIVE,
      },
      select: { id: true },
    });
    studentId = student.id;
    createdStudentIds.push(student.id);

    const enrollment = await prisma.enrollment.create({
      data: {
        schoolId,
        studentId,
        academicYearId,
        termId,
        classroomId,
        status: StudentEnrollmentStatus.ACTIVE,
        enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
      },
      select: { id: true },
    });
    createdEnrollmentIds.push(enrollment.id);

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
        where: { schoolId },
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

  it('covers submit, own list/read/cancel, staff approve/reject, and read-only profile boundary', async () => {
    const studentToken = await login(studentEmail);
    const adminToken = await login(adminEmail);

    const submit = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/student/profile/correction-requests`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        changes: {
          firstName: 'Corrected',
          studentEmail: 'corrected@example.test',
        },
        reason: 'Please fix my profile.',
      })
      .expect(201);

    expect(submit.body).toMatchObject({
      status: 'PENDING',
      requestedChanges: {
        firstName: 'Corrected',
        studentEmail: 'corrected@example.test',
      },
      reason: 'Please fix my profile.',
      resolvedAt: null,
      cancelledAt: null,
    });
    assertNoCorrectionLeaks(submit.body);

    await expectStudentProfile({
      firstName: 'Original',
      studentEmail: 'original@example.test',
    });

    const requestId = submit.body.id;
    const ownList = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/profile/correction-requests`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    expect(ownList.body.map((item: { id: string }) => item.id)).toContain(
      requestId,
    );
    assertNoCorrectionLeaks(ownList.body);

    const ownRead = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/profile/correction-requests/${requestId}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    expect(ownRead.body.id).toBe(requestId);
    assertNoCorrectionLeaks(ownRead.body);

    const staffRead = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/students-guardians/profile-correction-requests/${requestId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(staffRead.body).toMatchObject({
      id: requestId,
      student: {
        studentId,
        displayName: 'Original Student',
      },
      currentSnapshot: {
        firstName: 'Original',
        studentEmail: 'original@example.test',
      },
    });
    assertNoCorrectionLeaks(staffRead.body);

    const approve = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/profile-correction-requests/${requestId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reviewerNote: 'Approved.' })
      .expect(200);
    expect(approve.body.status).toBe('APPROVED');
    expect(approve.body.resolvedAt).toEqual(expect.any(String));
    assertNoCorrectionLeaks(approve.body);

    await expectStudentProfile({
      firstName: 'Corrected',
      studentEmail: 'corrected@example.test',
    });

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/student/profile/correction-requests/${requestId}/cancel`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(409);

    const rejectSubmit = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/student/profile/correction-requests`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        changes: {
          lastName: 'Rejected',
        },
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/profile-correction-requests/${rejectSubmit.body.id}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reviewerNote: 'No supporting data.' })
      .expect(200)
      .expect((response) => {
        expect(response.body.status).toBe('REJECTED');
        assertNoCorrectionLeaks(response.body);
      });

    const studentAfterReject = await prisma.student.findUnique({
      where: { id: studentId },
      select: { lastName: true },
    });
    expect(studentAfterReject?.lastName).toBe('Student');

    const cancelSubmit = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/student/profile/correction-requests`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        changes: {
          city: 'Cairo',
        },
      })
      .expect(201);

    const cancel = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/student/profile/correction-requests/${cancelSubmit.body.id}/cancel`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    expect(cancel.body.status).toBe('CANCELLED');
    expect(cancel.body.cancelledAt).toEqual(expect.any(String));
    assertNoCorrectionLeaks(cancel.body);

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/student/profile`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ firstName: 'DirectEditBlocked' })
      .expect(404);
  });

  async function expectStudentProfile(expected: {
    firstName: string;
    studentEmail: string;
  }): Promise<void> {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: {
        firstName: true,
        studentEmail: true,
      },
    });

    expect(student).toMatchObject(expected);
  }

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: E2E_PASSWORD })
      .expect(200);

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

  async function createUserWithMembership(params: {
    email: string;
    userType: UserType;
    roleId: string;
  }): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: params.email,
        firstName: 'Profile',
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

  async function createAcademicFixture(): Promise<{
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
