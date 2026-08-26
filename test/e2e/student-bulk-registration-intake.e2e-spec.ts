import { createHash } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  FileVisibility,
  ImportJobStatus,
  PrismaClient,
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
import { StudentBulkRegistrationRepository } from '../../src/modules/students/registration/infrastructure/student-bulk-registration.repository';
import { StudentBulkRegistrationPlacementService } from '../../src/modules/students/registration/domain/student-bulk-registration-placement.service';
import { ImportJobsRepository } from '../../src/modules/files/imports/infrastructure/import-jobs.repository';
import { LoginIdentityRepository } from '../../src/modules/settings/login-identity/infrastructure/login-identity.repository';
import { STUDENT_BULK_REGISTRATION_TEMPLATE_HEADERS } from '../../src/modules/students/registration/domain/student-bulk-registration.constants';

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
  let schoolId: string;
  let organizationId: string;
  let actorId: string;
  let academicYearId: string;
  let termId: string;
  let stageId: string;
  let gradeId: string;
  let sectionId: string;
  let classroomId: string;
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
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.studentBulkRegistrationBatch.deleteMany({
        where: { id: { in: intakeResources.map((item) => item.batchId) } },
      });
      await prisma.importJob.deleteMany({
        where: { id: { in: intakeResources.map((item) => item.importJobId) } },
      });
      await prisma.file.deleteMany({
        where: { id: { in: intakeResources.map((item) => item.fileId) } },
      });
      if (classroomId) {
        await prisma.classroom.deleteMany({ where: { id: classroomId } });
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
      'first_name_en,father_name_en,grandfather_name_en,family_name_en,first_name_ar,father_name_ar,grandfather_name_ar,family_name_ar,date_of_birth,gender,nationality,username,contact_email,student_phone\r\n',
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

  it('completes an invalid CSV as VALIDATION_FAILED with row preview and no business creation', async () => {
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
      forbiddenCountsBefore,
    );
  });

  async function login(): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email: DEMO_ADMIN_EMAIL, password: DEMO_ADMIN_PASSWORD })
      .expect(200);
    return (response.body as { accessToken: string }).accessToken;
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
