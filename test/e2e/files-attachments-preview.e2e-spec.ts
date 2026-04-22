import { randomUUID } from 'node:crypto';
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
const ATTACHMENT_RESOURCE_TYPE = 'admissions.application';

jest.setTimeout(30000);

describe('Files attachments preview flow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let storageService: StorageService;
  let uploadedFileId: string | null = null;
  let uploadedBucket: string | null = null;
  let uploadedObjectKey: string | null = null;
  let attachmentId: string | null = null;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

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
    if (attachmentId) {
      await prisma.attachment.deleteMany({ where: { id: attachmentId } });
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

  it('logs in, uploads a file, links it to an admissions application preview target, lists it, deletes the link, and keeps the file downloadable', async () => {
    const { accessToken } = await login();
    const resourceId = randomUUID();

    const uploadResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/files`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', Buffer.from('phase 3 attachments preview body'), {
        filename: 'phase-3-preview.txt',
        contentType: 'text/plain',
      })
      .expect(201);

    uploadedFileId = uploadResponse.body.id;

    const persistedFile = await prisma.file.findUnique({
      where: { id: uploadedFileId },
      select: {
        bucket: true,
        objectKey: true,
      },
    });

    uploadedBucket = persistedFile?.bucket ?? null;
    uploadedObjectKey = persistedFile?.objectKey ?? null;

    const linkResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/files/attachments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fileId: uploadedFileId,
        resourceType: ATTACHMENT_RESOURCE_TYPE,
        resourceId,
      })
      .expect(201);

    attachmentId = linkResponse.body.id;

    expect(linkResponse.body).toEqual({
      id: expect.any(String),
      fileId: uploadedFileId,
      resourceType: ATTACHMENT_RESOURCE_TYPE,
      resourceId,
      createdAt: expect.any(String),
      file: {
        id: uploadedFileId,
        originalName: 'phase-3-preview.txt',
        mimeType: 'text/plain',
        sizeBytes: String(Buffer.byteLength('phase 3 attachments preview body')),
        visibility: 'PRIVATE',
      },
    });

    const listResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/files/attachments?resourceType=${ATTACHMENT_RESOURCE_TYPE}&resourceId=${resourceId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(listResponse.body).toEqual([
      {
        id: attachmentId,
        fileId: uploadedFileId,
        resourceType: ATTACHMENT_RESOURCE_TYPE,
        resourceId,
        createdAt: expect.any(String),
        file: {
          id: uploadedFileId,
          originalName: 'phase-3-preview.txt',
          mimeType: 'text/plain',
          sizeBytes: String(
            Buffer.byteLength('phase 3 attachments preview body'),
          ),
          visibility: 'PRIVATE',
        },
      },
    ]);

    const deleteResponse = await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/files/attachments/${attachmentId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(deleteResponse.body).toEqual({ ok: true });

    const persistedFileAfterDelete = await prisma.file.findUnique({
      where: { id: uploadedFileId },
      select: {
        id: true,
      },
    });

    expect(persistedFileAfterDelete).toEqual({ id: uploadedFileId });

    const deletedAttachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
      select: { id: true },
    });

    expect(deletedAttachment).toBeNull();

    const downloadResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/files/${uploadedFileId}/download`)
      .set('Authorization', `Bearer ${accessToken}`)
      .redirects(0)
      .expect(307);

    expect(downloadResponse.headers.location).toContain('X-Amz-Expires=');

    const signedDownloadResponse = await fetch(downloadResponse.headers.location);
    expect(signedDownloadResponse.status).toBe(200);
    await expect(signedDownloadResponse.text()).resolves.toBe(
      'phase 3 attachments preview body',
    );
  });
});
