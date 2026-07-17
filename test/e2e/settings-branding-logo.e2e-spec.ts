import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  FileVisibility,
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  SchoolStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { StorageService } from '../../src/infrastructure/storage/storage.service';

const GLOBAL_PREFIX = '/api/v1';
const SCHOOL_ID_PATTERN = /^[0-9a-f-]{36}$/i;
const TEST_EMAIL = 'branding-logo-1x@moazez.local';
const TEST_PASSWORD = 'BrandingLogo1x!';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==',
  'base64',
);

jest.setTimeout(60_000);

describe('Settings managed school branding logo (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let storage: StorageService;
  let organizationId: string;
  let schoolId: string;
  let userId: string;
  let roleId: string;
  let accessToken: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const permission = await prisma.permission.findUnique({
      where: { code: 'settings.branding.manage' },
      select: { id: true },
    });
    if (!permission) throw new Error('settings.branding.manage seed missing');

    const organization = await prisma.organization.create({
      data: {
        name: 'Branding Logo 1X Organization',
        slug: `branding-logo-1x-${Date.now()}`,
      },
    });
    organizationId = organization.id;
    const school = await prisma.school.create({
      data: {
        organizationId,
        name: 'Branding Logo 1X School',
        slug: `branding-logo-school-${Date.now()}`,
      },
    });
    schoolId = school.id;
    const role = await prisma.role.create({
      data: {
        schoolId,
        key: 'branding_logo_manager',
        name: 'Branding Logo Manager',
        rolePermissions: { create: { permissionId: permission.id } },
      },
    });
    roleId = role.id;
    const user = await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        firstName: 'Branding',
        lastName: 'Manager',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        passwordHash: await argon2.hash(TEST_PASSWORD),
      },
    });
    userId = user.id;
    await prisma.membership.create({
      data: {
        userId,
        organizationId,
        schoolId,
        roleId,
        userType: UserType.SCHOOL_USER,
        status: MembershipStatus.ACTIVE,
      },
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
    storage = app.get(StorageService);

    const login = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD })
      .expect(200);
    accessToken = login.body.accessToken as string;
  });

  afterAll(async () => {
    if (prisma && schoolId) {
      const files = await prisma.file.findMany({
        where: { schoolId },
        select: { bucket: true, objectKey: true },
      });
      for (const file of files) {
        await storage
          ?.deleteObject({ bucket: file.bucket, objectKey: file.objectKey })
          .catch(() => undefined);
      }
      await prisma.schoolProfile.deleteMany({ where: { schoolId } });
      await prisma.file.deleteMany({ where: { schoolId } });
      await prisma.membership.deleteMany({ where: { schoolId } });
      await prisma.rolePermission.deleteMany({ where: { roleId } });
      await prisma.role.deleteMany({ where: { id: roleId } });
      await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.school.deleteMany({ where: { id: schoolId } });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    }
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
  });

  it('requires authentication and rejects legacy/client ownership overrides', async () => {
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/settings/branding/logo`)
      .attach('file', PNG, { filename: 'logo.png', contentType: 'image/png' })
      .expect(401);

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/settings/branding`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ logoUrl: 'https://untrusted.example/logo.png' })
      .expect(400);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/settings/branding/logo`)
      .set('Authorization', `Bearer ${accessToken}`)
      .field('schoolId', schoolId)
      .attach('file', PNG, { filename: 'logo.png', contentType: 'image/png' })
      .expect(400);
  });

  it('maps a transport-level multipart payload above 5 MiB to the stable size envelope', async () => {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/settings/branding/logo`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', Buffer.alloc(5 * 1024 * 1024 + 1), {
        filename: 'oversized.png',
        contentType: 'image/png',
      })
      .expect(413);

    expect(response.body).toEqual({
      error: {
        code: 'settings.branding.logo.size_exceeded',
        message: 'The school logo exceeds the maximum allowed size',
        details: { maxSizeBytes: 5 * 1024 * 1024 },
        traceId: expect.any(String),
      },
    });
  });

  it('serializes concurrent upload and delete lifecycle requests', async () => {
    const uploads = await Promise.all([
      request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/settings/branding/logo`)
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', PNG, {
          filename: 'concurrent-a.png',
          contentType: 'image/png',
        }),
      request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/settings/branding/logo`)
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', JPEG, {
          filename: 'concurrent-b.jpg',
          contentType: 'image/jpeg',
        }),
    ]);
    expect(uploads.map((response) => response.status)).toEqual([200, 200]);

    let profile = await prisma.schoolProfile.findUniqueOrThrow({
      where: { schoolId },
      select: { logoFileId: true },
    });
    let activeFiles = await prisma.file.findMany({
      where: {
        schoolId,
        deletedAt: null,
        objectKey: { contains: '/branding/logos/' },
      },
      select: { id: true },
    });
    expect(activeFiles).toEqual([{ id: profile.logoFileId }]);

    const race = await Promise.all([
      request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/settings/branding/logo`)
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', PNG, {
          filename: 'upload-delete-race.png',
          contentType: 'image/png',
        }),
      request(app.getHttpServer())
        .delete(`${GLOBAL_PREFIX}/settings/branding/logo`)
        .set('Authorization', `Bearer ${accessToken}`),
    ]);
    expect(race.map((response) => response.status).sort()).toEqual([200, 204]);

    profile = await prisma.schoolProfile.findUniqueOrThrow({
      where: { schoolId },
      select: { logoFileId: true },
    });
    activeFiles = await prisma.file.findMany({
      where: {
        schoolId,
        deletedAt: null,
        objectKey: { contains: '/branding/logos/' },
      },
      select: { id: true },
    });
    expect(activeFiles).toHaveLength(profile.logoFileId ? 1 : 0);
    expect(activeFiles.every((file) => file.id === profile.logoFileId)).toBe(
      true,
    );

    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/settings/branding/logo`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);
  });

  it('uploads, streams, replaces, validates organization consistency, and deletes idempotently', async () => {
    const uploaded = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/settings/branding/logo`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', PNG, { filename: 'logo.png', contentType: 'image/png' })
      .expect(200);

    expect(uploaded.body.logoUrl).toEqual(expect.any(String));
    const managedUrl = new URL(uploaded.body.logoUrl as string);
    expect(managedUrl.pathname).toBe(
      `${GLOBAL_PREFIX}/public/schools/${schoolId}/branding/logo`,
    );
    expect(managedUrl.searchParams.get('v')).toEqual(expect.any(String));
    expect(JSON.stringify(uploaded.body)).not.toMatch(
      /fileId|bucket|objectKey|checksum|organizationId|uploaderId/,
    );

    const firstProfile = await prisma.schoolProfile.findUniqueOrThrow({
      where: { schoolId },
      select: { logoFileId: true, logoFile: true },
    });
    expect(firstProfile.logoFile).toMatchObject({
      schoolId,
      organizationId,
      visibility: FileVisibility.PRIVATE,
      mimeType: 'image/png',
    });

    const publicPng = await request(app.getHttpServer())
      .get(managedUrl.pathname + managedUrl.search)
      .expect(200)
      .expect('Content-Type', /image\/png/)
      .expect(
        'Cache-Control',
        'public, max-age=300, stale-while-revalidate=60',
      );
    expect(Buffer.from(publicPng.body)).toEqual(PNG);
    expect(publicPng.headers).not.toHaveProperty('content-disposition');

    await prisma.file.update({
      where: { id: firstProfile.logoFileId! },
      data: { organizationId: null },
    });
    await request(app.getHttpServer()).get(managedUrl.pathname).expect(404);
    await prisma.file.update({
      where: { id: firstProfile.logoFileId! },
      data: { organizationId },
    });

    await prisma.school.update({
      where: { id: schoolId },
      data: { status: SchoolStatus.SUSPENDED },
    });
    await request(app.getHttpServer()).get(managedUrl.pathname).expect(404);
    await prisma.school.update({
      where: { id: schoolId },
      data: { status: SchoolStatus.ACTIVE },
    });
    await prisma.school.update({
      where: { id: schoolId },
      data: { deletedAt: new Date() },
    });
    await request(app.getHttpServer()).get(managedUrl.pathname).expect(404);
    await prisma.school.update({
      where: { id: schoolId },
      data: { deletedAt: null },
    });
    await prisma.organization.update({
      where: { id: organizationId },
      data: { status: OrganizationStatus.SUSPENDED },
    });
    await request(app.getHttpServer()).get(managedUrl.pathname).expect(404);
    await prisma.organization.update({
      where: { id: organizationId },
      data: { status: OrganizationStatus.ACTIVE },
    });
    await prisma.organization.update({
      where: { id: organizationId },
      data: { deletedAt: new Date() },
    });
    await request(app.getHttpServer()).get(managedUrl.pathname).expect(404);
    await prisma.organization.update({
      where: { id: organizationId },
      data: { deletedAt: null },
    });

    await prisma.file.update({
      where: { id: firstProfile.logoFileId! },
      data: { visibility: FileVisibility.PUBLIC },
    });
    await request(app.getHttpServer()).get(managedUrl.pathname).expect(404);
    await prisma.file.update({
      where: { id: firstProfile.logoFileId! },
      data: { visibility: FileVisibility.PRIVATE, deletedAt: new Date() },
    });
    await request(app.getHttpServer()).get(managedUrl.pathname).expect(404);
    await prisma.file.update({
      where: { id: firstProfile.logoFileId! },
      data: { deletedAt: null },
    });
    await storage.deleteObject({
      bucket: firstProfile.logoFile!.bucket,
      objectKey: firstProfile.logoFile!.objectKey,
    });
    await request(app.getHttpServer()).get(managedUrl.pathname).expect(404);

    const replaced = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/settings/branding/logo`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', JPEG, { filename: 'logo.jpg', contentType: 'image/jpeg' })
      .expect(200);
    expect(replaced.body.logoUrl).not.toBe(uploaded.body.logoUrl);
    const oldFile = await prisma.file.findUniqueOrThrow({
      where: { id: firstProfile.logoFileId! },
      select: { deletedAt: true },
    });
    expect(oldFile.deletedAt).toBeInstanceOf(Date);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/settings/branding/logo`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', PNG, {
        filename: 'mismatch.jpg',
        contentType: 'image/jpeg',
      })
      .expect(400);

    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/settings/branding/logo`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);
    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/settings/branding/logo`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);
    await request(app.getHttpServer()).get(managedUrl.pathname).expect(404);

    const deletedProfile = await prisma.schoolProfile.findUniqueOrThrow({
      where: { schoolId },
      select: { logoFileId: true, logoUrl: true },
    });
    expect(deletedProfile).toEqual({ logoFileId: null, logoUrl: null });
    const audits = await prisma.auditLog.findMany({
      where: {
        schoolId,
        action: {
          in: [
            'branding.logo.upload',
            'branding.logo.replace',
            'branding.logo.delete',
          ],
        },
      },
      select: {
        action: true,
        resourceType: true,
        resourceId: true,
        outcome: true,
        after: true,
      },
    });
    const auditActions = audits.map((entry) => entry.action);
    expect(auditActions).toEqual(
      expect.arrayContaining([
        'branding.logo.upload',
        'branding.logo.replace',
        'branding.logo.delete',
      ]),
    );
    expect(audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'branding.logo.upload',
          resourceType: 'school_branding_logo',
          resourceId: expect.any(String),
          outcome: 'SUCCESS',
          after: expect.objectContaining({
            changed: true,
            detectedMime: expect.stringMatching(/^image\/(png|jpeg)$/),
            byteSize: expect.any(Number),
            priorManagedValueExisted: expect.any(Boolean),
            priorLegacyValueExisted: expect.any(Boolean),
            replacement: expect.any(Boolean),
          }),
        }),
      ]),
    );
    expect(JSON.stringify(audits)).not.toMatch(
      /bucket|objectKey|checksum|signedUrl|credentials|logoFileId/,
    );
    expect(schoolId).toMatch(SCHOOL_ID_PATTERN);
  });
});
