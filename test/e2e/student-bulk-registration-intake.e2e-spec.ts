import { createHash } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  FileVisibility,
  ImportJobStatus,
  PrismaClient,
  SchoolStatus,
  SchoolLoginSettingsStatus,
  StudentBulkRegistrationBatchStatus,
  StudentBulkRegistrationRowStatus,
  UserType,
} from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { StorageService } from '../../src/infrastructure/storage/storage.service';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../src/common/context/request-context';
import { ProcessStudentBulkRegistrationValidationUseCase } from '../../src/modules/students/registration/application/process-student-bulk-registration-validation.use-case';
import { ProcessStudentBulkRegistrationExecutionUseCase } from '../../src/modules/students/registration/application/process-student-bulk-registration-execution.use-case';
import { StudentBulkRegistrationRepository } from '../../src/modules/students/registration/infrastructure/student-bulk-registration.repository';
import { StudentBulkRegistrationPlacementService } from '../../src/modules/students/registration/domain/student-bulk-registration-placement.service';
import { ImportJobsRepository } from '../../src/modules/files/imports/infrastructure/import-jobs.repository';
import { LoginIdentityRepository } from '../../src/modules/settings/login-identity/infrastructure/login-identity.repository';
import {
  STUDENT_BULK_REGISTRATION_EXECUTION_RECOVERY_WINDOW_MS,
  STUDENT_BULK_REGISTRATION_TEMPLATE_HEADERS,
} from '../../src/modules/students/registration/domain/student-bulk-registration.constants';
import { StudentBulkRegistrationExecutionReconciliationService } from '../../src/modules/students/registration/application/student-bulk-registration-execution-reconciliation.service';
import { StudentBulkRegistrationExecutionRepository } from '../../src/modules/students/registration/infrastructure/student-bulk-registration-execution.repository';
import { BullmqService } from '../../src/infrastructure/queue/bullmq.service';

const GLOBAL_PREFIX = '/api/v1';
const DEMO_ADMIN_EMAIL = 'admin@academy.moazez.dev';
const DEMO_ADMIN_PASSWORD = 'School123!';
const TEST_SUFFIX = `bulk-registration-intake-${Date.now()}`;
const VALID_USERNAME = `stage4.${Date.now()}`;
const VALID_CSV = Buffer.from(
  `${STUDENT_BULK_REGISTRATION_TEMPLATE_HEADERS.join(',')}\n` +
    `Stage,Four,,Valid,,,,,2012-05-20,female,Egyptian,${VALID_USERNAME},,+201001234567\n`,
);
const INVALID_CSV = Buffer.from(
  `${STUDENT_BULK_REGISTRATION_TEMPLATE_HEADERS.join(',')}\n` +
    'Stage,Four,,Invalid,,,,,bad-date,female,Egyptian,,,not-a-phone\n',
);

jest.setTimeout(30000);

describe('Student bulk registration intake flow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let storageService: StorageService;
  let processor: ProcessStudentBulkRegistrationValidationUseCase;
  let executor: ProcessStudentBulkRegistrationExecutionUseCase;
  let schoolId: string;
  let organizationId: string;
  let actorId: string;
  let academicYearId: string;
  let termId: string;
  let stageId: string;
  let gradeId: string;
  let sectionId: string;
  let classroomId: string;
  let partialClassroomId: string | null = null;
  let batchId: string | null = null;
  let importJobId: string | null = null;
  let fileId: string | null = null;
  let storedBucket: string | null = null;
  let storedObjectKey: string | null = null;
  let createdAcademicYear = false;
  let createdTerm = false;
  let createdLoginSettings = false;
  let previousLoginSettingsStatus: SchoolLoginSettingsStatus | null = null;
  let forbiddenCountsBefore: {
    students: number;
    users: number;
    memberships: number;
    enrollments: number;
  };
  const intakeResources: Array<{
    batchId: string;
    importJobId: string;
    fileId: string;
    bucket: string;
    objectKey: string;
  }> = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    const school = await prisma.school.findFirstOrThrow({
      where: { slug: 'moazez-academy' },
      select: { id: true, organizationId: true },
    });
    const actor = await prisma.user.findUniqueOrThrow({
      where: { email: DEMO_ADMIN_EMAIL },
      select: { id: true },
    });
    schoolId = school.id;
    organizationId = school.organizationId;
    actorId = actor.id;
    await createPlacement();
    const currentLoginSettings = await prisma.schoolLoginSettings.findUnique({
      where: { schoolId },
    });
    if (currentLoginSettings) {
      previousLoginSettingsStatus = currentLoginSettings.status;
      await prisma.schoolLoginSettings.update({
        where: { schoolId },
        data: { status: SchoolLoginSettingsStatus.ACTIVE },
      });
    } else {
      await prisma.schoolLoginSettings.create({
        data: {
          schoolId,
          loginDomain: `bulk-${Date.now()}.students.example.edu`,
          usernameMinLength: 3,
          usernameMaxLength: 40,
          status: SchoolLoginSettingsStatus.ACTIVE,
        },
      });
      createdLoginSettings = true;
    }

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
    storageService = app.get(StorageService);
    processor = new ProcessStudentBulkRegistrationValidationUseCase(
      app.get(ImportJobsRepository),
      app.get(StudentBulkRegistrationRepository),
      storageService,
      app.get(LoginIdentityRepository),
      app.get(StudentBulkRegistrationPlacementService),
    );
    executor = app.get(ProcessStudentBulkRegistrationExecutionUseCase);
  });

  afterAll(async () => {
    if (prisma) {
      const executionRows = await prisma.studentBulkRegistrationRow.findMany({
        where: {
          batchId: { in: intakeResources.map((item) => item.batchId) },
        },
        select: { studentId: true, userId: true, enrollmentId: true },
      });
      await prisma.studentBulkRegistrationBatch.deleteMany({
        where: { id: { in: intakeResources.map((item) => item.batchId) } },
      });
      const enrollmentIds = executionRows.flatMap((row) =>
        row.enrollmentId ? [row.enrollmentId] : [],
      );
      const studentIds = executionRows.flatMap((row) =>
        row.studentId ? [row.studentId] : [],
      );
      const userIds = executionRows.flatMap((row) =>
        row.userId ? [row.userId] : [],
      );
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { resourceId: { in: intakeResources.map((item) => item.batchId) } },
            { resourceId: { in: studentIds } },
          ],
        },
      });
      await prisma.enrollment.deleteMany({
        where: { id: { in: enrollmentIds } },
      });
      await prisma.student.deleteMany({ where: { id: { in: studentIds } } });
      await prisma.membership.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.importJob.deleteMany({
        where: { id: { in: intakeResources.map((item) => item.importJobId) } },
      });
      await prisma.file.deleteMany({
        where: { id: { in: intakeResources.map((item) => item.fileId) } },
      });
      if (classroomId || partialClassroomId) {
        await prisma.classroom.deleteMany({
          where: {
            id: {
              in: [classroomId, partialClassroomId].filter(
                (value): value is string => Boolean(value),
              ),
            },
          },
        });
      }
      if (sectionId) {
        await prisma.section.deleteMany({ where: { id: sectionId } });
      }
      if (gradeId) await prisma.grade.deleteMany({ where: { id: gradeId } });
      if (stageId) await prisma.stage.deleteMany({ where: { id: stageId } });
      if (createdTerm && termId) {
        await prisma.term.deleteMany({ where: { id: termId } });
      }
      if (createdAcademicYear && academicYearId) {
        await prisma.academicYear.deleteMany({ where: { id: academicYearId } });
      }
      if (createdLoginSettings) {
        await prisma.schoolLoginSettings.deleteMany({ where: { schoolId } });
      } else if (previousLoginSettingsStatus) {
        await prisma.schoolLoginSettings.updateMany({
          where: { schoolId },
          data: { status: previousLoginSettingsStatus },
        });
      }
    }
    if (storageService) {
      for (const resource of intakeResources) {
        await storageService.deleteObject({
          bucket: resource.bucket,
          objectKey: resource.objectKey,
        });
      }
    }
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
  });

  it('preflights, downloads the template, and persists only the pending intake foundation', async () => {
    const token = await login();
    const placement = {
      academicYearId,
      termId,
      classroomId,
      enrollmentDate: '2026-09-01',
    };
    forbiddenCountsBefore = await readForbiddenMutationCounts();

    const preflight = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/bulk-registrations/preflight`)
      .set('Authorization', `Bearer ${token}`)
      .send(placement)
      .expect(200);
    const preflightBody = preflight.body as {
      studentSeat: { used: number };
    };
    expect(typeof preflightBody.studentSeat.used).toBe('number');
    expect(preflightBody).toMatchObject({
      valid: true,
      errors: [],
      templateVersion: 1,
      placement: {
        academicYear: { id: academicYearId },
        term: { id: termId },
        stage: { id: stageId },
        grade: { id: gradeId },
        section: { id: sectionId },
        classroom: { id: classroomId, capacity: 10 },
        enrollmentDate: '2026-09-01',
      },
    });

    const template = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/students-guardians/bulk-registrations/template`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(template.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(template.headers['content-disposition']).toBe(
      'attachment; filename="student-bulk-registration-v1.csv"',
    );
    expect(template.text).toBe(
      '\uFEFFfirst_name_en,father_name_en,grandfather_name_en,family_name_en,first_name_ar,father_name_ar,grandfather_name_ar,family_name_ar,date_of_birth,gender,nationality,username,contact_email,student_phone\r\n',
    );
    expect(Buffer.from(template.text, 'utf8').subarray(0, 3)).toEqual(
      Buffer.from([0xef, 0xbb, 0xbf]),
    );

    const upload = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/bulk-registrations`)
      .set('Authorization', `Bearer ${token}`)
      .field('academicYearId', academicYearId)
      .field('termId', termId)
      .field('classroomId', classroomId)
      .field('enrollmentDate', '2026-09-01')
      .attach('file', VALID_CSV, {
        filename: 'bulk-students.csv',
        contentType: 'text/csv',
      })
      .expect(201);

    const uploadBody = upload.body as {
      id: string;
      sourceImportJobId: string;
      createdAt: string;
      updatedAt: string;
    };
    batchId = uploadBody.id;
    importJobId = uploadBody.sourceImportJobId;
    expect(Number.isNaN(Date.parse(uploadBody.createdAt))).toBe(false);
    expect(Number.isNaN(Date.parse(uploadBody.updatedAt))).toBe(false);
    expect(uploadBody).toEqual({
      id: batchId,
      sourceImportJobId: importJobId,
      status: StudentBulkRegistrationBatchStatus.UPLOADED,
      templateVersion: 1,
      placement: {
        academicYearId,
        termId,
        classroomId,
        enrollmentDate: '2026-09-01',
      },
      counters: {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        createdRows: 0,
        failedRows: 0,
      },
      createdAt: uploadBody.createdAt,
      updatedAt: uploadBody.updatedAt,
    });

    const persistedBatch = await prisma.studentBulkRegistrationBatch.findUnique(
      {
        where: { id: batchId },
      },
    );
    const persistedImportJob = await prisma.importJob.findUnique({
      where: { id: importJobId },
      include: { uploadedFile: true },
    });
    fileId = persistedImportJob?.uploadedFileId ?? null;
    storedBucket = persistedImportJob?.uploadedFile.bucket ?? null;
    storedObjectKey = persistedImportJob?.uploadedFile.objectKey ?? null;

    expect(persistedBatch).toMatchObject({
      id: batchId,
      schoolId,
      organizationId,
      sourceImportJobId: importJobId,
      academicYearId,
      termId,
      classroomId,
      templateVersion: 1,
      status: StudentBulkRegistrationBatchStatus.UPLOADED,
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      createdRows: 0,
      failedRows: 0,
      createdById: actorId,
      validatedAt: null,
      startedAt: null,
      completedAt: null,
    });
    expect(persistedImportJob).toMatchObject({
      id: importJobId,
      schoolId,
      type: 'students_bulk_registration',
      status: ImportJobStatus.PENDING,
      createdById: actorId,
      uploadedFile: {
        organizationId,
        schoolId,
        uploaderId: actorId,
        originalName: 'bulk-students.csv',
        mimeType: 'text/csv',
        sizeBytes: BigInt(VALID_CSV.byteLength),
        checksumSha256: createHash('sha256').update(VALID_CSV).digest('hex'),
        visibility: FileVisibility.PRIVATE,
      },
    });
    expect(storedObjectKey).toMatch(
      new RegExp(`^schools/${schoolId}/files/[0-9a-f-]+\\.csv$`, 'u'),
    );
    if (!storedBucket || !storedObjectKey) {
      throw new Error('Expected persisted private storage metadata');
    }
    expect(
      await storageService.objectExists({
        bucket: storedBucket,
        objectKey: storedObjectKey,
      }),
    ).toBe(true);
    expect(
      await prisma.studentBulkRegistrationRow.count({ where: { batchId } }),
    ).toBe(0);
    intakeResources.push({
      batchId,
      importJobId,
      fileId,
      bucket: storedBucket,
      objectKey: storedObjectKey,
    });
    await expect(readForbiddenMutationCounts()).resolves.toEqual(
      forbiddenCountsBefore,
    );
  });

  it('processes the queued intake to READY and exposes the tenant-scoped preview', async () => {
    await processInPersistedScope(importJobId!);
    const persistedBatch =
      await prisma.studentBulkRegistrationBatch.findUniqueOrThrow({
        where: { id: batchId! },
      });
    expect(persistedBatch).toMatchObject({
      status: StudentBulkRegistrationBatchStatus.READY,
      totalRows: 1,
      validRows: 1,
      invalidRows: 0,
    });
    const token = await login();
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/students-guardians/bulk-registrations/${batchId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect((response) => {
        const body = response.body as {
          items: Array<{ errors: unknown[] }>;
        };
        expect(body).toMatchObject({
          id: batchId,
          status: StudentBulkRegistrationBatchStatus.READY,
          counters: { totalRows: 1, validRows: 1, invalidRows: 0 },
          validationErrors: [],
        });
      });
    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/students-guardians/bulk-registrations/${batchId}/rows`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          total: 1,
          page: 1,
          limit: 50,
          items: [
            {
              rowNumber: 2,
              status: StudentBulkRegistrationRowStatus.VALID,
              normalizedData: { username: VALID_USERNAME },
              errors: [],
              studentId: null,
              userId: null,
              enrollmentId: null,
            },
          ],
        });
      });
    await expect(readForbiddenMutationCounts()).resolves.toEqual(
      forbiddenCountsBefore,
    );
  });

  it('confirms READY and atomically provisions a passwordless Student through COMPLETED', async () => {
    const token = await login();
    const confirmation = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/students-guardians/bulk-registrations/${batchId}/confirm`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(202);
    expect(confirmation.body).toMatchObject({
      id: batchId,
      status: StudentBulkRegistrationBatchStatus.EXECUTING,
      counters: { validRows: 1, createdRows: 0, failedRows: 0 },
      completedAt: null,
      validationErrors: [],
    });
    expect(
      Number.isNaN(
        Date.parse((confirmation.body as { startedAt: string }).startedAt),
      ),
    ).toBe(false);

    await executor.execute(batchId!);

    const batch = await prisma.studentBulkRegistrationBatch.findUniqueOrThrow({
      where: { id: batchId! },
    });
    const row = await prisma.studentBulkRegistrationRow.findFirstOrThrow({
      where: { batchId: batchId! },
    });
    if (!row.userId || !row.studentId || !row.enrollmentId) {
      throw new Error('Expected completed reconciliation identifiers');
    }
    const [user, membership, student, enrollment] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: row.userId } }),
      prisma.membership.findFirstOrThrow({ where: { userId: row.userId } }),
      prisma.student.findUniqueOrThrow({ where: { id: row.studentId } }),
      prisma.enrollment.findUniqueOrThrow({ where: { id: row.enrollmentId } }),
    ]);
    expect(batch).toMatchObject({
      status: StudentBulkRegistrationBatchStatus.COMPLETED,
      createdRows: 1,
      failedRows: 0,
    });
    expect(batch.completedAt).toBeInstanceOf(Date);
    expect(row).toMatchObject({
      status: StudentBulkRegistrationRowStatus.CREATED,
      schoolId,
    });
    expect(user).toMatchObject({
      userType: UserType.STUDENT,
      status: 'ACTIVE',
      passwordHash: null,
      mustChangePassword: false,
      passwordProvisionedAt: null,
      passwordChangedAt: null,
      credentialVersion: 0,
    });
    expect(user.email).not.toBe(user.contactEmail);
    expect(membership).toMatchObject({
      schoolId,
      organizationId,
      userType: UserType.STUDENT,
      status: 'ACTIVE',
    });
    expect(student).toMatchObject({
      schoolId,
      organizationId,
      userId: user.id,
      status: 'ACTIVE',
    });
    expect(enrollment).toMatchObject({
      schoolId,
      studentId: student.id,
      academicYearId,
      termId,
      classroomId,
      status: 'ACTIVE',
    });

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/students-guardians/bulk-registrations/${batchId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          status: StudentBulkRegistrationBatchStatus.COMPLETED,
          counters: { createdRows: 1, failedRows: 0 },
          completedAt: expect.any(String) as unknown,
        });
      });
  });

  it('completes an invalid CSV as VALIDATION_FAILED with row preview and no business creation', async () => {
    const mutationCountsBeforeInvalidValidation =
      await readForbiddenMutationCounts();
    const token = await login();
    const upload = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/bulk-registrations`)
      .set('Authorization', `Bearer ${token}`)
      .field('academicYearId', academicYearId)
      .field('termId', termId)
      .field('classroomId', classroomId)
      .field('enrollmentDate', '2026-09-01')
      .attach('file', INVALID_CSV, {
        filename: 'bulk-students-invalid.csv',
        contentType: 'text/csv',
      })
      .expect(201);
    const ids = upload.body as { id: string; sourceImportJobId: string };
    const source = await prisma.importJob.findUniqueOrThrow({
      where: { id: ids.sourceImportJobId },
      include: { uploadedFile: true },
    });
    intakeResources.push({
      batchId: ids.id,
      importJobId: ids.sourceImportJobId,
      fileId: source.uploadedFileId,
      bucket: source.uploadedFile.bucket,
      objectKey: source.uploadedFile.objectKey,
    });

    await processInPersistedScope(ids.sourceImportJobId);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/students-guardians/bulk-registrations/${ids.id}/rows?status=INVALID`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          total: 1,
          items: [
            {
              rowNumber: 2,
              status: StudentBulkRegistrationRowStatus.INVALID,
              studentId: null,
              userId: null,
              enrollmentId: null,
            },
          ],
        });
        expect(
          readFirstRowErrorCount(response.body as unknown),
        ).toBeGreaterThan(0);
      });
    const invalidBatch =
      await prisma.studentBulkRegistrationBatch.findUniqueOrThrow({
        where: { id: ids.id },
      });
    expect(invalidBatch).toMatchObject({
      status: StudentBulkRegistrationBatchStatus.VALIDATION_FAILED,
      totalRows: 1,
      validRows: 0,
      invalidRows: 1,
    });
    await expect(readForbiddenMutationCounts()).resolves.toEqual(
      mutationCountsBeforeInvalidValidation,
    );
  });

  it('persists CREATED and FAILED rows and closes execution as partial after a post-confirm capacity change', async () => {
    const token = await login();
    const classroom = await prisma.classroom.create({
      data: {
        schoolId,
        sectionId,
        nameAr: `${TEST_SUFFIX}-partial-classroom-ar`,
        nameEn: `${TEST_SUFFIX}-partial-classroom`,
        sortOrder: 102,
        capacity: 2,
      },
      select: { id: true },
    });
    partialClassroomId = classroom.id;
    const partialCsv = Buffer.from(
      `${STUDENT_BULK_REGISTRATION_TEMPLATE_HEADERS.join(',')}\n` +
        `Partial,One,,Student,,,,,2012-05-20,female,Egyptian,partial.one.${Date.now()},,\n` +
        `Partial,Two,,Student,,,,,2012-05-20,female,Egyptian,partial.two.${Date.now()},,\n`,
    );
    const upload = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/bulk-registrations`)
      .set('Authorization', `Bearer ${token}`)
      .field('academicYearId', academicYearId)
      .field('termId', termId)
      .field('classroomId', classroom.id)
      .field('enrollmentDate', '2026-09-01')
      .attach('file', partialCsv, {
        filename: 'bulk-students-partial.csv',
        contentType: 'text/csv',
      })
      .expect(201);
    const ids = upload.body as { id: string; sourceImportJobId: string };
    const source = await prisma.importJob.findUniqueOrThrow({
      where: { id: ids.sourceImportJobId },
      include: { uploadedFile: true },
    });
    intakeResources.push({
      batchId: ids.id,
      importJobId: ids.sourceImportJobId,
      fileId: source.uploadedFileId,
      bucket: source.uploadedFile.bucket,
      objectKey: source.uploadedFile.objectKey,
    });
    await processInPersistedScope(ids.sourceImportJobId);
    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/students-guardians/bulk-registrations/${ids.id}/confirm`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(202);
    await prisma.classroom.update({
      where: { id: classroom.id },
      data: { capacity: 1 },
    });

    await executor.execute(ids.id);

    const [partialBatch, rows] = await Promise.all([
      prisma.studentBulkRegistrationBatch.findUniqueOrThrow({
        where: { id: ids.id },
      }),
      prisma.studentBulkRegistrationRow.findMany({
        where: { batchId: ids.id },
        orderBy: { rowNumber: 'asc' },
      }),
    ]);
    expect(partialBatch).toMatchObject({
      status: StudentBulkRegistrationBatchStatus.EXECUTION_PARTIAL_FAILED,
      createdRows: 1,
      failedRows: 1,
    });
    expect(rows.map((row) => row.status).sort()).toEqual([
      StudentBulkRegistrationRowStatus.CREATED,
      StudentBulkRegistrationRowStatus.FAILED,
    ]);
    const failed = rows.find(
      (row) => row.status === StudentBulkRegistrationRowStatus.FAILED,
    );
    expect(failed).toMatchObject({
      studentId: null,
      userId: null,
      enrollmentId: null,
    });
    expect(JSON.stringify(failed?.errorsJson)).toContain(
      'students.enrollment.placement_conflict',
    );
  });

  it('recovers a confirmed batch whose deterministic execution enqueue was lost', async () => {
    const ids = await createConfirmedBatch('lost-enqueue');
    const queue = {
      ensureJobFromPersistedTruth: jest.fn().mockResolvedValue('created'),
    };
    const reconciliation =
      new StudentBulkRegistrationExecutionReconciliationService(
        app.get(StudentBulkRegistrationExecutionRepository),
        queue as unknown as BullmqService,
      );

    await expect(reconciliation.reconcile()).resolves.toMatchObject({
      restored: 1,
      blockedInvariant: 0,
    });
    expect(queue.ensureJobFromPersistedTruth).toHaveBeenCalledWith(
      'files-imports',
      'execute-student-bulk-registration',
      { batchId: ids.id },
      {
        jobId: `student-bulk-registration-execution-${ids.id}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
    await executor.execute(ids.id);
    await expect(
      prisma.studentBulkRegistrationBatch.findUniqueOrThrow({
        where: { id: ids.id },
        select: { status: true },
      }),
    ).resolves.toEqual({
      status: StudentBulkRegistrationBatchStatus.COMPLETED,
    });
  });

  it('terminalizes an expired confirmed batch without creating business entities', async () => {
    const ids = await createConfirmedBatch('expired');
    const reconciliationNow = new Date(Date.now() + 1_000);
    await prisma.studentBulkRegistrationBatch.update({
      where: { id: ids.id },
      data: {
        startedAt: new Date(
          reconciliationNow.getTime() -
            STUDENT_BULK_REGISTRATION_EXECUTION_RECOVERY_WINDOW_MS -
            1,
        ),
      },
    });
    const queue = {
      ensureJobFromPersistedTruth: jest.fn(() => {
        throw new Error('queue_must_not_be_called');
      }),
    };
    const reconciliation =
      new StudentBulkRegistrationExecutionReconciliationService(
        app.get(StudentBulkRegistrationExecutionRepository),
        queue as unknown as BullmqService,
      );

    await reconciliation.reconcile(reconciliationNow);

    const [batch, row] = await Promise.all([
      prisma.studentBulkRegistrationBatch.findUniqueOrThrow({
        where: { id: ids.id },
      }),
      prisma.studentBulkRegistrationRow.findFirstOrThrow({
        where: { batchId: ids.id },
      }),
    ]);
    expect(batch).toMatchObject({
      status: StudentBulkRegistrationBatchStatus.FAILED,
      createdRows: 0,
      failedRows: 1,
    });
    expect(row).toMatchObject({
      status: StudentBulkRegistrationRowStatus.FAILED,
      studentId: null,
      userId: null,
      enrollmentId: null,
    });
    expect(JSON.stringify(row.errorsJson)).toContain(
      'students.bulk_registration.execution_recovery_window_expired',
    );
    expect(queue.ensureJobFromPersistedTruth).not.toHaveBeenCalled();
  });

  it('terminalizes a confirmed batch when its school becomes inactive', async () => {
    const ids = await createConfirmedBatch('tenant-inactive');
    const queue = {
      ensureJobFromPersistedTruth: jest.fn(() => {
        throw new Error('queue_must_not_be_called');
      }),
    };
    const reconciliation =
      new StudentBulkRegistrationExecutionReconciliationService(
        app.get(StudentBulkRegistrationExecutionRepository),
        queue as unknown as BullmqService,
      );
    await prisma.school.update({
      where: { id: schoolId },
      data: { status: SchoolStatus.SUSPENDED },
    });
    try {
      await reconciliation.reconcile();
    } finally {
      await prisma.school.update({
        where: { id: schoolId },
        data: { status: SchoolStatus.ACTIVE },
      });
    }

    const [batch, row] = await Promise.all([
      prisma.studentBulkRegistrationBatch.findUniqueOrThrow({
        where: { id: ids.id },
      }),
      prisma.studentBulkRegistrationRow.findFirstOrThrow({
        where: { batchId: ids.id },
      }),
    ]);
    expect(batch).toMatchObject({
      status: StudentBulkRegistrationBatchStatus.FAILED,
      createdRows: 0,
      failedRows: 1,
    });
    expect(row).toMatchObject({
      status: StudentBulkRegistrationRowStatus.FAILED,
      studentId: null,
      userId: null,
      enrollmentId: null,
    });
    expect(JSON.stringify(row.errorsJson)).toContain(
      'students.bulk_registration.execution_tenant_ineligible',
    );
    expect(queue.ensureJobFromPersistedTruth).not.toHaveBeenCalled();
  });

  it('keeps a created row and fails the next row when the tenant deactivates mid-run', async () => {
    const ids = await createConfirmedBatch('tenant-mid-run', 2);
    const repository = app.get(StudentBulkRegistrationExecutionRepository);
    const rows = await prisma.studentBulkRegistrationRow.findMany({
      where: { batchId: ids.id },
      orderBy: { rowNumber: 'asc' },
      select: { id: true },
    });
    await expect(
      repository.provisionRow({
        batchId: ids.id,
        schoolId,
        rowId: rows[0].id,
      }),
    ).resolves.toMatchObject({ kind: 'created' });

    await prisma.school.update({
      where: { id: schoolId },
      data: { status: SchoolStatus.SUSPENDED },
    });
    try {
      await executor.execute(ids.id);
    } finally {
      await prisma.school.update({
        where: { id: schoolId },
        data: { status: SchoolStatus.ACTIVE },
      });
    }

    const [batch, outcomes] = await Promise.all([
      prisma.studentBulkRegistrationBatch.findUniqueOrThrow({
        where: { id: ids.id },
      }),
      prisma.studentBulkRegistrationRow.findMany({
        where: { batchId: ids.id },
        orderBy: { rowNumber: 'asc' },
      }),
    ]);
    expect(batch).toMatchObject({
      status: StudentBulkRegistrationBatchStatus.EXECUTION_PARTIAL_FAILED,
      createdRows: 1,
      failedRows: 1,
    });
    expect(outcomes[0]).toMatchObject({
      status: StudentBulkRegistrationRowStatus.CREATED,
    });
    expect(outcomes[0].studentId).not.toBeNull();
    expect(outcomes[0].userId).not.toBeNull();
    expect(outcomes[0].enrollmentId).not.toBeNull();
    expect(outcomes[1]).toMatchObject({
      status: StudentBulkRegistrationRowStatus.FAILED,
      studentId: null,
      userId: null,
      enrollmentId: null,
    });
    expect(JSON.stringify(outcomes[1].errorsJson)).toContain(
      'students.bulk_registration.execution_tenant_ineligible',
    );
  });

  async function login(): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email: DEMO_ADMIN_EMAIL, password: DEMO_ADMIN_PASSWORD })
      .expect(200);
    return (response.body as { accessToken: string }).accessToken;
  }

  async function createConfirmedBatch(
    label: string,
    rowCount = 1,
  ): Promise<{
    id: string;
    sourceImportJobId: string;
  }> {
    const token = await login();
    const suffix = Date.now();
    const rows = Array.from(
      { length: rowCount },
      (_, index) =>
        `Recovery,${label}${index + 1},,Student,,,,,2012-05-20,female,Egyptian,recovery.${label}.${suffix}.${index + 1},,`,
    );
    const csv = Buffer.from(
      `${STUDENT_BULK_REGISTRATION_TEMPLATE_HEADERS.join(',')}\n${rows.join('\n')}\n`,
    );
    const upload = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/bulk-registrations`)
      .set('Authorization', `Bearer ${token}`)
      .field('academicYearId', academicYearId)
      .field('termId', termId)
      .field('classroomId', classroomId)
      .field('enrollmentDate', '2026-09-01')
      .attach('file', csv, {
        filename: `bulk-students-${label}.csv`,
        contentType: 'text/csv',
      })
      .expect(201);
    const ids = upload.body as { id: string; sourceImportJobId: string };
    const source = await prisma.importJob.findUniqueOrThrow({
      where: { id: ids.sourceImportJobId },
      include: { uploadedFile: true },
    });
    intakeResources.push({
      batchId: ids.id,
      importJobId: ids.sourceImportJobId,
      fileId: source.uploadedFileId,
      bucket: source.uploadedFile.bucket,
      objectKey: source.uploadedFile.objectKey,
    });
    await processInPersistedScope(ids.sourceImportJobId);
    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/students-guardians/bulk-registrations/${ids.id}/confirm`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(202);
    return ids;
  }

  async function readForbiddenMutationCounts(): Promise<{
    students: number;
    users: number;
    memberships: number;
    enrollments: number;
  }> {
    const [students, users, memberships, enrollments] = await Promise.all([
      prisma.student.count(),
      prisma.user.count(),
      prisma.membership.count(),
      prisma.enrollment.count(),
    ]);
    return { students, users, memberships, enrollments };
  }

  async function processInPersistedScope(jobId: string): Promise<void> {
    const context = createRequestContext(`e2e-bulk-validation:${jobId}`);
    context.actor = { id: actorId, userType: UserType.SCHOOL_USER };
    context.activeMembership = {
      membershipId: 'queue:files-import-validation',
      organizationId,
      schoolId,
      roleId: 'queue:files-import-validation',
      permissions: [],
    };
    await runWithRequestContext(context, () => processor.execute(jobId));
  }

  function readFirstRowErrorCount(value: unknown): number {
    if (!isRecord(value) || !isUnknownArray(value.items)) return 0;
    const first = value.items[0];
    return isRecord(first) && isUnknownArray(first.errors)
      ? first.errors.length
      : 0;
  }

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  function isUnknownArray(value: unknown): value is unknown[] {
    return Array.isArray(value);
  }

  async function createPlacement(): Promise<void> {
    const existingAcademicYear = await prisma.academicYear.findFirst({
      where: { schoolId, isActive: true, deletedAt: null },
      select: { id: true },
    });
    const academicYear =
      existingAcademicYear ??
      (await prisma.academicYear.create({
        data: {
          schoolId,
          nameAr: `${TEST_SUFFIX}-year-ar`,
          nameEn: `${TEST_SUFFIX}-year`,
          startDate: new Date('2026-09-01T00:00:00.000Z'),
          endDate: new Date('2027-06-30T00:00:00.000Z'),
          isActive: true,
        },
        select: { id: true },
      }));
    createdAcademicYear = !existingAcademicYear;
    academicYearId = academicYear.id;
    const existingTerm = await prisma.term.findFirst({
      where: {
        schoolId,
        academicYearId,
        isActive: true,
        deletedAt: null,
      },
      select: { id: true },
    });
    const term =
      existingTerm ??
      (await prisma.term.create({
        data: {
          schoolId,
          academicYearId,
          nameAr: `${TEST_SUFFIX}-term-ar`,
          nameEn: `${TEST_SUFFIX}-term`,
          startDate: new Date('2026-09-01T00:00:00.000Z'),
          endDate: new Date('2026-12-31T00:00:00.000Z'),
          isActive: true,
        },
        select: { id: true },
      }));
    createdTerm = !existingTerm;
    termId = term.id;
    const stage = await prisma.stage.create({
      data: {
        schoolId,
        nameAr: `${TEST_SUFFIX}-stage-ar`,
        nameEn: `${TEST_SUFFIX}-stage`,
        sortOrder: 101,
      },
      select: { id: true },
    });
    stageId = stage.id;
    const grade = await prisma.grade.create({
      data: {
        schoolId,
        stageId,
        nameAr: `${TEST_SUFFIX}-grade-ar`,
        nameEn: `${TEST_SUFFIX}-grade`,
        sortOrder: 101,
      },
      select: { id: true },
    });
    gradeId = grade.id;
    const section = await prisma.section.create({
      data: {
        schoolId,
        gradeId,
        nameAr: `${TEST_SUFFIX}-section-ar`,
        nameEn: `${TEST_SUFFIX}-section`,
        sortOrder: 101,
      },
      select: { id: true },
    });
    sectionId = section.id;
    const classroom = await prisma.classroom.create({
      data: {
        schoolId,
        sectionId,
        nameAr: `${TEST_SUFFIX}-classroom-ar`,
        nameEn: `${TEST_SUFFIX}-classroom`,
        sortOrder: 101,
        capacity: 10,
      },
      select: { id: true },
    });
    classroomId = classroom.id;
  }
});
