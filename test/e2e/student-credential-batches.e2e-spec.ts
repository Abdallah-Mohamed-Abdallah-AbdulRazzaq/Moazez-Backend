import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Readable } from 'node:stream';
import {
  FileVisibility,
  ImportJobStatus,
  MembershipStatus,
  PrismaClient,
  StudentEnrollmentStatus,
  StudentBulkRegistrationBatchStatus,
  StudentBulkRegistrationRowStatus,
  StudentCredentialBatchStatus,
  StudentCredentialRowStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { BullmqService } from '../../src/infrastructure/queue/bullmq.service';
import { StorageService } from '../../src/infrastructure/storage/storage.service';
import { PasswordService } from '../../src/modules/iam/auth/domain/password.service';
import { ProcessStudentCredentialBatchUseCase } from '../../src/modules/students/credentials/application/process-student-credential-batch.use-case';
import { StudentCredentialBatchReconciliationService } from '../../src/modules/students/credentials/application/student-credential-batch-reconciliation.service';
import { StudentCredentialSecretArtifactService } from '../../src/modules/students/credentials/application/student-credential-secret-artifact.service';
import { StudentCredentialSecretArtifactCleanupService } from '../../src/modules/students/credentials/application/student-credential-secret-artifact-cleanup.service';
import { studentCredentialBatchExecutionJobId } from '../../src/modules/students/credentials/domain/student-credential.constants';
import { StudentCredentialBatchRepository } from '../../src/modules/students/credentials/infrastructure/student-credential-batch.repository';
import { FILES_IMPORT_QUEUE_NAME } from '../../src/modules/files/imports/domain/import-job.types';
import { STUDENT_CREDENTIAL_EXPORT_HEADERS } from '../../src/modules/students/credentials/domain/student-credential-export.csv';

const GLOBAL_PREFIX = '/api/v1';
const DEMO_ADMIN_EMAIL = 'admin@academy.moazez.dev';
const DEMO_ADMIN_PASSWORD = 'School123!';
const TEST_SUFFIX = `student-credentials-${Date.now()}`;

jest.setTimeout(180_000);

describe('Student credential batches (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let storage: StorageService;
  let processor: ProcessStudentCredentialBatchUseCase;
  let passwordService: PasswordService;
  let bullmq: BullmqService;
  let schoolId: string;
  let organizationId: string;
  let studentId: string;
  let studentUserId: string;
  let sessionId: string;
  let secondStudentId: string;
  let secondStudentUserId: string;
  let batchId: string | null = null;
  let artifact: { id: string; bucket: string; objectKey: string } | null = null;
  let sourceRegistrationBatchId: string | null = null;
  let sourceImportJobId: string | null = null;
  let sourceFileId: string | null = null;
  const createdBatchIds: string[] = [];
  const createdArtifacts: Array<{
    id: string;
    bucket: string;
    objectKey: string;
  }> = [];
  const createdSessionIds: string[] = [];
  const createdEnrollmentIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    const school = await prisma.school.findFirstOrThrow({
      where: { slug: 'moazez-academy' },
      select: { id: true, organizationId: true },
    });
    const studentRole = await prisma.role.findFirstOrThrow({
      where: {
        key: 'student',
        schoolId: null,
        isSystem: true,
        deletedAt: null,
      },
      select: { id: true },
    });
    schoolId = school.id;
    organizationId = school.organizationId;
    const user = await prisma.user.create({
      data: {
        email: `${TEST_SUFFIX}@example.test`,
        username: TEST_SUFFIX,
        firstName: 'Credential',
        lastName: 'Student',
        userType: UserType.STUDENT,
        status: UserStatus.ACTIVE,
        passwordHash: null,
        credentialVersion: 0,
      },
    });
    studentUserId = user.id;
    await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId,
        schoolId,
        roleId: studentRole.id,
        userType: UserType.STUDENT,
        status: MembershipStatus.ACTIVE,
      },
    });
    const student = await prisma.student.create({
      data: {
        schoolId,
        organizationId,
        userId: user.id,
        firstName: 'Credential',
        lastName: 'Student',
      },
    });
    studentId = student.id;
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: `${TEST_SUFFIX}-refresh`,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    sessionId = session.id;
    createdSessionIds.push(session.id);

    const secondUser = await prisma.user.create({
      data: {
        email: `${TEST_SUFFIX}-second@example.test`,
        username: `${TEST_SUFFIX}-second`,
        firstName: 'Second',
        lastName: 'Student',
        userType: UserType.STUDENT,
        status: UserStatus.ACTIVE,
        passwordHash: null,
        credentialVersion: 0,
      },
    });
    secondStudentUserId = secondUser.id;
    await prisma.membership.create({
      data: {
        userId: secondUser.id,
        organizationId,
        schoolId,
        roleId: studentRole.id,
        userType: UserType.STUDENT,
        status: MembershipStatus.ACTIVE,
      },
    });
    const secondStudent = await prisma.student.create({
      data: {
        schoolId,
        organizationId,
        userId: secondUser.id,
        firstName: 'Second',
        lastName: 'Student',
      },
    });
    secondStudentId = secondStudent.id;
    const secondSession = await prisma.session.create({
      data: {
        userId: secondUser.id,
        refreshTokenHash: `${TEST_SUFFIX}-second-refresh`,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    createdSessionIds.push(secondSession.id);

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
    processor = app.get(ProcessStudentCredentialBatchUseCase);
    passwordService = app.get(PasswordService);
    bullmq = app.get(BullmqService);
  });

  afterAll(async () => {
    if (bullmq) {
      for (const createdBatchId of createdBatchIds) {
        await bullmq
          .getQueue(FILES_IMPORT_QUEUE_NAME)
          .remove(studentCredentialBatchExecutionJobId(createdBatchId))
          .catch(() => undefined);
      }
    }
    if (createdBatchIds.length > 0) {
      const rowIds = await prisma.studentCredentialRow.findMany({
        where: { batchId: { in: createdBatchIds } },
        select: { id: true },
      });
      await prisma.studentCredentialBatch.deleteMany({
        where: { id: { in: createdBatchIds } },
      });
      await prisma.auditLog.deleteMany({
        where: {
          resourceId: {
            in: [...createdBatchIds, ...rowIds.map((row) => row.id)],
          },
        },
      });
    }
    for (const createdArtifact of createdArtifacts) {
      await storage
        .deleteObject({
          bucket: createdArtifact.bucket,
          objectKey: createdArtifact.objectKey,
        })
        .catch(() => undefined);
      await prisma.file.deleteMany({ where: { id: createdArtifact.id } });
    }
    if (sourceRegistrationBatchId) {
      await prisma.studentBulkRegistrationBatch.deleteMany({
        where: { id: sourceRegistrationBatchId },
      });
    }
    if (createdEnrollmentIds.length > 0) {
      await prisma.enrollment.deleteMany({
        where: { id: { in: createdEnrollmentIds } },
      });
    }
    if (sourceImportJobId) {
      await prisma.importJob.deleteMany({ where: { id: sourceImportJobId } });
    }
    if (sourceFileId) {
      await prisma.file.deleteMany({ where: { id: sourceFileId } });
    }
    if (createdSessionIds.length > 0) {
      await prisma.session.deleteMany({
        where: { id: { in: createdSessionIds } },
      });
    }
    if (studentId || secondStudentId) {
      await prisma.student.deleteMany({
        where: { id: { in: [studentId, secondStudentId].filter(Boolean) } },
      });
    }
    if (studentUserId || secondStudentUserId) {
      const userIds = [studentUserId, secondStudentUserId].filter(Boolean);
      await prisma.membership.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
  });

  it('previews, durably creates, executes, revokes sessions, and exposes only safe batch metadata', async () => {
    const token = await login();
    const preview = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/credential-batches/preview`)
      .set('Authorization', `Bearer ${token}`)
      .send({ audienceMode: 'selected_students', studentIds: [studentId] })
      .expect(200);
    expect(preview.body).toMatchObject({
      totalMatched: 1,
      eligible: 1,
      skipped: 0,
      sample: [
        {
          studentId,
          userId: studentUserId,
          fullName: 'Credential Student',
          hasPassword: false,
          credentialVersion: 0,
        },
      ],
    });
    expect(JSON.stringify(preview.body)).not.toContain('passwordHash');

    const created = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/credential-batches`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        audienceMode: 'selected_students',
        studentIds: [studentId],
        credentialMode: 'unique_generated',
      })
      .expect(202);
    batchId = (created.body as { id: string }).id;
    createdBatchIds.push(batchId);
    expect(created.body).toMatchObject({
      audienceMode: 'selected_students',
      credentialMode: 'unique_generated',
      selectors: {},
      status: 'pending',
      counters: {
        totalRows: 1,
        generatedRows: 0,
        skippedRows: 0,
        failedRows: 0,
      },
    });
    expect(JSON.stringify(created.body)).not.toMatch(/artifact|password/iu);

    await processor.execute(batchId);

    const persisted = await prisma.studentCredentialBatch.findUniqueOrThrow({
      where: { id: batchId },
      include: { rows: true, secretArtifactFile: true },
    });
    expect(persisted.status).toBe(StudentCredentialBatchStatus.COMPLETED);
    expect(persisted.rows).toHaveLength(1);
    expect(persisted.rows[0].status).toBe(StudentCredentialRowStatus.GENERATED);
    expect(persisted.generatedRows).toBe(1);
    expect(persisted.secretArtifactFile).not.toBeNull();
    artifact = {
      id: persisted.secretArtifactFile!.id,
      bucket: persisted.secretArtifactFile!.bucket,
      objectKey: persisted.secretArtifactFile!.objectKey,
    };
    createdArtifacts.push(artifact);

    const stream = await storage.getObject({
      bucket: artifact.bucket,
      objectKey: artifact.objectKey,
    });
    const secret = JSON.parse((await readStream(stream)).toString('utf8')) as {
      entries: Array<{ temporaryPassword: string }>;
    };
    const [user, session] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: studentUserId } }),
      prisma.session.findUniqueOrThrow({ where: { id: sessionId } }),
    ]);
    expect(user.passwordHash).not.toBeNull();
    expect(user.mustChangePassword).toBe(true);
    expect(user.credentialVersion).toBe(1);
    expect(session.revokedAt).not.toBeNull();
    await expect(
      app
        .get(PasswordService)
        .verify(user.passwordHash!, secret.entries[0].temporaryPassword),
    ).resolves.toBe(true);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/students-guardians/credential-batches/${batchId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(response.body).toMatchObject({ status: 'completed' });
    expect(JSON.stringify(response.body)).not.toMatch(
      /secretArtifact|objectKey|checksum|temporaryPassword/iu,
    );

    const exported = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/students-guardians/credential-batches/${batchId}/export`,
      )
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    const csv = (exported.body as Buffer).toString('utf8');
    expect(exported.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(exported.headers['content-disposition']).toBe(
      `attachment; filename="student-credentials-${batchId}.csv"`,
    );
    expect(exported.headers['cache-control']).toBe(
      'no-store, private, max-age=0',
    );
    expect(exported.headers.pragma).toBe('no-cache');
    expect(exported.headers.expires).toBe('0');
    expect(exported.headers['x-content-type-options']).toBe('nosniff');
    expect(exported.headers.etag).toBeUndefined();
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain(secret.entries[0].temporaryPassword);
    expect(csv).toContain('temporary_credential');
    expect(csv).not.toMatch(/secretArtifact|objectKey|checksum/iu);
    await expect(
      prisma.auditLog.count({
        where: {
          resourceId: batchId,
          action: 'iam.credentials.student_batch.export',
        },
      }),
    ).resolves.toBe(1);

    const download = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/files/${artifact.id}/download`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
    expect((download.body as { error: { code: string } }).error.code).toBe(
      'files.not_found',
    );

    await prisma.studentCredentialBatch.update({
      where: { id: batchId },
      data: { secretArtifactExpiresAt: new Date(Date.now() - 1000) },
    });
    await expect(
      app.get(StudentCredentialSecretArtifactCleanupService).reconcile(),
    ).resolves.toMatchObject({ cleaned: 1 });
    await expect(
      storage.objectExists({
        bucket: artifact.bucket,
        objectKey: artifact.objectKey,
      }),
    ).resolves.toBe(false);
    const cleaned = await prisma.studentCredentialBatch.findUniqueOrThrow({
      where: { id: batchId },
      include: { secretArtifactFile: true },
    });
    expect(cleaned.secretArtifactFileId).toBe(artifact.id);
    expect(cleaned.secretArtifactFile?.deletedAt).not.toBeNull();
    await expect(
      prisma.auditLog.count({
        where: {
          resourceId: batchId,
          action: 'iam.credentials.student_batch.secret_cleanup',
          actorId: null,
          userType: null,
        },
      }),
    ).resolves.toBe(1);
    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/students-guardians/credential-batches/${batchId}/export`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(409);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/files/${artifact.id}/download`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    const replacementSessions = await Promise.all(
      [studentUserId, secondStudentUserId].map((userId, index) =>
        prisma.session.create({
          data: {
            userId,
            refreshTokenHash: `${TEST_SUFFIX}-shared-${index}`,
            expiresAt: new Date(Date.now() + 60_000),
          },
        }),
      ),
    );
    createdSessionIds.push(...replacementSessions.map((session) => session.id));

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/credential-batches/preview`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        audienceMode: 'selected_students',
        studentIds: [studentId, secondStudentId],
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          totalMatched: 2,
          eligible: 2,
          skipped: 0,
        });
      });

    const sharedCreated = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/credential-batches`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        audienceMode: 'selected_students',
        studentIds: [studentId, secondStudentId],
        credentialMode: 'shared_temporary',
      })
      .expect(202);
    const sharedBatchId = (sharedCreated.body as { id: string }).id;
    createdBatchIds.push(sharedBatchId);
    await processor.execute(sharedBatchId);

    const sharedBatch = await prisma.studentCredentialBatch.findUniqueOrThrow({
      where: { id: sharedBatchId },
      include: { rows: true, secretArtifactFile: true },
    });
    expect(sharedBatch).toMatchObject({
      status: StudentCredentialBatchStatus.COMPLETED,
      totalRows: 2,
      generatedRows: 2,
      skippedRows: 0,
      failedRows: 0,
    });
    expect(
      sharedBatch.rows.every(
        (row) => row.status === StudentCredentialRowStatus.GENERATED,
      ),
    ).toBe(true);
    const sharedArtifact = {
      id: sharedBatch.secretArtifactFile!.id,
      bucket: sharedBatch.secretArtifactFile!.bucket,
      objectKey: sharedBatch.secretArtifactFile!.objectKey,
    };
    createdArtifacts.push(sharedArtifact);
    const sharedSecret = JSON.parse(
      (
        await readStream(
          await storage.getObject({
            bucket: sharedArtifact.bucket,
            objectKey: sharedArtifact.objectKey,
          }),
        )
      ).toString('utf8'),
    ) as { entries: Array<{ userId: string; temporaryPassword: string }> };
    expect(
      new Set(sharedSecret.entries.map((entry) => entry.temporaryPassword))
        .size,
    ).toBe(1);
    const sharedPlaintext = sharedSecret.entries[0].temporaryPassword;
    const sharedUsers = await prisma.user.findMany({
      where: { id: { in: [studentUserId, secondStudentUserId] } },
      orderBy: { id: 'asc' },
    });
    expect(sharedUsers).toHaveLength(2);
    expect(sharedUsers[0].passwordHash).not.toBe(sharedUsers[1].passwordHash);
    for (const sharedUser of sharedUsers) {
      await expect(
        app
          .get(PasswordService)
          .verify(sharedUser.passwordHash!, sharedPlaintext),
      ).resolves.toBe(true);
    }
    const sharedSessions = await prisma.session.findMany({
      where: { id: { in: createdSessionIds } },
    });
    expect(sharedSessions.every((item) => item.revokedAt !== null)).toBe(true);

    const adminProvidedPassword = 'F2Admin!Pass123';
    const customVersionsBefore = new Map(
      (
        await prisma.user.findMany({
          where: { id: { in: [studentUserId, secondStudentUserId] } },
          select: { id: true, credentialVersion: true },
        })
      ).map((user) => [user.id, user.credentialVersion]),
    );
    const customSessions = await Promise.all(
      [studentUserId, secondStudentUserId].map((userId, index) =>
        prisma.session.create({
          data: {
            userId,
            refreshTokenHash: `${TEST_SUFFIX}-custom-${index}`,
            expiresAt: new Date(Date.now() + 60_000),
          },
        }),
      ),
    );
    createdSessionIds.push(...customSessions.map((session) => session.id));

    const customCreated = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/credential-batches`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        audienceMode: 'selected_students',
        studentIds: [studentId, secondStudentId],
        credentialMode: 'shared_admin_provided',
        sharedPassword: adminProvidedPassword,
      })
      .expect(202);
    const customBatchId = (customCreated.body as { id: string }).id;
    createdBatchIds.push(customBatchId);
    expect(customCreated.body).toMatchObject({
      credentialMode: 'shared_admin_provided',
      status: 'pending',
      counters: {
        totalRows: 2,
        generatedRows: 0,
        skippedRows: 0,
        failedRows: 0,
      },
    });
    expect(JSON.stringify(customCreated.body)).not.toContain(
      adminProvidedPassword,
    );

    const stagedCustomBatch =
      await prisma.studentCredentialBatch.findUniqueOrThrow({
        where: { id: customBatchId },
        include: { rows: true, secretArtifactFile: true },
      });
    expect(stagedCustomBatch).toMatchObject({
      status: StudentCredentialBatchStatus.PENDING,
      startedAt: null,
      secretArtifactVersion: 1,
    });
    expect(stagedCustomBatch.secretArtifactFile).toMatchObject({
      visibility: FileVisibility.PRIVATE,
      mimeType: 'application/vnd.moazez.student-credentials+json',
    });
    const customArtifact = {
      id: stagedCustomBatch.secretArtifactFile!.id,
      bucket: stagedCustomBatch.secretArtifactFile!.bucket,
      objectKey: stagedCustomBatch.secretArtifactFile!.objectKey,
    };
    createdArtifacts.push(customArtifact);
    const customSecret = JSON.parse(
      (
        await readStream(
          await storage.getObject({
            bucket: customArtifact.bucket,
            objectKey: customArtifact.objectKey,
          }),
        )
      ).toString('utf8'),
    ) as {
      credentialMode: string;
      entries: Array<{ userId: string; temporaryPassword: string }>;
    };
    expect(customSecret.credentialMode).toBe('shared_admin_provided');
    expect(customSecret.entries).toHaveLength(2);
    expect(
      customSecret.entries.every(
        (entry) => entry.temporaryPassword === adminProvidedPassword,
      ),
    ).toBe(true);
    const queuedCustomJob = await bullmq
      .getQueue(FILES_IMPORT_QUEUE_NAME)
      .getJob(studentCredentialBatchExecutionJobId(customBatchId));
    expect(queuedCustomJob?.data).toEqual({ batchId: customBatchId });
    expect(JSON.stringify(queuedCustomJob?.data)).not.toContain(
      adminProvidedPassword,
    );
    const customCreateAudit = await prisma.auditLog.findFirstOrThrow({
      where: {
        resourceId: customBatchId,
        action: 'iam.credentials.student_batch.create',
      },
    });
    const queuedCustomData = queuedCustomJob?.data as unknown;
    expect(
      JSON.stringify(
        {
          batch: stagedCustomBatch,
          audit: customCreateAudit,
          queue: queuedCustomData,
        },
        (_key, value: unknown): unknown =>
          typeof value === 'bigint' ? value.toString() : value,
      ),
    ).not.toContain(adminProvidedPassword);

    await processor.execute(customBatchId);

    const completedCustomBatch =
      await prisma.studentCredentialBatch.findUniqueOrThrow({
        where: { id: customBatchId },
        include: { rows: true, secretArtifactFile: true },
      });
    expect(completedCustomBatch).toMatchObject({
      status: StudentCredentialBatchStatus.COMPLETED,
      generatedRows: 2,
      secretArtifactFileId: customArtifact.id,
    });
    expect(completedCustomBatch.secretArtifactFile?.checksumSha256).toBe(
      stagedCustomBatch.secretArtifactFile?.checksumSha256,
    );
    expect(
      completedCustomBatch.rows.every(
        (row) =>
          row.status === StudentCredentialRowStatus.GENERATED &&
          !JSON.stringify(row.errorsJson).includes(adminProvidedPassword),
      ),
    ).toBe(true);
    const customUsers = await prisma.user.findMany({
      where: { id: { in: [studentUserId, secondStudentUserId] } },
      orderBy: { id: 'asc' },
    });
    expect(customUsers[0].passwordHash).not.toBe(customUsers[1].passwordHash);
    for (const customUser of customUsers) {
      await expect(
        passwordService.verify(customUser.passwordHash!, adminProvidedPassword),
      ).resolves.toBe(true);
      expect(customUser.mustChangePassword).toBe(true);
      expect(customUser.credentialVersion).toBe(
        customVersionsBefore.get(customUser.id)! + 1,
      );
    }
    const revokedCustomSessions = await prisma.session.findMany({
      where: { id: { in: customSessions.map((session) => session.id) } },
    });
    expect(
      revokedCustomSessions.every((session) => session.revokedAt !== null),
    ).toBe(true);

    const customGet = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/students-guardians/credential-batches/${customBatchId}`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(customGet.body).toMatchObject({
      credentialMode: 'shared_admin_provided',
      status: 'completed',
    });
    expect(JSON.stringify(customGet.body)).not.toMatch(
      /sharedPassword|temporaryPassword|secretArtifact|objectKey|checksum/iu,
    );
    const customExport = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/students-guardians/credential-batches/${customBatchId}/export`,
      )
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect((customExport.body as Buffer).toString('utf8')).toContain(
      adminProvidedPassword,
    );
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/files/${customArtifact.id}/download`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    const actor = await prisma.user.findUniqueOrThrow({
      where: { email: DEMO_ADMIN_EMAIL },
      select: { id: true },
    });
    const [academicYear, classroom] = await Promise.all([
      prisma.academicYear.findFirstOrThrow({
        where: { schoolId, isActive: true, deletedAt: null },
        select: { id: true },
      }),
      prisma.classroom.findFirstOrThrow({
        where: { schoolId, deletedAt: null },
        select: { id: true },
      }),
    ]);
    const sourceFile = await prisma.file.create({
      data: {
        schoolId,
        organizationId,
        uploaderId: actor.id,
        bucket: storage.resolveBucket(FileVisibility.PRIVATE),
        objectKey: `${TEST_SUFFIX}/source.csv`,
        originalName: 'source.csv',
        mimeType: 'text/csv',
        sizeBytes: 1,
        checksumSha256: 'b'.repeat(64),
        visibility: FileVisibility.PRIVATE,
      },
    });
    sourceFileId = sourceFile.id;
    const sourceImport = await prisma.importJob.create({
      data: {
        schoolId,
        uploadedFileId: sourceFile.id,
        type: 'students_bulk_registration',
        status: ImportJobStatus.COMPLETED,
        createdById: actor.id,
      },
    });
    sourceImportJobId = sourceImport.id;
    const sourceBatch = await prisma.studentBulkRegistrationBatch.create({
      data: {
        schoolId,
        organizationId,
        sourceImportJobId: sourceImport.id,
        academicYearId: academicYear.id,
        classroomId: classroom.id,
        enrollmentDate: new Date(),
        status: StudentBulkRegistrationBatchStatus.COMPLETED,
        totalRows: 2,
        validRows: 2,
        createdRows: 2,
        createdById: actor.id,
        completedAt: new Date(),
      },
    });
    sourceRegistrationBatchId = sourceBatch.id;
    const [sourceEnrollment, secondSourceEnrollment] = await Promise.all([
      prisma.enrollment.create({
        data: {
          schoolId,
          studentId,
          academicYearId: sourceBatch.academicYearId,
          termId: sourceBatch.termId,
          classroomId: sourceBatch.classroomId,
          status: StudentEnrollmentStatus.ACTIVE,
          enrolledAt: sourceBatch.enrollmentDate,
          endedAt: null,
          exitReason: null,
        },
      }),
      prisma.enrollment.create({
        data: {
          schoolId,
          studentId: secondStudentId,
          academicYearId: sourceBatch.academicYearId,
          termId: sourceBatch.termId,
          classroomId: sourceBatch.classroomId,
          status: StudentEnrollmentStatus.ACTIVE,
          enrolledAt: sourceBatch.enrollmentDate,
          endedAt: null,
          exitReason: null,
        },
      }),
    ]);
    createdEnrollmentIds.push(sourceEnrollment.id, secondSourceEnrollment.id);
    await prisma.studentBulkRegistrationRow.createMany({
      data: [
        {
          schoolId,
          batchId: sourceBatch.id,
          rowNumber: 1,
          normalizedDataJson: {},
          rowHash: 'c'.repeat(64),
          status: StudentBulkRegistrationRowStatus.CREATED,
          studentId,
          userId: studentUserId,
          enrollmentId: sourceEnrollment.id,
        },
        {
          schoolId,
          batchId: sourceBatch.id,
          rowNumber: 2,
          normalizedDataJson: {},
          rowHash: 'd'.repeat(64),
          status: StudentBulkRegistrationRowStatus.CREATED,
          studentId: secondStudentId,
          userId: secondStudentUserId,
          enrollmentId: secondSourceEnrollment.id,
        },
      ],
    });

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/credential-batches/preview`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        audienceMode: 'import_batch',
        sourceRegistrationBatchId: sourceBatch.id,
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          totalMatched: 2,
          eligible: 2,
          skipped: 0,
        });
      });
    const importCreated = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/credential-batches`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        audienceMode: 'import_batch',
        sourceRegistrationBatchId: sourceBatch.id,
        credentialMode: 'unique_generated',
      })
      .expect(202);
    const importCredentialBatchId = (importCreated.body as { id: string }).id;
    createdBatchIds.push(importCredentialBatchId);
    expect(importCreated.body).toMatchObject({
      audienceMode: 'import_batch',
      selectors: { sourceRegistrationBatchId: sourceBatch.id },
    });
    await processor.execute(importCredentialBatchId);
    const importCredentialBatch =
      await prisma.studentCredentialBatch.findUniqueOrThrow({
        where: { id: importCredentialBatchId },
        include: { rows: true, secretArtifactFile: true },
      });
    expect(importCredentialBatch).toMatchObject({
      status: StudentCredentialBatchStatus.COMPLETED,
      totalRows: 2,
      generatedRows: 2,
      skippedRows: 0,
      failedRows: 0,
    });
    expect(importCredentialBatch.rows).toHaveLength(2);
    expect(
      new Set(importCredentialBatch.rows.map((row) => row.studentId)).size,
    ).toBe(2);
    expect(
      new Set(importCredentialBatch.rows.map((row) => row.userId)).size,
    ).toBe(2);
    expect(
      importCredentialBatch.rows.find((row) => row.studentId === studentId),
    ).toMatchObject({
      studentId,
      userId: studentUserId,
      enrollmentId: sourceEnrollment.id,
    });
    expect(
      importCredentialBatch.rows.find(
        (row) => row.studentId === secondStudentId,
      ),
    ).toMatchObject({
      studentId: secondStudentId,
      userId: secondStudentUserId,
      enrollmentId: secondSourceEnrollment.id,
    });
    const persistedSourcePlacement = await prisma.enrollment.findUniqueOrThrow({
      where: { id: sourceEnrollment.id },
      select: {
        academicYear: { select: { id: true, nameEn: true, nameAr: true } },
        classroom: {
          select: {
            id: true,
            nameEn: true,
            nameAr: true,
            section: {
              select: {
                id: true,
                nameEn: true,
                nameAr: true,
                grade: {
                  select: {
                    id: true,
                    nameEn: true,
                    nameAr: true,
                    stage: {
                      select: { id: true, nameEn: true, nameAr: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    const importExport = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/students-guardians/credential-batches/${importCredentialBatchId}/export`,
      )
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    const exportRows = decodeCredentialExport(importExport.body as Buffer);
    expect(exportRows.headers).toEqual(STUDENT_CREDENTIAL_EXPORT_HEADERS);
    expect(exportRows.rows).toHaveLength(2);
    const exportByStudent = new Map(
      exportRows.rows.map((row) => [row.student_id, row]),
    );
    for (const [exportedStudentId, sourceEnrollmentId] of [
      [studentId, sourceEnrollment.id],
      [secondStudentId, secondSourceEnrollment.id],
    ] as const) {
      const exportedRow = exportByStudent.get(exportedStudentId);
      expect(exportedRow).toMatchObject({
        credential_status: 'temporary_credential',
        placement_status: 'current',
        academic_year_id: persistedSourcePlacement.academicYear.id,
        academic_year_name: academicDisplayName(
          persistedSourcePlacement.academicYear,
        ),
        stage_id: persistedSourcePlacement.classroom.section.grade.stage.id,
        stage_name: academicDisplayName(
          persistedSourcePlacement.classroom.section.grade.stage,
        ),
        grade_id: persistedSourcePlacement.classroom.section.grade.id,
        grade_name: academicDisplayName(
          persistedSourcePlacement.classroom.section.grade,
        ),
        section_id: persistedSourcePlacement.classroom.section.id,
        section_name: academicDisplayName(
          persistedSourcePlacement.classroom.section,
        ),
        classroom_id: persistedSourcePlacement.classroom.id,
        classroom_name: academicDisplayName(persistedSourcePlacement.classroom),
      });
      expect(exportedRow?.temporary_password).toBeTruthy();
      expect(
        importCredentialBatch.rows.find(
          (row) => row.studentId === exportedStudentId,
        )?.enrollmentId,
      ).toBe(sourceEnrollmentId);
    }
    const importArtifact = {
      id: importCredentialBatch.secretArtifactFile!.id,
      bucket: importCredentialBatch.secretArtifactFile!.bucket,
      objectKey: importCredentialBatch.secretArtifactFile!.objectKey,
    };
    createdArtifacts.push(importArtifact);
    const finalUsers = await prisma.user.findMany({
      where: { id: { in: [studentUserId, secondStudentUserId] } },
    });
    expect(
      finalUsers
        .map((item) => item.credentialVersion)
        .sort((left, right) => left - right),
    ).toEqual(
      [studentUserId, secondStudentUserId]
        .map((userId) => customVersionsBefore.get(userId)! + 2)
        .sort((left, right) => left - right),
    );

    const partialCreated = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/credential-batches`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        audienceMode: 'selected_students',
        studentIds: [studentId, secondStudentId],
        credentialMode: 'unique_generated',
      })
      .expect(202);
    const partialBatchId = (partialCreated.body as { id: string }).id;
    createdBatchIds.push(partialBatchId);
    await expect(
      createCrashingProcessor(2).execute(partialBatchId),
    ).rejects.toThrow('synthetic_technical_hash_failure');
    const partiallyApplied =
      await prisma.studentCredentialBatch.findUniqueOrThrow({
        where: { id: partialBatchId },
        include: { rows: true, secretArtifactFile: true },
      });
    expect(partiallyApplied.status).toBe(
      StudentCredentialBatchStatus.PROCESSING,
    );
    expect(
      partiallyApplied.rows.filter(
        (row) => row.status === StudentCredentialRowStatus.GENERATED,
      ),
    ).toHaveLength(1);
    expect(
      partiallyApplied.rows.filter(
        (row) => row.status === StudentCredentialRowStatus.PENDING,
      ),
    ).toHaveLength(1);
    const partialArtifact = {
      id: partiallyApplied.secretArtifactFile!.id,
      bucket: partiallyApplied.secretArtifactFile!.bucket,
      objectKey: partiallyApplied.secretArtifactFile!.objectKey,
    };
    createdArtifacts.push(partialArtifact);
    const partialArtifactBefore = await readStream(
      await storage.getObject({
        bucket: partialArtifact.bucket,
        objectKey: partialArtifact.objectKey,
      }),
    );
    const generatedBeforeRetry = partiallyApplied.rows.find(
      (row) => row.status === StudentCredentialRowStatus.GENERATED,
    )!;
    const generatedUserBeforeRetry = await prisma.user.findUniqueOrThrow({
      where: { id: generatedBeforeRetry.userId! },
    });
    await processor.execute(partialBatchId);
    const [partialCompleted, generatedUserAfterRetry, partialArtifactAfter] =
      await Promise.all([
        prisma.studentCredentialBatch.findUniqueOrThrow({
          where: { id: partialBatchId },
          include: { rows: true },
        }),
        prisma.user.findUniqueOrThrow({
          where: { id: generatedBeforeRetry.userId! },
        }),
        readStream(
          await storage.getObject({
            bucket: partialArtifact.bucket,
            objectKey: partialArtifact.objectKey,
          }),
        ),
      ]);
    expect(partialCompleted.status).toBe(
      StudentCredentialBatchStatus.COMPLETED,
    );
    expect(partialCompleted.generatedRows).toBe(2);
    expect(generatedUserAfterRetry).toMatchObject({
      passwordHash: generatedUserBeforeRetry.passwordHash,
      credentialVersion: generatedUserBeforeRetry.credentialVersion,
    });
    expect(partialArtifactAfter.equals(partialArtifactBefore)).toBe(true);

    const versionsBeforeMissing = new Map(
      (
        await prisma.user.findMany({
          where: { id: { in: [studentUserId, secondStudentUserId] } },
        })
      ).map((item) => [item.id, item.credentialVersion]),
    );
    const missingCreated = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/credential-batches`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        audienceMode: 'selected_students',
        studentIds: [studentId, secondStudentId],
        credentialMode: 'unique_generated',
      })
      .expect(202);
    const missingBatchId = (missingCreated.body as { id: string }).id;
    createdBatchIds.push(missingBatchId);
    await expect(
      createCrashingProcessor(2).execute(missingBatchId),
    ).rejects.toThrow('synthetic_technical_hash_failure');
    const missingBeforeRetry =
      await prisma.studentCredentialBatch.findUniqueOrThrow({
        where: { id: missingBatchId },
        include: { rows: true, secretArtifactFile: true },
      });
    const missingArtifact = {
      id: missingBeforeRetry.secretArtifactFile!.id,
      bucket: missingBeforeRetry.secretArtifactFile!.bucket,
      objectKey: missingBeforeRetry.secretArtifactFile!.objectKey,
    };
    createdArtifacts.push(missingArtifact);
    const missingGeneratedRow = missingBeforeRetry.rows.find(
      (row) => row.status === StudentCredentialRowStatus.GENERATED,
    )!;
    const missingPendingRow = missingBeforeRetry.rows.find(
      (row) => row.status === StudentCredentialRowStatus.PENDING,
    )!;
    const generatedUserBeforeMissingRetry = await prisma.user.findUniqueOrThrow(
      {
        where: { id: missingGeneratedRow.userId! },
      },
    );
    await storage.deleteObject({
      bucket: missingArtifact.bucket,
      objectKey: missingArtifact.objectKey,
    });
    await processor.execute(missingBatchId);
    const [missingFinal, generatedUserAfterMissingRetry, pendingUser] =
      await Promise.all([
        prisma.studentCredentialBatch.findUniqueOrThrow({
          where: { id: missingBatchId },
          include: { rows: true },
        }),
        prisma.user.findUniqueOrThrow({
          where: { id: missingGeneratedRow.userId! },
        }),
        prisma.user.findUniqueOrThrow({
          where: { id: missingPendingRow.userId! },
        }),
      ]);
    expect(missingFinal).toMatchObject({
      status: StudentCredentialBatchStatus.PARTIAL_FAILED,
      generatedRows: 1,
      failedRows: 1,
    });
    expect(
      missingFinal.rows.find((row) => row.id === missingPendingRow.id),
    ).toMatchObject({ status: StudentCredentialRowStatus.FAILED });
    expect(
      JSON.stringify(
        missingFinal.rows.find((row) => row.id === missingPendingRow.id)
          ?.errorsJson,
      ),
    ).toContain('students.credentials.secret_artifact_unavailable');
    expect(generatedUserAfterMissingRetry).toMatchObject({
      passwordHash: generatedUserBeforeMissingRetry.passwordHash,
      credentialVersion: generatedUserBeforeMissingRetry.credentialVersion,
    });
    expect(pendingUser.credentialVersion).toBe(
      versionsBeforeMissing.get(pendingUser.id),
    );

    const checksumUserBefore = await prisma.user.findUniqueOrThrow({
      where: { id: secondStudentUserId },
    });
    const checksumCreated = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/credential-batches`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        audienceMode: 'selected_students',
        studentIds: [secondStudentId],
        credentialMode: 'unique_generated',
      })
      .expect(202);
    const checksumBatchId = (checksumCreated.body as { id: string }).id;
    createdBatchIds.push(checksumBatchId);
    await expect(
      createCrashingProcessor(1).execute(checksumBatchId),
    ).rejects.toThrow('synthetic_technical_hash_failure');
    const checksumBeforeRetry =
      await prisma.studentCredentialBatch.findUniqueOrThrow({
        where: { id: checksumBatchId },
        include: { rows: true, secretArtifactFile: true },
      });
    expect(checksumBeforeRetry.rows[0].status).toBe(
      StudentCredentialRowStatus.PENDING,
    );
    const checksumUserAfterCrash = await prisma.user.findUniqueOrThrow({
      where: { id: secondStudentUserId },
    });
    expect(checksumUserAfterCrash).toMatchObject({
      passwordHash: checksumUserBefore.passwordHash,
      credentialVersion: checksumUserBefore.credentialVersion,
    });
    const checksumArtifact = {
      id: checksumBeforeRetry.secretArtifactFile!.id,
      bucket: checksumBeforeRetry.secretArtifactFile!.bucket,
      objectKey: checksumBeforeRetry.secretArtifactFile!.objectKey,
    };
    createdArtifacts.push(checksumArtifact);
    const checksumBody = await readStream(
      await storage.getObject({
        bucket: checksumArtifact.bucket,
        objectKey: checksumArtifact.objectKey,
      }),
    );
    const tamperedBody = Buffer.from(checksumBody);
    tamperedBody[tamperedBody.length - 2] ^= 1;
    await storage.saveObject({
      bucket: checksumArtifact.bucket,
      objectKey: checksumArtifact.objectKey,
      body: tamperedBody,
      sizeBytes: tamperedBody.byteLength,
      visibility: FileVisibility.PRIVATE,
      contentType: checksumBeforeRetry.secretArtifactFile!.mimeType,
      metadata: {
        purpose: 'student-credential-secret-artifact',
        batchId: checksumBatchId,
        artifactVersion: '1',
        sha256: checksumBeforeRetry.secretArtifactFile!.checksumSha256!,
      },
    });
    await processor.execute(checksumBatchId);
    const [checksumFinal, checksumUserFinal] = await Promise.all([
      prisma.studentCredentialBatch.findUniqueOrThrow({
        where: { id: checksumBatchId },
        include: { rows: true },
      }),
      prisma.user.findUniqueOrThrow({ where: { id: secondStudentUserId } }),
    ]);
    expect(checksumFinal).toMatchObject({
      status: StudentCredentialBatchStatus.FAILED,
      generatedRows: 0,
      failedRows: 1,
    });
    expect(JSON.stringify(checksumFinal.rows[0].errorsJson)).toContain(
      'students.credentials.secret_artifact_invalid',
    );
    expect(checksumUserFinal).toMatchObject({
      passwordHash: checksumUserBefore.passwordHash,
      credentialVersion: checksumUserBefore.credentialVersion,
    });

    const credentialQueue = bullmq.getQueue(FILES_IMPORT_QUEUE_NAME);
    for (const terminalBatchId of createdBatchIds) {
      await credentialQueue.remove(
        studentCredentialBatchExecutionJobId(terminalBatchId),
      );
    }

    const exhaustedCreated = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/credential-batches`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        audienceMode: 'selected_students',
        studentIds: [secondStudentId],
        credentialMode: 'unique_generated',
      })
      .expect(202);
    const exhaustedBatchId = (exhaustedCreated.body as { id: string }).id;
    createdBatchIds.push(exhaustedBatchId);
    const exhaustedJobId =
      studentCredentialBatchExecutionJobId(exhaustedBatchId);
    const exhaustedJob = await credentialQueue.getJob(exhaustedJobId);
    expect(exhaustedJob).not.toBeNull();
    const failingWorker = bullmq.createWorker(FILES_IMPORT_QUEUE_NAME, () =>
      Promise.reject(new Error('synthetic_exhausted_job')),
    );
    try {
      await waitForJobState(exhaustedJob!, 'failed');
    } finally {
      await failingWorker.close();
    }
    const reconciliation = app.get(StudentCredentialBatchReconciliationService);
    await expect(reconciliation.reconcile()).resolves.toMatchObject({
      restored: 1,
      blockedInvariant: 0,
    });
    const replacedJob = await credentialQueue.getJob(exhaustedJobId);
    expect(replacedJob).not.toBeNull();
    expect(await replacedJob!.getState()).not.toBe('failed');
    await processor.execute(exhaustedBatchId);

    const lostCreated = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/credential-batches`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        audienceMode: 'selected_students',
        studentIds: [studentId],
        credentialMode: 'unique_generated',
      })
      .expect(202);
    const lostBatchId = (lostCreated.body as { id: string }).id;
    createdBatchIds.push(lostBatchId);
    const lostJobId = studentCredentialBatchExecutionJobId(lostBatchId);
    await credentialQueue.remove(lostJobId);
    expect(await credentialQueue.getJob(lostJobId)).toBeUndefined();
    await expect(reconciliation.reconcile()).resolves.toMatchObject({
      restored: 1,
      blockedInvariant: 0,
    });
    const restoredJob = await credentialQueue.getJob(lostJobId);
    expect(restoredJob).not.toBeNull();
    expect(restoredJob!.data).toEqual({ batchId: lostBatchId });
    await processor.execute(lostBatchId);
  });

  async function login(): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email: DEMO_ADMIN_EMAIL, password: DEMO_ADMIN_PASSWORD })
      .expect(200);
    return (response.body as { accessToken: string }).accessToken;
  }

  function createCrashingProcessor(
    failOnHashCall: number,
  ): ProcessStudentCredentialBatchUseCase {
    let hashCalls = 0;
    return new ProcessStudentCredentialBatchUseCase(
      app.get(StudentCredentialBatchRepository),
      app.get(StudentCredentialSecretArtifactService),
      {
        hash: jest.fn(async (plaintext: string) => {
          hashCalls += 1;
          if (hashCalls === failOnHashCall) {
            throw new Error('synthetic_technical_hash_failure');
          }
          return passwordService.hash(plaintext);
        }),
      } as unknown as PasswordService,
    );
  }
});

async function readStream(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks);
}

function decodeCredentialExport(body: Buffer): {
  headers: string[];
  rows: Array<Record<string, string>>;
} {
  const [headerLine, ...dataLines] = body
    .toString('utf8')
    .replace(/^\uFEFF/u, '')
    .split('\r\n')
    .filter((line) => line.length > 0);
  const headers = decodeQuotedCsvRow(headerLine);
  return {
    headers,
    rows: dataLines.map((line) => {
      const values = decodeQuotedCsvRow(line);
      return Object.fromEntries(
        headers.map((header, index) => [header, values[index]]),
      );
    }),
  };
}

function decodeQuotedCsvRow(line: string): string[] {
  return line
    .slice(1, -1)
    .split('","')
    .map((value) => value.replaceAll('""', '"'));
}

function academicDisplayName(input: {
  nameEn: string;
  nameAr: string;
}): string {
  return input.nameEn.trim() || input.nameAr.trim();
}

async function waitForJobState(
  job: { getState(): Promise<string> },
  expected: string,
): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if ((await job.getState()) === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`job_state_timeout:${expected}`);
}
