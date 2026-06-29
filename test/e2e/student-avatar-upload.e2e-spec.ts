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
import { STUDENT_AVATAR_MAX_SIZE_BYTES } from '../../src/modules/student-app/profile/domain/student-avatar.constraints';

const GLOBAL_PREFIX = '/api/v1';
const E2E_PASSWORD = 'StudentAvatar123!';
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(90000);

describe('Student avatar upload foundation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let storageService: {
    saveObject: jest.Mock;
    deleteObject: jest.Mock;
    createDownloadUrl: jest.Mock;
    ensureBucketsAvailable: jest.Mock;
  };

  let organizationId: string;
  let schoolId: string;
  let academicYearId: string;
  let termId: string;
  let classroomId: string;
  let studentId: string;
  let studentEmail: string;

  const testSuffix = `student-avatar-${Date.now()}`;
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

    const studentRole = await findSystemRole('student');

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
        firstName: 'Avatar',
        lastName: 'Student',
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

    storageService = {
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

  it('returns a no-leak profile with null avatar before upload', async () => {
    const accessToken = await login(studentEmail);

    const profile = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/profile`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(profile.body.student).toMatchObject({
      studentId,
      displayName: 'Avatar Student',
      avatarUrl: null,
      status: 'active',
    });
    expect(profile.body.student).not.toHaveProperty('userId');
    expect(profile.body.avatar).toBeNull();
    assertNoAvatarLeaks(profile.body);
  });

  it('uploads, replaces, and deletes the current student avatar safely', async () => {
    const accessToken = await login(studentEmail);

    const upload = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/student/profile/avatar`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', imageBuffer(), {
        filename: `${testSuffix}-avatar.png`,
        contentType: 'image/png',
      })
      .expect(201);

    expect(upload.body.student).toMatchObject({
      studentId,
      avatarUrl: expect.stringMatching(
        /^\/api\/v1\/files\/[-0-9a-f]+\/download$/,
      ),
    });
    expect(upload.body.student).not.toHaveProperty('userId');
    expect(upload.body.avatar).toMatchObject({
      fileId: expect.any(String),
      url: upload.body.student.avatarUrl,
      mimeType: 'image/png',
      sizeBytes: imageBuffer().byteLength,
    });
    assertNoAvatarLeaks(upload.body);

    const firstFileId = upload.body.avatar.fileId;
    await expectStudentAvatarFile(firstFileId);

    const replacement = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/student/profile/avatar`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', imageBuffer(256), {
        filename: `${testSuffix}-avatar.webp`,
        contentType: 'image/webp',
      })
      .expect(201);

    const secondFileId = replacement.body.avatar.fileId;
    expect(secondFileId).not.toBe(firstFileId);
    expect(replacement.body.avatar).toMatchObject({
      fileId: secondFileId,
      mimeType: 'image/webp',
      sizeBytes: 256,
    });
    await expectStudentAvatarFile(secondFileId);

    const deleteResponse = await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/student/profile/avatar`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(deleteResponse.body.student).toMatchObject({
      studentId,
      avatarUrl: null,
    });
    expect(deleteResponse.body.avatar).toBeNull();
    assertNoAvatarLeaks(deleteResponse.body);

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { avatarFileId: true },
    });
    expect(student?.avatarFileId).toBeNull();

    await expectStudentAvatarFile(firstFileId);
    await expectStudentAvatarFile(secondFileId);
  });

  it('rejects invalid MIME and oversized avatar files', async () => {
    const accessToken = await login(studentEmail);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/student/profile/avatar`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', Buffer.from('not an image'), {
        filename: `${testSuffix}-avatar.txt`,
        contentType: 'text/plain',
      })
      .expect(415);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/student/profile/avatar`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', Buffer.alloc(STUDENT_AVATAR_MAX_SIZE_BYTES + 1, 65), {
        filename: `${testSuffix}-avatar.png`,
        contentType: 'image/png',
      })
      .expect(413);
  });

  it('keeps official profile fields read-only', async () => {
    const accessToken = await login(studentEmail);

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/student/profile`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ firstName: 'Changed' })
      .expect(404);
  });

  async function expectStudentAvatarFile(fileId: string): Promise<void> {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { avatarFileId: true },
    });
    const file = await prisma.file.findUnique({
      where: { id: fileId },
      select: {
        id: true,
        schoolId: true,
        bucket: true,
        objectKey: true,
        deletedAt: true,
      },
    });

    expect(file).toMatchObject({
      id: fileId,
      schoolId,
      deletedAt: null,
    });

    if (student?.avatarFileId === fileId) {
      expect(student.avatarFileId).toBe(fileId);
    }
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
        firstName: 'Avatar',
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

function imageBuffer(size = 128): Buffer {
  return Buffer.alloc(size, 65);
}

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
    'token',
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}
