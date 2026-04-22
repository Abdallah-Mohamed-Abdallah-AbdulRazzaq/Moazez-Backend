import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ImportJobStatus, PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { StorageService } from '../../src/infrastructure/storage/storage.service';

const GLOBAL_PREFIX = '/api/v1';

const DEMO_ADMIN_EMAIL = 'admin@academy.moazez.dev';
const DEMO_ADMIN_PASSWORD = 'School123!';

jest.setTimeout(30000);

describe('Files imports skeleton flow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let storageService: StorageService;
  let uploadedFileId: string | null = null;
  let importJobId: string | null = null;
  let uploadedBucket: string | null = null;
  let uploadedObjectKey: string | null = null;
  let attachmentCountBefore = 0;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [schoolAdminRole, importManagePermission, importViewPermission] =
      await Promise.all([
        prisma.role.findFirst({
          where: { key: 'school_admin', schoolId: null, isSystem: true },
          select: { id: true },
        }),
        prisma.permission.upsert({
          where: { code: 'files.imports.manage' },
          update: {
            module: 'files',
            resource: 'imports',
            action: 'manage',
            description: 'Create file import jobs',
          },
          create: {
            code: 'files.imports.manage',
            module: 'files',
            resource: 'imports',
            action: 'manage',
            description: 'Create file import jobs',
          },
          select: { id: true },
        }),
        prisma.permission.upsert({
          where: { code: 'files.imports.view' },
          update: {
            module: 'files',
            resource: 'imports',
            action: 'view',
            description: 'View import job status and validation reports',
          },
          create: {
            code: 'files.imports.view',
            module: 'files',
            resource: 'imports',
            action: 'view',
            description: 'View import job status and validation reports',
          },
          select: { id: true },
        }),
      ]);

    if (!schoolAdminRole) {
      throw new Error('school_admin system role not found - run `npm run seed` first.');
    }

    await prisma.rolePermission.createMany({
      data: [
        {
          roleId: schoolAdminRole.id,
          permissionId: importManagePermission.id,
        },
        {
          roleId: schoolAdminRole.id,
          permissionId: importViewPermission.id,
        },
      ],
      skipDuplicates: true,
    });

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

    storageService = app.get(StorageService);
    attachmentCountBefore = await prisma.attachment.count();
  });

  afterAll(async () => {
    if (importJobId) {
      await prisma.importJob.deleteMany({ where: { id: importJobId } });
    }

    if (uploadedFileId) {
      await prisma.file.deleteMany({ where: { id: uploadedFileId } });
    }

    if (uploadedBucket && uploadedObjectKey) {
      await storageService.deleteObject({
        bucket: uploadedBucket,
        objectKey: uploadedObjectKey,
      });
    }

    if (app) {
      await app.close();
    }

    if (prisma) {
      await prisma.$disconnect();
    }
  });

  async function login(): Promise<{ accessToken: string }> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email: DEMO_ADMIN_EMAIL, password: DEMO_ADMIN_PASSWORD })
      .expect(200);

    return { accessToken: response.body.accessToken };
  }

  async function waitForImportCompletion(
    accessToken: string,
    jobId: string,
  ): Promise<any> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/files/imports/${jobId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      if (
        response.body.status === ImportJobStatus.COMPLETED ||
        response.body.status === ImportJobStatus.FAILED
      ) {
        return response.body;
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    throw new Error('Timed out waiting for import validation to finish.');
  }

  it('logs in, creates an import job, returns job status, and serves a validation report without creating side-effect links', async () => {
    const { accessToken } = await login();

    const createResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/files/imports`)
      .set('Authorization', `Bearer ${accessToken}`)
      .field('type', 'students_basic')
      .attach('file', Buffer.from('student_id,name\nSTD-1,Alice\nSTD-2,Bob\n'), {
        filename: 'students-basic.csv',
        contentType: 'text/csv',
      })
      .expect(201);

    importJobId = createResponse.body.id;

    expect(createResponse.body).toEqual({
      id: expect.any(String),
      uploadedFileId: expect.any(String),
      type: 'students_basic',
      status: ImportJobStatus.PENDING,
      reportAvailable: true,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    uploadedFileId = createResponse.body.uploadedFileId;

    const persistedFile = await prisma.file.findUnique({
      where: { id: uploadedFileId },
      select: {
        id: true,
        bucket: true,
        objectKey: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
      },
    });

    uploadedBucket = persistedFile?.bucket ?? null;
    uploadedObjectKey = persistedFile?.objectKey ?? null;

    expect(persistedFile).toEqual({
      id: uploadedFileId,
      bucket: expect.any(String),
      objectKey: expect.any(String),
      originalName: 'students-basic.csv',
      mimeType: 'text/csv',
      sizeBytes: BigInt(
        Buffer.byteLength('student_id,name\nSTD-1,Alice\nSTD-2,Bob\n'),
      ),
    });

    const persistedImportJobBeforePolling = await prisma.importJob.findUnique({
      where: { id: importJobId },
      select: {
        id: true,
        uploadedFileId: true,
        type: true,
        status: true,
        reportJson: true,
      },
    });

    expect(persistedImportJobBeforePolling).toEqual({
      id: importJobId,
      uploadedFileId,
      type: 'students_basic',
      status: ImportJobStatus.PENDING,
      reportJson: expect.any(Object),
    });

    const completedStatus = await waitForImportCompletion(accessToken, importJobId);
    expect(completedStatus).toEqual({
      id: importJobId,
      uploadedFileId,
      type: 'students_basic',
      status: ImportJobStatus.COMPLETED,
      reportAvailable: true,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    const persistedImportJobAfterPolling = await prisma.importJob.findUnique({
      where: { id: importJobId },
      select: {
        id: true,
        uploadedFileId: true,
        type: true,
        status: true,
        reportJson: true,
      },
    });

    expect(persistedImportJobAfterPolling).toEqual({
      id: importJobId,
      uploadedFileId,
      type: 'students_basic',
      status: ImportJobStatus.COMPLETED,
      reportJson: expect.objectContaining({
        status: ImportJobStatus.COMPLETED,
      }),
    });

    const reportResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/files/imports/${importJobId}/report`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(reportResponse.body).toEqual({
      status: ImportJobStatus.COMPLETED,
      summary: {
        rowCount: null,
        warningCount: 1,
        errorCount: 0,
      },
      file: {
        uploadedFileId,
        originalName: 'students-basic.csv',
        mimeType: 'text/csv',
        sizeBytes: String(
          Buffer.byteLength('student_id,name\nSTD-1,Alice\nSTD-2,Bob\n'),
        ),
      },
      rowCount: null,
      warnings: ['Stub validation only. No domain rows were created.'],
      errors: [],
      updatedAt: expect.any(String),
    });

    const attachmentCountAfter = await prisma.attachment.count();
    expect(attachmentCountAfter).toBe(attachmentCountBefore);
  });
});
