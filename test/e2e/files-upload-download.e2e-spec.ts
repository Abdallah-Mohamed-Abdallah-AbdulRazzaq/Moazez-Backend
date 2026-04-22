import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { StorageService } from '../../src/infrastructure/storage/storage.service';

const GLOBAL_PREFIX = '/api/v1';

const DEMO_ADMIN_EMAIL = 'admin@academy.moazez.dev';
const DEMO_ADMIN_PASSWORD = 'School123!';

jest.setTimeout(30000);

describe('Files upload/download flow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let storageService: StorageService;
  let uploadedFileId: string | null = null;
  let uploadedBucket: string | null = null;
  let uploadedObjectKey: string | null = null;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [schoolAdminRole, downloadPermission] = await Promise.all([
      prisma.role.findFirst({
        where: { key: 'school_admin', schoolId: null, isSystem: true },
        select: { id: true },
      }),
      prisma.permission.upsert({
        where: { code: 'files.downloads.view' },
        update: {
          module: 'files',
          resource: 'downloads',
          action: 'view',
          description: 'Download private files through the secure files endpoint',
        },
        create: {
          code: 'files.downloads.view',
          module: 'files',
          resource: 'downloads',
          action: 'view',
          description: 'Download private files through the secure files endpoint',
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
          permissionId: downloadPermission.id,
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
  });

  afterAll(async () => {
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

  it('logs in, uploads a file, persists metadata, and downloads it through the secure redirect endpoint', async () => {
    const { accessToken } = await login();

    const uploadResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/files`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', Buffer.from('phase 2 secure file body'), {
        filename: 'phase-2-flow.txt',
        contentType: 'text/plain',
      })
      .expect(201);

    expect(uploadResponse.body).toEqual({
      id: expect.any(String),
      originalName: 'phase-2-flow.txt',
      mimeType: 'text/plain',
      sizeBytes: String(Buffer.byteLength('phase 2 secure file body')),
      visibility: 'PRIVATE',
      createdAt: expect.any(String),
    });

    uploadedFileId = uploadResponse.body.id;

    const persistedFile = await prisma.file.findUnique({
      where: { id: uploadedFileId },
      select: {
        id: true,
        organizationId: true,
        schoolId: true,
        uploaderId: true,
        bucket: true,
        objectKey: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        visibility: true,
      },
    });

    expect(persistedFile).toEqual(
      expect.objectContaining({
        id: uploadedFileId,
        organizationId: expect.any(String),
        schoolId: expect.any(String),
        uploaderId: expect.any(String),
        originalName: 'phase-2-flow.txt',
        mimeType: 'text/plain',
        sizeBytes: BigInt(Buffer.byteLength('phase 2 secure file body')),
        visibility: 'PRIVATE',
      }),
    );

    uploadedBucket = persistedFile?.bucket ?? null;
    uploadedObjectKey = persistedFile?.objectKey ?? null;

    const downloadResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/files/${uploadedFileId}/download`)
      .set('Authorization', `Bearer ${accessToken}`)
      .redirects(0)
      .expect(307);

    expect(downloadResponse.headers.location).toEqual(expect.any(String));
    expect(downloadResponse.headers.location).toContain('X-Amz-Expires=');

    const signedDownloadResponse = await fetch(downloadResponse.headers.location);
    expect(signedDownloadResponse.status).toBe(200);
    await expect(signedDownloadResponse.text()).resolves.toBe(
      'phase 2 secure file body',
    );
  });
});
