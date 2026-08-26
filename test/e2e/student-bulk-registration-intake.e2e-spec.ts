import { createHash } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  FileVisibility,
  ImportJobStatus,
  PrismaClient,
  StudentBulkRegistrationBatchStatus,
} from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { StorageService } from '../../src/infrastructure/storage/storage.service';

const GLOBAL_PREFIX = '/api/v1';
const DEMO_ADMIN_EMAIL = 'admin@academy.moazez.dev';
const DEMO_ADMIN_PASSWORD = 'School123!';
const TEST_SUFFIX = `bulk-registration-intake-${Date.now()}`;
const ARBITRARY_CSV = Buffer.from('this,is,not,the,v1,header\n1,2,3');

jest.setTimeout(30000);

describe('Student bulk registration intake flow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let storageService: StorageService;
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
  });

  afterAll(async () => {
    if (prisma) {
      if (importJobId && (!fileId || !storedBucket || !storedObjectKey)) {
        const persistedImportJob = await prisma.importJob.findUnique({
          where: { id: importJobId },
          include: { uploadedFile: true },
        });
        fileId = persistedImportJob?.uploadedFileId ?? fileId;
        storedBucket = persistedImportJob?.uploadedFile.bucket ?? storedBucket;
        storedObjectKey =
          persistedImportJob?.uploadedFile.objectKey ?? storedObjectKey;
      }
      if (batchId) {
        await prisma.studentBulkRegistrationBatch.deleteMany({
          where: { id: batchId },
        });
      }
      if (importJobId) {
        await prisma.importJob.deleteMany({ where: { id: importJobId } });
      }
      if (fileId) {
        await prisma.file.deleteMany({ where: { id: fileId } });
      }
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
    }
    if (storedBucket && storedObjectKey && storageService) {
      await storageService.deleteObject({
        bucket: storedBucket,
        objectKey: storedObjectKey,
      });
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
    const mutationCountsBefore = await readForbiddenMutationCounts();

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
      .attach('file', ARBITRARY_CSV, {
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
        sizeBytes: BigInt(ARBITRARY_CSV.byteLength),
        checksumSha256: createHash('sha256')
          .update(ARBITRARY_CSV)
          .digest('hex'),
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
    await expect(readForbiddenMutationCounts()).resolves.toEqual(
      mutationCountsBefore,
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
