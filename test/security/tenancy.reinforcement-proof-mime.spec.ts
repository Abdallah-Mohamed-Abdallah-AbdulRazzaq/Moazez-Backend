import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  FileVisibility,
  MembershipStatus,
  PrismaClient,
  ReinforcementProofType,
  ReinforcementSource,
  ReinforcementTaskStatus,
  StudentEnrollmentStatus,
  StudentStatus,
  UserType,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { StorageService } from '../../src/infrastructure/storage/storage.service';

const GLOBAL_PREFIX = '/api/v1';
const TEST_PASSWORD = 'G06-Security-Password!';
const CRC32_TABLE = createCrc32Table();

interface ErrorEnvelopeBody {
  error: {
    code: string;
    message: string;
    traceId: string;
  };
}

function readResponseBody<T>(response: { body: unknown }): T {
  return response.body as T;
}

jest.setTimeout(180_000);

describe('G06 Reinforcement proof MIME HTTP and tenancy boundary', () => {
  const marker = `g06-proof-security-${randomUUID().slice(0, 8)}`;
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let storage: StorageService;
  let organizationAId: string;
  let organizationBId: string;
  let schoolAId: string;
  let schoolBId: string;
  let schoolActorId: string;
  let noPermissionActorId: string;
  let teacherActorId: string;
  let studentActorId: string;
  let otherStudentActorId: string;
  let crossSchoolStudentActorId: string;
  let studentAId: string;
  let otherStudentId: string;
  let crossSchoolStudentId: string;
  let studentAEnrollmentId: string;
  let otherStudentEnrollmentId: string;
  let crossSchoolEnrollmentId: string;
  let schoolAAcademic: AcademicFixture;
  let schoolBAcademic: AcademicFixture;
  const userIds: string[] = [];
  const roleIds: string[] = [];
  const taskIds: string[] = [];
  const fileIds: string[] = [];
  const objectKeys: string[] = [];

  beforeAll(async () => {
    assertDisposableEnvironment();
    prisma = new PrismaClient();
    await prisma.$connect();

    const [organizationA, organizationB] = await Promise.all([
      prisma.organization.create({
        data: { name: `${marker}-organization-a`, slug: `${marker}-org-a` },
        select: { id: true },
      }),
      prisma.organization.create({
        data: { name: `${marker}-organization-b`, slug: `${marker}-org-b` },
        select: { id: true },
      }),
    ]);
    organizationAId = organizationA.id;
    organizationBId = organizationB.id;
    const [schoolA, schoolB] = await Promise.all([
      prisma.school.create({
        data: {
          organizationId: organizationAId,
          name: `${marker}-school-a`,
          slug: `${marker}-school-a`,
        },
        select: { id: true },
      }),
      prisma.school.create({
        data: {
          organizationId: organizationBId,
          name: `${marker}-school-b`,
          slug: `${marker}-school-b`,
        },
        select: { id: true },
      }),
    ]);
    schoolAId = schoolA.id;
    schoolBId = schoolB.id;

    const [tasksManage, submissionsSubmit] = await Promise.all([
      prisma.permission.findUnique({
        where: { code: 'reinforcement.tasks.manage' },
        select: { id: true },
      }),
      prisma.permission.findUnique({
        where: { code: 'reinforcement.submissions.submit' },
        select: { id: true },
      }),
    ]);
    if (!tasksManage || !submissionsSubmit) {
      throw new Error('G06 security permissions must be seeded');
    }

    const [managerRoleId, noPermissionRoleId, teacherRoleId, studentRoleAId] =
      await Promise.all([
        createRole(schoolAId, 'manager', [
          tasksManage.id,
          submissionsSubmit.id,
        ]),
        createRole(schoolAId, 'no-permission', []),
        createRole(schoolAId, 'teacher', [tasksManage.id]),
        createRole(schoolAId, 'student', [submissionsSubmit.id]),
      ]);
    const studentRoleBId = await createRole(schoolBId, 'student', [
      submissionsSubmit.id,
    ]);
    const passwordHash = await argon2.hash(TEST_PASSWORD, {
      type: argon2.argon2id,
      memoryCost: 19 * 1024,
      timeCost: 2,
      parallelism: 1,
    });

    schoolActorId = await createUserWithMembership({
      label: 'school-actor',
      userType: UserType.SCHOOL_USER,
      organizationId: organizationAId,
      schoolId: schoolAId,
      roleId: managerRoleId,
      passwordHash,
    });
    noPermissionActorId = await createUserWithMembership({
      label: 'no-permission-actor',
      userType: UserType.SCHOOL_USER,
      organizationId: organizationAId,
      schoolId: schoolAId,
      roleId: noPermissionRoleId,
      passwordHash,
    });
    teacherActorId = await createUserWithMembership({
      label: 'teacher-actor',
      userType: UserType.TEACHER,
      organizationId: organizationAId,
      schoolId: schoolAId,
      roleId: teacherRoleId,
      passwordHash,
    });
    studentActorId = await createUserWithMembership({
      label: 'student-actor',
      userType: UserType.STUDENT,
      organizationId: organizationAId,
      schoolId: schoolAId,
      roleId: studentRoleAId,
      passwordHash,
    });
    otherStudentActorId = await createUserWithMembership({
      label: 'other-student-actor',
      userType: UserType.STUDENT,
      organizationId: organizationAId,
      schoolId: schoolAId,
      roleId: studentRoleAId,
      passwordHash,
    });
    crossSchoolStudentActorId = await createUserWithMembership({
      label: 'cross-school-student-actor',
      userType: UserType.STUDENT,
      organizationId: organizationBId,
      schoolId: schoolBId,
      roleId: studentRoleBId,
      passwordHash,
    });

    schoolAAcademic = await createAcademicFixture(schoolAId, 'a');
    schoolBAcademic = await createAcademicFixture(schoolBId, 'b');
    ({ studentId: studentAId, enrollmentId: studentAEnrollmentId } =
      await createStudentFixture({
        label: 'student-a',
        organizationId: organizationAId,
        schoolId: schoolAId,
        userId: studentActorId,
        academic: schoolAAcademic,
      }));
    ({ studentId: otherStudentId, enrollmentId: otherStudentEnrollmentId } =
      await createStudentFixture({
        label: 'student-other',
        organizationId: organizationAId,
        schoolId: schoolAId,
        userId: otherStudentActorId,
        academic: schoolAAcademic,
      }));
    ({
      studentId: crossSchoolStudentId,
      enrollmentId: crossSchoolEnrollmentId,
    } = await createStudentFixture({
      label: 'student-cross-school',
      organizationId: organizationBId,
      schoolId: schoolBId,
      userId: crossSchoolStudentActorId,
      academic: schoolBAcademic,
    }));

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(GLOBAL_PREFIX.replace(/^\//u, ''));
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    storage = app.get(StorageService);
  });

  afterAll(async () => {
    if (storage) {
      const bucket = process.env.STORAGE_BUCKET ?? '';
      for (const objectKey of objectKeys) {
        await storage
          .deleteObject({ bucket, objectKey })
          .catch(() => undefined);
      }
    }
    if (app) await app.close();
    if (!prisma) return;

    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.reinforcementSubmission.updateMany({
      where: { taskId: { in: taskIds } },
      data: { currentReviewId: null },
    });
    await prisma.reinforcementReview.deleteMany({
      where: { taskId: { in: taskIds } },
    });
    await prisma.reinforcementSubmission.deleteMany({
      where: { taskId: { in: taskIds } },
    });
    await prisma.reinforcementAssignment.deleteMany({
      where: { taskId: { in: taskIds } },
    });
    await prisma.reinforcementTaskStage.deleteMany({
      where: { taskId: { in: taskIds } },
    });
    await prisma.reinforcementTask.deleteMany({
      where: { id: { in: taskIds } },
    });
    await prisma.file.deleteMany({ where: { id: { in: fileIds } } });
    await prisma.enrollment.deleteMany({
      where: {
        id: {
          in: [
            studentAEnrollmentId,
            otherStudentEnrollmentId,
            crossSchoolEnrollmentId,
          ],
        },
      },
    });
    await prisma.student.deleteMany({
      where: {
        id: { in: [studentAId, otherStudentId, crossSchoolStudentId] },
      },
    });
    await deleteAcademicFixture(schoolAAcademic);
    await deleteAcademicFixture(schoolBAcademic);
    await prisma.membership.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.rolePermission.deleteMany({
      where: { roleId: { in: roleIds } },
    });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.school.deleteMany({
      where: { id: { in: [schoolAId, schoolBId] } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [organizationAId, organizationBId] } },
    });
    await prisma.$disconnect();
  });

  it('rejects unauthenticated School Management submission before resource access', async () => {
    const fixture = await createTaskFixture(
      studentAContext(),
      ReinforcementProofType.IMAGE,
    );

    const response = await request(app.getHttpServer())
      .post(schoolSubmitPath(fixture))
      .send({ proofFileId: randomUUID() })
      .expect(401);

    expect(readResponseBody<ErrorEnvelopeBody>(response).error.code).toBe(
      'auth.token.invalid',
    );
  });

  it('rejects the wrong School Management user type before permission or ownership', async () => {
    const fixture = await createTaskFixture(
      studentAContext(),
      ReinforcementProofType.IMAGE,
    );
    const token = await login(teacherActorId);

    const response = await request(app.getHttpServer())
      .post(schoolSubmitPath(fixture))
      .set('Authorization', `Bearer ${token}`)
      .send({ proofFileId: randomUUID() })
      .expect(403);

    expect(readResponseBody<ErrorEnvelopeBody>(response).error.code).toBe(
      'auth.scope.missing',
    );
  });

  it('rejects a School Management actor missing the route permission', async () => {
    const fixture = await createTaskFixture(
      studentAContext(),
      ReinforcementProofType.IMAGE,
    );
    const token = await login(noPermissionActorId);

    const response = await request(app.getHttpServer())
      .post(schoolSubmitPath(fixture))
      .set('Authorization', `Bearer ${token}`)
      .send({ proofFileId: randomUUID() })
      .expect(403);

    expect(readResponseBody<ErrorEnvelopeBody>(response).error.code).toBe(
      'auth.scope.missing',
    );
  });

  it.each([
    [
      'wrong organization',
      { organization: 'b', school: 'a', uploader: 'actor' },
    ],
    ['wrong school', { organization: 'a', school: 'b', uploader: 'actor' }],
    [
      'another actor uploader',
      { organization: 'a', school: 'a', uploader: 'other' },
    ],
    [
      'public visibility',
      { organization: 'a', school: 'a', uploader: 'actor', public: true },
    ],
  ] as const)(
    'hides a School Management proof with %s',
    async (_label, variant) => {
      const fixture = await createTaskFixture(
        studentAContext(),
        ReinforcementProofType.IMAGE,
      );
      const proof = await createProofFile({
        organizationId:
          variant.organization === 'a' ? organizationAId : organizationBId,
        schoolId: variant.school === 'a' ? schoolAId : schoolBId,
        uploaderId:
          variant.uploader === 'actor' ? schoolActorId : otherStudentActorId,
        visibility:
          'public' in variant && variant.public
            ? FileVisibility.PUBLIC
            : FileVisibility.PRIVATE,
        declaredMimeType: 'image/png',
        body: buildPngHeader(),
      });
      const token = await login(schoolActorId);

      const response = await request(app.getHttpServer())
        .post(schoolSubmitPath(fixture))
        .set('Authorization', `Bearer ${token}`)
        .send({ proofFileId: proof.fileId })
        .expect(404);

      const body = readResponseBody<ErrorEnvelopeBody>(response);
      expect(body.error.code).toBe('not_found');
      assertSafeErrorEnvelope(body, proof);
    },
  );

  it.each([
    {
      label: 'malformed content',
      expectedStatus: 400,
      expectedCode: 'reinforcement.proof.invalid_content',
      declaredMimeType: 'image/png',
      body: Buffer.from([0x00, 0x01, 0x02, 0x03]),
      storeObject: true,
    },
    {
      label: 'allowed sibling MIME mismatch',
      expectedStatus: 400,
      expectedCode: 'reinforcement.proof.mime_mismatch',
      declaredMimeType: 'image/png',
      body: buildJpegPrefix(),
      storeObject: true,
    },
    {
      label: 'cross-type content',
      expectedStatus: 415,
      expectedCode: 'reinforcement.proof.mime_not_allowed',
      declaredMimeType: 'image/png',
      body: Buffer.from('%PDF-1.7\n', 'ascii'),
      storeObject: true,
    },
    {
      label: 'missing storage object',
      expectedStatus: 503,
      expectedCode: 'reinforcement.proof.verification_unavailable',
      declaredMimeType: 'image/png',
      body: buildPngHeader(),
      storeObject: false,
    },
  ])(
    'serializes $expectedStatus/$expectedCode for $label without internal leakage',
    async ({
      expectedStatus,
      expectedCode,
      declaredMimeType,
      body,
      storeObject,
    }) => {
      const fixture = await createTaskFixture(
        studentAContext(),
        ReinforcementProofType.IMAGE,
      );
      const proof = await createProofFile({
        organizationId: organizationAId,
        schoolId: schoolAId,
        uploaderId: schoolActorId,
        visibility: FileVisibility.PRIVATE,
        declaredMimeType,
        body,
        storeObject,
      });
      const token = await login(schoolActorId);

      const response = await request(app.getHttpServer())
        .post(schoolSubmitPath(fixture))
        .set('Authorization', `Bearer ${token}`)
        .send({ proofFileId: proof.fileId })
        .expect(expectedStatus);

      const responseBody = readResponseBody<ErrorEnvelopeBody>(response);
      expect(responseBody.error.code).toBe(expectedCode);
      expect(typeof responseBody.error.message).toBe('string');
      expect(typeof responseBody.error.traceId).toBe('string');
      assertSafeErrorEnvelope(responseBody, proof);
    },
  );

  it('accepts an actor-owned private School Management proof and persists the authenticated uploader identity', async () => {
    const fixture = await createTaskFixture(
      studentAContext(),
      ReinforcementProofType.IMAGE,
    );
    const proof = await createProofFile({
      organizationId: organizationAId,
      schoolId: schoolAId,
      uploaderId: schoolActorId,
      visibility: FileVisibility.PRIVATE,
      declaredMimeType: 'image/png',
      body: buildPngHeader(),
    });
    const token = await login(schoolActorId);

    await request(app.getHttpServer())
      .post(schoolSubmitPath(fixture))
      .set('Authorization', `Bearer ${token}`)
      .send({ proofFileId: proof.fileId })
      .expect(201);

    await expectSubmissionIdentity(fixture, proof.fileId, schoolActorId);
  });

  it('rejects unauthenticated Student App submission', async () => {
    const fixture = await createTaskFixture(
      studentAContext(),
      ReinforcementProofType.IMAGE,
    );

    const response = await request(app.getHttpServer())
      .post(studentSubmitPath(fixture))
      .send({ proofFileId: randomUUID() })
      .expect(401);

    expect(readResponseBody<ErrorEnvelopeBody>(response).error.code).toBe(
      'auth.token.invalid',
    );
  });

  it('rejects a non-student actor from the Student App route', async () => {
    const fixture = await createTaskFixture(
      studentAContext(),
      ReinforcementProofType.IMAGE,
    );
    const token = await login(schoolActorId);

    const response = await request(app.getHttpServer())
      .post(studentSubmitPath(fixture))
      .set('Authorization', `Bearer ${token}`)
      .send({ proofFileId: randomUUID() })
      .expect(403);

    expect(readResponseBody<ErrorEnvelopeBody>(response).error.code).toBe(
      'student_app.actor.required_student',
    );
  });

  it('hides another same-school student assignment from Student App submission', async () => {
    const fixture = await createTaskFixture(
      otherStudentContext(),
      ReinforcementProofType.IMAGE,
    );
    const token = await login(studentActorId);

    const response = await request(app.getHttpServer())
      .post(studentSubmitPath(fixture))
      .set('Authorization', `Bearer ${token}`)
      .send({ proofFileId: randomUUID() })
      .expect(404);

    expect(readResponseBody<ErrorEnvelopeBody>(response).error.code).toBe(
      'not_found',
    );
  });

  it('hides another user proof file from Student App submission', async () => {
    const fixture = await createTaskFixture(
      studentAContext(),
      ReinforcementProofType.IMAGE,
    );
    const proof = await createProofFile({
      organizationId: organizationAId,
      schoolId: schoolAId,
      uploaderId: otherStudentActorId,
      visibility: FileVisibility.PRIVATE,
      declaredMimeType: 'image/png',
      body: buildPngHeader(),
    });
    const token = await login(studentActorId);

    const response = await request(app.getHttpServer())
      .post(studentSubmitPath(fixture))
      .set('Authorization', `Bearer ${token}`)
      .send({ proofFileId: proof.fileId })
      .expect(404);

    const responseBody = readResponseBody<ErrorEnvelopeBody>(response);
    expect(responseBody.error.code).toBe('not_found');
    assertSafeErrorEnvelope(responseBody, proof);
  });

  it('hides a cross-school Student App task boundary', async () => {
    const fixture = await createTaskFixture(
      crossSchoolStudentContext(),
      ReinforcementProofType.IMAGE,
    );
    const token = await login(studentActorId);

    const response = await request(app.getHttpServer())
      .post(studentSubmitPath(fixture))
      .set('Authorization', `Bearer ${token}`)
      .send({ proofFileId: randomUUID() })
      .expect(404);

    expect(readResponseBody<ErrorEnvelopeBody>(response).error.code).toBe(
      'not_found',
    );
  });

  it('accepts the current student-owned private proof and uses the authenticated student user as uploader identity', async () => {
    const fixture = await createTaskFixture(
      studentAContext(),
      ReinforcementProofType.IMAGE,
    );
    const proof = await createProofFile({
      organizationId: organizationAId,
      schoolId: schoolAId,
      uploaderId: studentActorId,
      visibility: FileVisibility.PRIVATE,
      declaredMimeType: 'image/png',
      body: buildPngHeader(),
    });
    const token = await login(studentActorId);

    await request(app.getHttpServer())
      .post(studentSubmitPath(fixture))
      .set('Authorization', `Bearer ${token}`)
      .send({ proofFileId: proof.fileId })
      .expect(200);

    await expectSubmissionIdentity(fixture, proof.fileId, studentActorId);
  });

  async function createRole(
    schoolId: string,
    label: string,
    permissionIds: string[],
  ): Promise<string> {
    const role = await prisma.role.create({
      data: {
        schoolId,
        key: `${marker}-${label}`,
        name: `${marker}-${label}`,
        isSystem: false,
      },
      select: { id: true },
    });
    roleIds.push(role.id);
    if (permissionIds.length > 0) {
      await prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({
          roleId: role.id,
          permissionId,
        })),
      });
    }
    return role.id;
  }

  async function createUserWithMembership(params: {
    label: string;
    userType: UserType;
    organizationId: string;
    schoolId: string;
    roleId: string;
    passwordHash: string;
  }): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `${marker}-${params.label}@example.test`,
        firstName: 'G06',
        lastName: params.label,
        userType: params.userType,
        passwordHash: params.passwordHash,
      },
      select: { id: true },
    });
    userIds.push(user.id);
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

  async function createAcademicFixture(
    schoolId: string,
    label: string,
  ): Promise<AcademicFixture> {
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId,
        nameAr: `${marker}-year-${label}-ar`,
        nameEn: `${marker}-year-${label}`,
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
        nameAr: `${marker}-term-${label}-ar`,
        nameEn: `${marker}-term-${label}`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    const stage = await prisma.stage.create({
      data: {
        schoolId,
        nameAr: `${marker}-stage-${label}-ar`,
        nameEn: `${marker}-stage-${label}`,
      },
      select: { id: true },
    });
    const grade = await prisma.grade.create({
      data: {
        schoolId,
        stageId: stage.id,
        nameAr: `${marker}-grade-${label}-ar`,
        nameEn: `${marker}-grade-${label}`,
      },
      select: { id: true },
    });
    const section = await prisma.section.create({
      data: {
        schoolId,
        gradeId: grade.id,
        nameAr: `${marker}-section-${label}-ar`,
        nameEn: `${marker}-section-${label}`,
      },
      select: { id: true },
    });
    const classroom = await prisma.classroom.create({
      data: {
        schoolId,
        sectionId: section.id,
        nameAr: `${marker}-classroom-${label}-ar`,
        nameEn: `${marker}-classroom-${label}`,
      },
      select: { id: true },
    });
    return {
      schoolId,
      academicYearId: academicYear.id,
      termId: term.id,
      stageId: stage.id,
      gradeId: grade.id,
      sectionId: section.id,
      classroomId: classroom.id,
    };
  }

  async function createStudentFixture(params: {
    label: string;
    organizationId: string;
    schoolId: string;
    userId: string;
    academic: AcademicFixture;
  }) {
    const student = await prisma.student.create({
      data: {
        organizationId: params.organizationId,
        schoolId: params.schoolId,
        userId: params.userId,
        firstName: 'G06',
        lastName: params.label,
        status: StudentStatus.ACTIVE,
      },
      select: { id: true },
    });
    const enrollment = await prisma.enrollment.create({
      data: {
        schoolId: params.schoolId,
        studentId: student.id,
        academicYearId: params.academic.academicYearId,
        termId: params.academic.termId,
        classroomId: params.academic.classroomId,
        status: StudentEnrollmentStatus.ACTIVE,
        enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
      },
      select: { id: true },
    });
    return { studentId: student.id, enrollmentId: enrollment.id };
  }

  async function createTaskFixture(
    context: StudentFixtureContext,
    proofType: ReinforcementProofType,
  ) {
    const task = await prisma.reinforcementTask.create({
      data: {
        schoolId: context.schoolId,
        academicYearId: context.academicYearId,
        termId: context.termId,
        titleEn: `${marker}-task-${randomUUID()}`,
        source: ReinforcementSource.TEACHER,
        status: ReinforcementTaskStatus.NOT_COMPLETED,
      },
      select: { id: true },
    });
    taskIds.push(task.id);
    const stage = await prisma.reinforcementTaskStage.create({
      data: {
        schoolId: context.schoolId,
        taskId: task.id,
        sortOrder: 1,
        titleEn: `${marker}-proof-stage`,
        proofType,
        requiresApproval: true,
      },
      select: { id: true },
    });
    const assignment = await prisma.reinforcementAssignment.create({
      data: {
        schoolId: context.schoolId,
        taskId: task.id,
        academicYearId: context.academicYearId,
        termId: context.termId,
        studentId: context.studentId,
        enrollmentId: context.enrollmentId,
      },
      select: { id: true },
    });
    return { taskId: task.id, stageId: stage.id, assignmentId: assignment.id };
  }

  async function createProofFile(params: {
    organizationId: string;
    schoolId: string;
    uploaderId: string;
    visibility: FileVisibility;
    declaredMimeType: string;
    body: Buffer;
    storeObject?: boolean;
  }) {
    const bucket = process.env.STORAGE_BUCKET ?? '';
    const objectKey = `${marker}/${randomUUID()}`;
    if (params.storeObject !== false) {
      await storage.saveObject({
        bucket,
        objectKey,
        body: params.body,
        contentType: params.declaredMimeType,
      });
      objectKeys.push(objectKey);
    }
    const file = await prisma.file.create({
      data: {
        organizationId: params.organizationId,
        schoolId: params.schoolId,
        uploaderId: params.uploaderId,
        bucket,
        objectKey,
        originalName: `${marker}-${randomUUID()}`,
        mimeType: params.declaredMimeType,
        sizeBytes: BigInt(params.body.length),
        visibility: params.visibility,
      },
      select: { id: true },
    });
    fileIds.push(file.id);
    return { fileId: file.id, bucket, objectKey };
  }

  async function login(userId: string): Promise<string> {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true },
    });
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email: user.email, password: TEST_PASSWORD })
      .expect(200);
    return readResponseBody<{ accessToken: string }>(response).accessToken;
  }

  function schoolSubmitPath(fixture: {
    assignmentId: string;
    stageId: string;
  }): string {
    return `${GLOBAL_PREFIX}/reinforcement/assignments/${fixture.assignmentId}/stages/${fixture.stageId}/submit`;
  }

  function studentSubmitPath(fixture: {
    taskId: string;
    stageId: string;
  }): string {
    return `${GLOBAL_PREFIX}/student/tasks/${fixture.taskId}/stages/${fixture.stageId}/submit`;
  }

  async function expectSubmissionIdentity(
    fixture: { assignmentId: string; stageId: string },
    proofFileId: string,
    submittedById: string,
  ) {
    await expect(
      prisma.reinforcementSubmission.findMany({
        where: {
          assignmentId: fixture.assignmentId,
          stageId: fixture.stageId,
        },
        select: { proofFileId: true, submittedById: true, status: true },
      }),
    ).resolves.toEqual([
      {
        proofFileId,
        submittedById,
        status: 'SUBMITTED',
      },
    ]);
  }

  function assertSafeErrorEnvelope(
    body: unknown,
    proof: { bucket: string; objectKey: string },
  ) {
    const serialized = JSON.stringify(body);
    const forbiddenValues = [
      proof.bucket,
      proof.objectKey,
      process.env.STORAGE_ENDPOINT,
      process.env.STORAGE_ACCESS_KEY,
      process.env.STORAGE_SECRET_KEY,
      'NoSuchKey',
      'PrismaClient',
      'SELECT ',
      'INSERT ',
      'SQLSTATE',
      'stack',
      'cause',
    ].filter((value): value is string => Boolean(value));
    for (const forbiddenValue of forbiddenValues) {
      expect(serialized).not.toContain(forbiddenValue);
    }
  }

  function studentAContext(): StudentFixtureContext {
    return {
      schoolId: schoolAId,
      academicYearId: schoolAAcademic.academicYearId,
      termId: schoolAAcademic.termId,
      studentId: studentAId,
      enrollmentId: studentAEnrollmentId,
    };
  }

  function otherStudentContext(): StudentFixtureContext {
    return {
      schoolId: schoolAId,
      academicYearId: schoolAAcademic.academicYearId,
      termId: schoolAAcademic.termId,
      studentId: otherStudentId,
      enrollmentId: otherStudentEnrollmentId,
    };
  }

  function crossSchoolStudentContext(): StudentFixtureContext {
    return {
      schoolId: schoolBId,
      academicYearId: schoolBAcademic.academicYearId,
      termId: schoolBAcademic.termId,
      studentId: crossSchoolStudentId,
      enrollmentId: crossSchoolEnrollmentId,
    };
  }

  async function deleteAcademicFixture(fixture: AcademicFixture) {
    await prisma.classroom.deleteMany({ where: { id: fixture.classroomId } });
    await prisma.section.deleteMany({ where: { id: fixture.sectionId } });
    await prisma.grade.deleteMany({ where: { id: fixture.gradeId } });
    await prisma.stage.deleteMany({ where: { id: fixture.stageId } });
    await prisma.term.deleteMany({ where: { id: fixture.termId } });
    await prisma.academicYear.deleteMany({
      where: { id: fixture.academicYearId },
    });
  }
});

interface AcademicFixture {
  schoolId: string;
  academicYearId: string;
  termId: string;
  stageId: string;
  gradeId: string;
  sectionId: string;
  classroomId: string;
}

interface StudentFixtureContext {
  schoolId: string;
  academicYearId: string;
  termId: string;
  studentId: string;
  enrollmentId: string;
}

function assertDisposableEnvironment(): void {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('Disposable DATABASE_URL is required');
  const databaseName = decodeURIComponent(new URL(raw).pathname.slice(1));
  if (!/^g06_[a-z0-9_]+$/u.test(databaseName)) {
    throw new Error('G06 security tests require a disposable G06 database');
  }
  const storageEndpoint = process.env.STORAGE_ENDPOINT;
  if (!storageEndpoint) {
    throw new Error('G06 security tests require disposable local MinIO');
  }
  const storageUrl = new URL(storageEndpoint);
  const isHostPort =
    storageUrl.hostname === '127.0.0.1' && storageUrl.port === '59000';
  const isDockerService =
    /^g06-[a-z0-9-]+-minio$/u.test(storageUrl.hostname) &&
    storageUrl.port === '9000';
  if (storageUrl.protocol !== 'http:' || (!isHostPort && !isDockerService)) {
    throw new Error('G06 security tests require disposable local MinIO');
  }
}

function buildPngHeader(width = 1, height = 1): Buffer {
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const chunk = Buffer.alloc(25);
  chunk.writeUInt32BE(13, 0);
  chunk.write('IHDR', 4, 'ascii');
  chunk.writeUInt32BE(width, 8);
  chunk.writeUInt32BE(height, 12);
  chunk[16] = 8;
  chunk[17] = 6;
  chunk[18] = 0;
  chunk[19] = 0;
  chunk[20] = 0;
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 21)), 21);
  return Buffer.concat([signature, chunk]);
}

function buildJpegPrefix(): Buffer {
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11,
    0x08, 0x00, 0x01, 0x00, 0x01, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00,
    0x03, 0x11, 0x00,
  ]);
}

function createCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let value = 0; value < table.length; value += 1) {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table[value] = crc >>> 0;
  }
  return table;
}

function crc32(value: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of value) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
