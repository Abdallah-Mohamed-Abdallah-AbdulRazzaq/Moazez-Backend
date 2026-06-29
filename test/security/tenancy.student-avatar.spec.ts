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
import { StorageService } from '../../src/infrastructure/storage/storage.service';

const GLOBAL_PREFIX = '/api/v1';
const E2E_PASSWORD = 'StudentAvatarSecurity123!';
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(90000);

describe('Student avatar tenancy and actor boundaries (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationId: string;
  let schoolId: string;
  let termId: string;
  let classroomId: string;
  let linkedStudentId: string;
  let linkedStudentEmail: string;
  let otherStudentId: string;
  let otherStudentEmail: string;
  let noEnrollmentStudentEmail: string;
  let unlinkedStudentEmail: string;
  let parentEmail: string;
  let applicantEmail: string;
  let staffEmail: string;

  const testSuffix = `student-avatar-security-${Date.now()}`;
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

    const [studentRole, parentRole, staffRole] = await Promise.all([
      findSystemRole('student'),
      findSystemRole('parent'),
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
    termId = academic.termId;
    classroomId = academic.classroomId;

    linkedStudentEmail = `${testSuffix}-student@example.test`;
    const linkedStudentUserId = await createUser({
      email: linkedStudentEmail,
      userType: UserType.STUDENT,
      roleId: studentRole.id,
      withMembership: true,
    });
    linkedStudentId = await createStudentForUser(linkedStudentUserId, true);

    otherStudentEmail = `${testSuffix}-other-student@example.test`;
    const otherStudentUserId = await createUser({
      email: otherStudentEmail,
      userType: UserType.STUDENT,
      roleId: studentRole.id,
      withMembership: true,
    });
    otherStudentId = await createStudentForUser(otherStudentUserId, true);

    noEnrollmentStudentEmail = `${testSuffix}-no-enrollment@example.test`;
    const noEnrollmentUserId = await createUser({
      email: noEnrollmentStudentEmail,
      userType: UserType.STUDENT,
      roleId: studentRole.id,
      withMembership: true,
    });
    await createStudentForUser(noEnrollmentUserId, false);

    unlinkedStudentEmail = `${testSuffix}-unlinked@example.test`;
    await createUser({
      email: unlinkedStudentEmail,
      userType: UserType.STUDENT,
      roleId: studentRole.id,
      withMembership: true,
    });

    parentEmail = `${testSuffix}-parent@example.test`;
    await createUser({
      email: parentEmail,
      userType: UserType.PARENT,
      roleId: parentRole.id,
      withMembership: true,
    });

    applicantEmail = `${testSuffix}-applicant@example.test`;
    await createUser({
      email: applicantEmail,
      userType: UserType.APPLICANT,
      roleId: null,
      withMembership: false,
    });

    staffEmail = `${testSuffix}-staff@example.test`;
    await createUser({
      email: staffEmail,
      userType: UserType.SCHOOL_USER,
      roleId: staffRole.id,
      withMembership: true,
    });

    const storageService = {
      saveObject: jest.fn().mockResolvedValue({
        bucket: 'student-avatar-private',
        etag: 'fake-etag',
      }),
      deleteObject: jest.fn().mockResolvedValue(undefined),
      createDownloadUrl: jest.fn().mockResolvedValue('https://signed.invalid'),
      ensureBucketsAvailable: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StorageService)
      .useValue(storageService)
      .compile();

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
      await prisma.student.updateMany({
        where: { id: { in: createdStudentIds } },
        data: { avatarFileId: null },
      });
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { actorId: { in: createdUserIds } },
            { resourceId: { in: createdStudentIds } },
          ],
        },
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
      await prisma.file.deleteMany({
        where: {
          schoolId,
          originalName: { startsWith: testSuffix },
        },
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

  it('allows only the authenticated linked student to mutate their own avatar', async () => {
    const linkedToken = await login(linkedStudentEmail);
    const otherToken = await login(otherStudentEmail);

    const upload = await uploadAvatar(linkedToken, `${testSuffix}-linked.png`)
      .expect(201);
    expect(upload.body.student.studentId).toBe(linkedStudentId);
    expect(upload.body.student).not.toHaveProperty('userId');
    expect(upload.body.avatar.fileId).toEqual(expect.any(String));
    assertNoAvatarLeaks(upload.body);

    const otherUpload = await uploadAvatar(
      otherToken,
      `${testSuffix}-other.png`,
    ).expect(201);
    expect(otherUpload.body.student.studentId).toBe(otherStudentId);

    const linkedStudent = await prisma.student.findUnique({
      where: { id: linkedStudentId },
      select: { avatarFileId: true },
    });
    const otherStudent = await prisma.student.findUnique({
      where: { id: otherStudentId },
      select: { avatarFileId: true },
    });
    expect(linkedStudent?.avatarFileId).toBe(upload.body.avatar.fileId);
    expect(otherStudent?.avatarFileId).toBe(otherUpload.body.avatar.fileId);
    expect(linkedStudent?.avatarFileId).not.toBe(otherStudent?.avatarFileId);

    const deleteResponse = await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/student/profile/avatar`)
      .set('Authorization', `Bearer ${linkedToken}`)
      .expect(200);

    expect(deleteResponse.body.student.studentId).toBe(linkedStudentId);
    expect(deleteResponse.body.avatar).toBeNull();
    assertNoAvatarLeaks(deleteResponse.body);
  });

  it('blocks non-student actors from Student App avatar routes', async () => {
    for (const email of [parentEmail, staffEmail]) {
      const token = await login(email);

      await uploadAvatar(token, `${testSuffix}-blocked.png`).expect(403);
      await request(app.getHttpServer())
        .delete(`${GLOBAL_PREFIX}/student/profile/avatar`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    }
  });

  it('blocks applicant actors from Student App avatar routes', async () => {
    const token = await login(applicantEmail);

    await uploadAvatar(token, `${testSuffix}-applicant.png`).expect(403);
    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/student/profile/avatar`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('blocks unlinked students and students without active enrollment', async () => {
    for (const email of [unlinkedStudentEmail, noEnrollmentStudentEmail]) {
      const token = await login(email);

      await uploadAvatar(token, `${testSuffix}-missing-link.png`).expect(404);
      await request(app.getHttpServer())
        .delete(`${GLOBAL_PREFIX}/student/profile/avatar`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    }
  });

  function uploadAvatar(accessToken: string, filename: string) {
    return request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/student/profile/avatar`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', Buffer.alloc(128, 65), {
        filename,
        contentType: 'image/png',
      });
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

  async function createUser(params: {
    email: string;
    userType: UserType;
    roleId: string | null;
    withMembership: boolean;
  }): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: params.email,
        firstName: 'Avatar',
        lastName: params.userType.toLowerCase(),
        userType: params.userType,
        status: UserStatus.ACTIVE,
        passwordHash: await argon2.hash(E2E_PASSWORD, ARGON2_OPTIONS),
      },
      select: { id: true },
    });
    createdUserIds.push(user.id);

    if (params.withMembership) {
      if (!params.roleId) {
        throw new Error(`Missing role for ${params.email}`);
      }
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
        firstName: 'Avatar',
        lastName: 'Student',
        status: StudentStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdStudentIds.push(student.id);

    if (withEnrollment) {
      const yearId = createdYearIds[0];
      const enrollment = await prisma.enrollment.create({
        data: {
          schoolId,
          studentId: student.id,
          academicYearId: yearId,
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

  async function createAcademicFixture(): Promise<{
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

    const createdTerm = await prisma.term.create({
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
    createdTermIds.push(createdTerm.id);

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
      termId: createdTerm.id,
      classroomId: classroom.id,
    };
  }
});

function assertNoAvatarLeaks(body: unknown): void {
  const serialized = JSON.stringify(body);
  for (const forbidden of [
    'schoolId',
    'organizationId',
    'membershipId',
    'roleId',
    'userId',
    'applicationId',
    'bucket',
    'objectKey',
    'signedUrl',
    'https://signed.invalid',
    'password',
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}
