import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  AcademicContentAudienceType,
  AcademicContentStatus,
  AcademicContentTargetScopeType,
  AcademicContentType,
  FileUploadSessionStatus,
  UserType,
} from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../src/common/context/request-context';
import { REQUIRED_PERMISSIONS_METADATA } from '../../src/common/decorators/required-permissions.decorator';
import { SCHOOL_MANAGEMENT_ONLY_METADATA } from '../../src/common/decorators/school-management-only.decorator';
import { GlobalExceptionFilter } from '../../src/common/exceptions/global-exception.filter';
import { NotFoundDomainException } from '../../src/common/exceptions/domain-exception';
import { PermissionsGuard } from '../../src/common/guards/permissions.guard';
import {
  GetAcademicContentForManagementUseCase,
  ListAcademicContentForManagementUseCase,
} from '../../src/modules/academics/academic-content/application/academic-content-management-read.use-cases';
import { AcademicContentLifecycleUseCases } from '../../src/modules/academics/academic-content/application/academic-content-lifecycle.use-cases';
import { CreateAcademicContentUseCase } from '../../src/modules/academics/academic-content/application/create-academic-content.use-case';
import { ReplaceAcademicContentTargetsUseCase } from '../../src/modules/academics/academic-content/application/replace-academic-content-targets.use-case';
import {
  ReplaceAcademicContentLinksUseCase,
  ReplaceAcademicContentTagsUseCase,
} from '../../src/modules/academics/academic-content/application/replace-academic-content-links-tags.use-cases';
import {
  GetAcademicContentRevisionUseCase,
  ListAcademicContentRevisionsUseCase,
} from '../../src/modules/academics/academic-content/application/academic-content-revision.use-cases';
import { AcademicContentController } from '../../src/modules/academics/academic-content/controller/academic-content.controller';
import { AcademicContentFilePolicyController } from '../../src/modules/academics/academic-content/controller/academic-content-file-policy.controller';
import {
  GetAcademicContentFilePolicyUseCase,
  UpdateAcademicContentFilePolicyUseCase,
} from '../../src/modules/academics/academic-content/files/application/academic-content-file-policy.use-cases';
import {
  CancelAcademicContentUploadUseCase,
  CompleteAcademicContentUploadUseCase,
  CreateAcademicContentUploadUseCase,
  UnlinkAcademicContentAssetUseCase,
} from '../../src/modules/academics/academic-content/files/application/academic-content-upload.use-cases';

const base = '/api/v1/academics/academic-content';
const schoolId = randomUUID();
const organizationId = randomUUID();
const actorId = randomUUID();
const contentId = randomUUID();
const uploadId = randomUUID();
const assetId = randomUUID();
const fileId = randomUUID();
const revisionId = randomUUID();
const now = new Date('2030-09-15T12:00:00.000Z');
const secret = 'https://provider.example/upload?secret=capability';
const permissions = [
  'academics.academic_content.view',
  'academics.academic_content.manage',
  'academics.academic_content.settings.manage',
];
const content = {
  id: contentId,
  schoolId,
  academicYearId: randomUUID(),
  termId: randomUUID(),
  type: AcademicContentType.GENERAL_RESOURCE,
  audience: AcademicContentAudienceType.STUDENTS,
  title: 'Resource',
  description: null,
  status: AcademicContentStatus.DRAFT,
  archivedAt: null,
  createdAt: now,
  updatedAt: now,
  createdByUserId: actorId,
  updatedByUserId: null,
  deletedAt: null,
};
const target = {
  id: randomUUID(),
  scopeType: AcademicContentTargetScopeType.SCHOOL,
  stageId: null,
  gradeId: null,
  sectionId: null,
  classroomId: null,
  subjectId: null,
  teacherSubjectAllocationId: null,
  identityFingerprint: 'internal-fingerprint',
  createdByUserId: actorId,
};
const file = {
  id: fileId,
  originalName: 'lesson.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 123n,
  bucket: 'internal-bucket',
  objectKey: 'internal-object-key',
};
const policy = {
  attachmentsEnabled: true,
  maximumFileSizeBytes: 536870912n,
  documentsEnabled: true,
  imagesEnabled: true,
  videosEnabled: true,
  audioEnabled: true,
  archivesEnabled: false,
  otherFilesEnabled: false,
  allowStudentDownload: true,
  allowGuardianDownload: true,
  allowInlinePreview: true,
};
const link = {
  id: randomUUID(),
  label: 'Reference',
  url: 'https://example.test/ref',
  sortOrder: 0,
};
const tag = {
  id: randomUUID(),
  displayValue: 'Algebra',
  normalizedValue: 'algebra',
  sortOrder: 0,
};
const revision = {
  id: revisionId,
  schoolId,
  academicContentId: contentId,
  revisionNumber: 1,
  snapshotContractVersion: 1,
  academicYearId: content.academicYearId,
  termId: content.termId,
  type: content.type,
  audience: content.audience,
  title: content.title,
  description: null,
  sourceStatus: AcademicContentStatus.DRAFT,
  capturedByUserId: actorId,
  capturedAt: now,
  createdAt: now,
  targets: [target],
  assets: [{ id: randomUUID(), fileId, sortOrder: 0, file }],
  links: [link],
  tags: [tag],
};

const services = {
  create: { execute: jest.fn() },
  list: { execute: jest.fn() },
  detail: { execute: jest.fn() },
  lifecycle: {
    update: jest.fn(),
    archive: jest.fn(),
    restore: jest.fn(),
    delete: jest.fn(),
  },
  targets: { execute: jest.fn() },
  links: { execute: jest.fn() },
  tags: { execute: jest.fn() },
  revisionList: { execute: jest.fn() },
  revisionDetail: { execute: jest.fn() },
  uploadIntent: { execute: jest.fn() },
  uploadComplete: { execute: jest.fn() },
  uploadCancel: { execute: jest.fn() },
  assetUnlink: { execute: jest.fn() },
  getPolicy: { execute: jest.fn() },
  updatePolicy: { execute: jest.fn() },
};

describe('ACC-4B management HTTP security and transport', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [
        AcademicContentFilePolicyController,
        AcademicContentController,
      ],
      providers: [
        { provide: APP_GUARD, useClass: PermissionsGuard },
        { provide: CreateAcademicContentUseCase, useValue: services.create },
        {
          provide: ListAcademicContentForManagementUseCase,
          useValue: services.list,
        },
        {
          provide: GetAcademicContentForManagementUseCase,
          useValue: services.detail,
        },
        {
          provide: AcademicContentLifecycleUseCases,
          useValue: services.lifecycle,
        },
        {
          provide: ReplaceAcademicContentTargetsUseCase,
          useValue: services.targets,
        },
        {
          provide: ReplaceAcademicContentLinksUseCase,
          useValue: services.links,
        },
        { provide: ReplaceAcademicContentTagsUseCase, useValue: services.tags },
        {
          provide: ListAcademicContentRevisionsUseCase,
          useValue: services.revisionList,
        },
        {
          provide: GetAcademicContentRevisionUseCase,
          useValue: services.revisionDetail,
        },
        {
          provide: CreateAcademicContentUploadUseCase,
          useValue: services.uploadIntent,
        },
        {
          provide: CompleteAcademicContentUploadUseCase,
          useValue: services.uploadComplete,
        },
        {
          provide: CancelAcademicContentUploadUseCase,
          useValue: services.uploadCancel,
        },
        {
          provide: UnlinkAcademicContentAssetUseCase,
          useValue: services.assetUnlink,
        },
        {
          provide: GetAcademicContentFilePolicyUseCase,
          useValue: services.getPolicy,
        },
        {
          provide: UpdateAcademicContentFilePolicyUseCase,
          useValue: services.updatePolicy,
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(
      (
        req: { headers: Record<string, string> },
        _res: unknown,
        next: () => void,
      ) => {
        const label = req.headers['x-test-actor'] ?? 'school';
        const context = createRequestContext();
        context.actor = {
          id: actorId,
          userType:
            label === 'organization'
              ? UserType.ORGANIZATION_USER
              : label === 'teacher'
                ? UserType.TEACHER
                : label === 'student'
                  ? UserType.STUDENT
                  : label === 'parent'
                    ? UserType.PARENT
                    : label === 'applicant'
                      ? UserType.APPLICANT
                      : UserType.SCHOOL_USER,
        };
        context.activeMembership = {
          membershipId: randomUUID(),
          schoolId,
          organizationId,
          roleId: randomUUID(),
          permissions:
            label === 'missing'
              ? []
              : label === 'viewOnly'
                ? [permissions[0]]
                : label === 'manageOnly'
                  ? [permissions[1]]
                  : label === 'settingsOnly'
                    ? [permissions[2]]
                    : permissions,
        };
        runWithRequestContext(context, next);
      },
    );
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    services.create.execute.mockResolvedValue(content);
    services.list.execute.mockResolvedValue({
      items: [content],
      page: 1,
      limit: 50,
      total: 1,
    });
    services.detail.execute.mockResolvedValue({
      ...content,
      targets: [target],
      assets: [{ id: assetId, fileId, sortOrder: 0, createdAt: now, file }],
      links: [],
      tags: [],
    });
    services.lifecycle.update.mockResolvedValue(content);
    services.lifecycle.archive.mockResolvedValue({
      ...content,
      status: AcademicContentStatus.ARCHIVED,
      archivedAt: now,
    });
    services.lifecycle.restore.mockResolvedValue(content);
    services.lifecycle.delete.mockResolvedValue({ ...content, deletedAt: now });
    services.targets.execute.mockResolvedValue([target]);
    services.links.execute.mockResolvedValue([link]);
    services.tags.execute.mockResolvedValue([tag]);
    services.revisionList.execute.mockResolvedValue({
      items: [revision],
      page: 1,
      limit: 50,
      total: 1,
    });
    services.revisionDetail.execute.mockResolvedValue(revision);
    services.uploadIntent.execute.mockResolvedValue({
      uploadId,
      status: FileUploadSessionStatus.UPLOADING,
      sessionUrl: secret,
      capabilityExpiresAt: now,
      expiresAt: now,
      expectedMimeType: 'application/pdf',
      expectedSizeBytes: 123n,
      uploadMode: 'resumable',
      bucket: 'internal-bucket',
      objectKey: 'internal-object-key',
    });
    services.uploadComplete.execute.mockResolvedValue({
      asset: {
        id: assetId,
        academicContentId: contentId,
        fileId,
        createdAt: now,
        bucket: 'internal-bucket',
      },
      file,
    });
    services.uploadCancel.execute.mockResolvedValue({
      id: uploadId,
      status: FileUploadSessionStatus.CANCELLED,
      cancelledAt: now,
      finalBucket: 'internal-bucket',
      finalObjectKey: 'internal-object-key',
    });
    services.assetUnlink.execute.mockResolvedValue({ id: assetId, file });
    services.getPolicy.execute.mockResolvedValue(policy);
    services.updatePolicy.execute.mockResolvedValue(policy);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('registers exact guarded management routes and permission ownership', () => {
    expect(Reflect.getMetadata(PATH_METADATA, AcademicContentController)).toBe(
      'academics/academic-content',
    );
    expect(
      Reflect.getMetadata(PATH_METADATA, AcademicContentFilePolicyController),
    ).toBe('academics/academic-content/settings');
    for (const controller of [
      AcademicContentController,
      AcademicContentFilePolicyController,
    ]) {
      expect(
        Reflect.getMetadata(SCHOOL_MANAGEMENT_ONLY_METADATA, controller),
      ).toBe(true);
    }
    const route = (
      method: string,
      path: string,
      permission: string,
      controller = AcademicContentController,
    ) => {
      const handler =
        controller.prototype[method as keyof typeof controller.prototype];
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBeDefined();
      expect(
        Reflect.getMetadata(REQUIRED_PERMISSIONS_METADATA, handler),
      ).toEqual([permission]);
    };
    route('create', '/', 'academics.academic_content.manage');
    route('list', '/', 'academics.academic_content.view');
    route('detail', ':contentId', 'academics.academic_content.view');
    route('update', ':contentId', 'academics.academic_content.manage');
    route('delete', ':contentId', 'academics.academic_content.manage');
    route('archive', ':contentId/archive', 'academics.academic_content.manage');
    route('restore', ':contentId/restore', 'academics.academic_content.manage');
    route('targets', ':contentId/targets', 'academics.academic_content.manage');
    route('links', ':contentId/links', 'academics.academic_content.manage');
    route('tags', ':contentId/tags', 'academics.academic_content.manage');
    route(
      'revisions',
      ':contentId/revisions',
      'academics.academic_content.view',
    );
    route(
      'revisionDetail',
      ':contentId/revisions/:revisionId',
      'academics.academic_content.view',
    );
    route(
      'uploadIntent',
      ':contentId/uploads',
      'academics.academic_content.manage',
    );
    route(
      'uploadComplete',
      ':contentId/uploads/:uploadId/complete',
      'academics.academic_content.manage',
    );
    route(
      'uploadCancel',
      ':contentId/uploads/:uploadId/cancel',
      'academics.academic_content.manage',
    );
    route(
      'assetUnlink',
      ':contentId/assets/:assetId',
      'academics.academic_content.manage',
    );
    route(
      'get',
      'file-policy',
      'academics.academic_content.view',
      AcademicContentFilePolicyController,
    );
    route(
      'update',
      'file-policy',
      'academics.academic_content.settings.manage',
      AcademicContentFilePolicyController,
    );
  });

  it('publishes only the ACC-4B Swagger surface and safe DTOs', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    expect(
      Object.keys(document.paths).filter((path) => path.startsWith(base)),
    ).toEqual(
      expect.arrayContaining([
        base,
        `${base}/{contentId}`,
        `${base}/{contentId}/targets`,
        `${base}/{contentId}/links`,
        `${base}/{contentId}/tags`,
        `${base}/{contentId}/revisions`,
        `${base}/{contentId}/revisions/{revisionId}`,
        `${base}/{contentId}/uploads`,
        `${base}/{contentId}/uploads/{uploadId}/complete`,
        `${base}/{contentId}/uploads/{uploadId}/cancel`,
        `${base}/{contentId}/assets/{assetId}`,
        `${base}/settings/file-policy`,
      ]),
    );
    const accPaths = Object.keys(document.paths).filter((path) =>
      path.startsWith(base),
    );
    expect(
      accPaths.some((path) => /publish|approve|multipart/.test(path)),
    ).toBe(false);
    const schemas = JSON.stringify(document.components?.schemas ?? {});
    expect(schemas).not.toMatch(
      /trustedOrigin|bucket|objectKey|finalBucket|cleanup/,
    );
  });

  it('allows School and Organization managers and presents a safe draft', async () => {
    const dto = {
      academicYearId: content.academicYearId,
      termId: content.termId,
      type: content.type,
      audience: content.audience,
      title: ' Resource ',
    };
    const created = await request(app.getHttpServer())
      .post(base)
      .send(dto)
      .expect(201);
    expect(created.body).toMatchObject({
      id: contentId,
      status: 'DRAFT',
      title: 'Resource',
    });
    expect(created.body).not.toHaveProperty('schoolId');
    expect(created.body).not.toHaveProperty('deletedAt');
    expect(services.create.execute).toHaveBeenCalledWith(dto);
    await request(app.getHttpServer())
      .get(base)
      .set('x-test-actor', 'organization')
      .expect(200);
    expect(services.list.execute).toHaveBeenCalled();
  });

  it.each(['status', 'schoolId', 'createdByUserId', 'unknown'])(
    'rejects unowned create field %s',
    async (field) => {
      await request(app.getHttpServer())
        .post(base)
        .send({
          academicYearId: content.academicYearId,
          termId: content.termId,
          type: content.type,
          audience: content.audience,
          title: 'Resource',
          [field]: 'injected',
        })
        .expect(400);
      expect(services.create.execute).not.toHaveBeenCalled();
    },
  );

  it('applies view and management permissions and blocks app actors even when granted permissions', async () => {
    await request(app.getHttpServer())
      .get(base)
      .set('x-test-actor', 'missing')
      .expect(403);
    await request(app.getHttpServer())
      .post(base)
      .set('x-test-actor', 'missing')
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .patch(`${base}/settings/file-policy`)
      .set('x-test-actor', 'missing')
      .send({ imagesEnabled: false })
      .expect(403);
    for (const actor of ['teacher', 'student', 'parent', 'applicant']) {
      await request(app.getHttpServer())
        .get(base)
        .set('x-test-actor', actor)
        .expect(403);
      await request(app.getHttpServer())
        .put(`${base}/${contentId}/targets`)
        .set('x-test-actor', actor)
        .send({ targets: [] })
        .expect(403);
      await request(app.getHttpServer())
        .post(`${base}/${contentId}/uploads`)
        .set('x-test-actor', actor)
        .send({})
        .expect(403);
    }
  });

  it('keeps view, manage, and settings permissions separate at HTTP', async () => {
    await request(app.getHttpServer())
      .get(base)
      .set('x-test-actor', 'viewOnly')
      .expect(200);
    await request(app.getHttpServer())
      .get(`${base}/settings/file-policy`)
      .set('x-test-actor', 'viewOnly')
      .expect(200);
    await request(app.getHttpServer())
      .post(base)
      .set('x-test-actor', 'viewOnly')
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .patch(`${base}/settings/file-policy`)
      .set('x-test-actor', 'viewOnly')
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .get(base)
      .set('x-test-actor', 'manageOnly')
      .expect(403);
    await request(app.getHttpServer())
      .post(base)
      .set('x-test-actor', 'manageOnly')
      .send({
        academicYearId: content.academicYearId,
        termId: content.termId,
        type: content.type,
        audience: content.audience,
        title: content.title,
      })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`${base}/settings/file-policy`)
      .set('x-test-actor', 'manageOnly')
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .patch(`${base}/settings/file-policy`)
      .set('x-test-actor', 'settingsOnly')
      .send({})
      .expect(200);
    await request(app.getHttpServer())
      .get(`${base}/settings/file-policy`)
      .set('x-test-actor', 'settingsOnly')
      .expect(403);
    await request(app.getHttpServer())
      .post(base)
      .set('x-test-actor', 'settingsOnly')
      .send({})
      .expect(403);
  });

  it('lists bounded inventory, gives safe detail, and hides foreign School content', async () => {
    const list = await request(app.getHttpServer())
      .get(`${base}?page=1&limit=100`)
      .expect(200);
    expect(list.body).toMatchObject({ page: 1, limit: 50, total: 1 });
    expect(
      (list.body as { items: Record<string, unknown>[] }).items[0],
    ).not.toHaveProperty('schoolId');
    await request(app.getHttpServer()).get(`${base}?limit=101`).expect(400);
    const detail = await request(app.getHttpServer())
      .get(`${base}/${contentId}`)
      .expect(200);
    const detailBody = detail.body as {
      targets: Record<string, unknown>[];
      assets: Record<string, unknown>[];
    };
    expect(detailBody.targets[0]).not.toHaveProperty('identityFingerprint');
    expect(detailBody.assets[0]).toMatchObject({
      sizeBytes: '123',
      originalName: 'lesson.pdf',
    });
    expect(JSON.stringify(detail.body)).not.toMatch(
      /bucket|objectKey|deletedAt/,
    );
    services.detail.execute.mockRejectedValueOnce(
      new NotFoundDomainException('Academic content not found'),
    );
    await request(app.getHttpServer())
      .get(`${base}/${randomUUID()}`)
      .expect(404);
  });

  it('delegates lifecycle and targets while rejecting immutable and malformed fields', async () => {
    await request(app.getHttpServer())
      .patch(`${base}/${contentId}`)
      .send({ title: 'Changed' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`${base}/${contentId}`)
      .send({ type: content.type })
      .expect(400);
    await request(app.getHttpServer())
      .post(`${base}/${contentId}/archive`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`${base}/${contentId}/restore`)
      .expect(200);
    const deleted = await request(app.getHttpServer())
      .delete(`${base}/${contentId}`)
      .expect(200);
    expect(deleted.body).toEqual({ ok: true });
    const replaced = await request(app.getHttpServer())
      .put(`${base}/${contentId}/targets`)
      .send({ targets: [{ scopeType: 'SCHOOL' }] })
      .expect(200);
    expect(
      (replaced.body as { targets: Record<string, unknown>[] }).targets[0],
    ).not.toHaveProperty('identityFingerprint');
    await request(app.getHttpServer())
      .put(`${base}/${contentId}/targets`)
      .send({ targets: [{ scopeType: 'GRADE', gradeId: 'bad' }] })
      .expect(400);
    await request(app.getHttpServer()).get(`${base}/not-a-uuid`).expect(400);
  });

  it('returns one no-store capability and rejects origin and storage coordinates from body', async () => {
    const dto = {
      clientRequestId: randomUUID(),
      originalName: 'lesson.pdf',
      expectedMimeType: 'application/pdf',
      expectedSizeBytes: '123',
    };
    const intent = await request(app.getHttpServer())
      .post(`${base}/${contentId}/uploads`)
      .send(dto)
      .expect(201);
    expect(intent.headers['cache-control']).toContain('no-store');
    expect(intent.body).toMatchObject({
      uploadId,
      sessionUrl: secret,
      expectedSizeBytes: '123',
    });
    expect(JSON.stringify(intent.body)).not.toMatch(/bucket|objectKey/);
    expect(services.uploadIntent.execute).toHaveBeenCalledWith({
      contentId,
      ...dto,
    });
    for (const field of ['trustedOrigin', 'schoolId', 'bucket', 'objectKey']) {
      await request(app.getHttpServer())
        .post(`${base}/${contentId}/uploads`)
        .send({ ...dto, [field]: 'injected' })
        .expect(400);
    }
    await request(app.getHttpServer())
      .post(`${base}/${contentId}/uploads`)
      .send({ ...dto, expectedSizeBytes: 123 })
      .expect(400);
    expect(services.uploadIntent.execute).toHaveBeenCalledTimes(1);
  });

  it('presents completion, cancellation, and unlink without persistence internals', async () => {
    const completed = await request(app.getHttpServer())
      .post(`${base}/${contentId}/uploads/${uploadId}/complete`)
      .expect(200);
    expect(
      (completed.body as { file: { sizeBytes: string } }).file.sizeBytes,
    ).toBe('123');
    expect(JSON.stringify(completed.body)).not.toMatch(
      /bucket|objectKey|checksum/,
    );
    const cancelled = await request(app.getHttpServer())
      .post(`${base}/${contentId}/uploads/${uploadId}/cancel`)
      .expect(200);
    expect(cancelled.body).toEqual({
      uploadId,
      status: 'CANCELLED',
      cancelledAt: now.toISOString(),
    });
    const unlinked = await request(app.getHttpServer())
      .delete(`${base}/${contentId}/assets/${assetId}`)
      .expect(200);
    expect(unlinked.body).toEqual({ ok: true, assetId });
    expect(services.uploadComplete.execute).toHaveBeenCalledWith({
      contentId,
      uploadId,
    });
    expect(services.uploadCancel.execute).toHaveBeenCalledWith({
      contentId,
      uploadId,
    });
    await request(app.getHttpServer())
      .post(`${base}/${contentId}/uploads/not-a-uuid/complete`)
      .expect(400);
  });

  it('resolves settings/file-policy before dynamic content detail and keeps BigInt safe', async () => {
    const read = await request(app.getHttpServer())
      .get(`${base}/settings/file-policy`)
      .expect(200);
    expect(
      (read.body as { maximumFileSizeBytes: string }).maximumFileSizeBytes,
    ).toBe('536870912');
    expect(services.detail.execute).not.toHaveBeenCalled();
    const changed = await request(app.getHttpServer())
      .patch(`${base}/settings/file-policy`)
      .send({ maximumFileSizeBytes: '10737418240' })
      .expect(200);
    expect(
      (changed.body as { maximumFileSizeBytes: string }).maximumFileSizeBytes,
    ).toBe('536870912');
    expect(services.updatePolicy.execute).toHaveBeenCalledWith({
      maximumFileSizeBytes: '10737418240',
    });
    await request(app.getHttpServer())
      .patch(`${base}/settings/file-policy`)
      .send({ schoolId })
      .expect(400);
    for (const maximumFileSizeBytes of ['0', '-1', '1.5', 'not-decimal', 100]) {
      await request(app.getHttpServer())
        .patch(`${base}/settings/file-policy`)
        .send({ maximumFileSizeBytes })
        .expect(400);
    }
  });

  it('validates ordered link and tag replacement bodies and presents safe values', async () => {
    const links = await request(app.getHttpServer())
      .put(`${base}/${contentId}/links`)
      .send({
        links: [{ label: 'Reference', url: 'https://example.test/ref' }],
      })
      .expect(200);
    expect(links.body).toEqual({ links: [link] });
    expect(services.links.execute).toHaveBeenCalledWith(contentId, [
      { label: 'Reference', url: 'https://example.test/ref' },
    ]);
    const tags = await request(app.getHttpServer())
      .put(`${base}/${contentId}/tags`)
      .send({ tags: [{ value: 'Algebra' }] })
      .expect(200);
    expect(tags.body).toEqual({
      tags: [{ id: tag.id, value: 'Algebra', sortOrder: 0 }],
    });
    for (const [route, body] of [
      [
        'links',
        {
          links: [
            { label: 'Reference', url: 'https://example.test', schoolId },
          ],
        },
      ],
      [
        'links',
        {
          links: [
            { label: 'Reference', url: 'https://example.test', sortOrder: 9 },
          ],
        },
      ],
      ['tags', { tags: [{ value: 'Algebra', normalizedValue: 'algebra' }] }],
      ['tags', { tags: [{ value: 'Algebra', id: randomUUID() }] }],
    ] as const) {
      await request(app.getHttpServer())
        .put(`${base}/${contentId}/${route}`)
        .send(body)
        .expect(400);
    }
    await request(app.getHttpServer())
      .put(`${base}/bad/links`)
      .send({ links: [] })
      .expect(400);
    await request(app.getHttpServer())
      .put(`${base}/bad/tags`)
      .send({ tags: [] })
      .expect(400);
    for (const actor of [
      'viewOnly',
      'teacher',
      'student',
      'parent',
      'applicant',
      'missing',
    ]) {
      await request(app.getHttpServer())
        .put(`${base}/${contentId}/links`)
        .set('x-test-actor', actor)
        .send({ links: [] })
        .expect(403);
      await request(app.getHttpServer())
        .put(`${base}/${contentId}/tags`)
        .set('x-test-actor', actor)
        .send({ tags: [] })
        .expect(403);
    }
  });

  it('exposes read-only revision history with view permission and safe BigInt output', async () => {
    const list = await request(app.getHttpServer())
      .get(`${base}/${contentId}/revisions`)
      .set('x-test-actor', 'viewOnly')
      .expect(200);
    const listBody = list.body as { items: Record<string, unknown>[] };
    expect(listBody.items[0]).toMatchObject({
      revisionNumber: 1,
      snapshotContractVersion: 1,
    });
    const detail = await request(app.getHttpServer())
      .get(`${base}/${contentId}/revisions/${revisionId}`)
      .set('x-test-actor', 'organization')
      .expect(200);
    const detailBody = detail.body as {
      assets: Record<string, unknown>[];
      links: Record<string, unknown>[];
      tags: Record<string, unknown>[];
    };
    expect(detailBody.assets[0]).toMatchObject({
      fileId,
      sizeBytes: '123',
      sortOrder: 0,
    });
    expect(detailBody.links[0]).toMatchObject(link);
    expect(detailBody.tags[0]).toMatchObject({ value: 'Algebra' });
    expect(JSON.stringify(detail.body)).not.toMatch(
      /schoolId|createdByUserId|capturedByUserId|normalizedValue|bucket|objectKey|identityFingerprint/,
    );
    for (const actor of [
      'manageOnly',
      'teacher',
      'student',
      'parent',
      'applicant',
      'missing',
    ]) {
      await request(app.getHttpServer())
        .get(`${base}/${contentId}/revisions`)
        .set('x-test-actor', actor)
        .expect(403);
      await request(app.getHttpServer())
        .get(`${base}/${contentId}/revisions/${revisionId}`)
        .set('x-test-actor', actor)
        .expect(403);
    }
    await request(app.getHttpServer()).get(`${base}/bad/revisions`).expect(400);
    await request(app.getHttpServer())
      .get(`${base}/${contentId}/revisions/bad`)
      .expect(400);
    await request(app.getHttpServer())
      .post(`${base}/${contentId}/revisions`)
      .send({})
      .expect(404);
    await request(app.getHttpServer())
      .patch(`${base}/${contentId}/revisions/${revisionId}`)
      .send({})
      .expect(404);
    await request(app.getHttpServer())
      .delete(`${base}/${contentId}/revisions/${revisionId}`)
      .expect(404);
  });
});
