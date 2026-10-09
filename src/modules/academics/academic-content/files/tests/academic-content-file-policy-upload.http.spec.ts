import { type Storage } from '@google-cloud/storage';
import { type INestApplication, type InjectionToken } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { AcademicContentStatus, UserType } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { configureHttpApplication } from '../../../../../bootstrap/http-application';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../../../../common/context/request-context';
import { GlobalExceptionFilter } from '../../../../../common/exceptions/global-exception.filter';
import { PermissionsGuard } from '../../../../../common/guards/permissions.guard';
import {
  GcsAdapter,
  type GcsClientFactory,
} from '../../../../../infrastructure/storage/gcs.adapter';
import type { SignedUrlService } from '../../../../../infrastructure/storage/signed-url.service';
import { StorageService } from '../../../../../infrastructure/storage/storage.service';
import type { TeacherAppAccessService } from '../../../../teacher-app/access/teacher-app-access.service';
import { TeacherAcademicContentFilesUseCases } from '../../../../teacher-app/academic-content/application/teacher-academic-content-files.use-cases';
import { TeacherAcademicContentFilesController } from '../../../../teacher-app/academic-content/controller/teacher-academic-content-files.controller';
import { AcademicContentController } from '../../controller/academic-content.controller';
import { AcademicContentFilePolicyController } from '../../controller/academic-content-file-policy.controller';
import { UpdateAcademicContentFilePolicyDto } from '../../dto/academic-content-file-policy.dto';
import {
  GetAcademicContentFilePolicyUseCase,
  UpdateAcademicContentFilePolicyUseCase,
} from '../application/academic-content-file-policy.use-cases';
import type { AcademicContentFilePolicyResolver } from '../application/academic-content-file-policy.resolver';
import { CreateAcademicContentUploadUseCase } from '../application/academic-content-upload.use-cases';
import {
  effectiveAcademicContentFilePolicy,
  type AcademicContentEffectiveFilePolicy,
} from '../domain/academic-content-file-policy';
import type { AcademicContentFileRepository } from '../infrastructure/academic-content-file.repository';

const schoolId = randomUUID();
const organizationId = randomUUID();
const actorId = randomUUID();
const contentId = randomUUID();
const approved = 'https://schools.example.test';
const applicationOnly = 'https://application-only.example.test';
const storageOnly = 'https://storage-only.example.test';
const policyPath = '/api/v1/academics/academic-content/settings/file-policy';
const uploadPaths = [
  `/api/v1/academics/academic-content/${contentId}/uploads`,
  `/api/v1/teacher/academic-content/${contentId}/uploads`,
];

describe('Academic Content partial policy and browser upload HTTP boundary', () => {
  let app: INestApplication<App>;
  let effective: AcademicContentEffectiveFilePolicy;
  let permissions: string[];
  let resumable: boolean;
  const environmentKeys = [
    'NODE_ENV',
    'APP_CORS_ORIGINS',
    'STORAGE_CORS_ORIGINS',
  ] as const;
  const originalEnvironment: Partial<
    Record<(typeof environmentKeys)[number], string>
  > = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
  const createResumableUpload = jest
    .fn<Promise<[string]>, [Record<string, unknown>]>()
    .mockResolvedValue(['https://storage.invalid/session-capability']);
  const updatePolicy = jest.fn(
    (input: { changes: Partial<AcademicContentEffectiveFilePolicy> }) => {
      effective = { ...effective, ...input.changes };
      return Promise.resolve(effective);
    },
  );
  const createOrFindRequest = jest.fn(
    (
      data: Parameters<AcademicContentFileRepository['createOrFindRequest']>[0],
    ) =>
      Promise.resolve({
        created: true,
        session: { ...data, status: 'CREATED' },
      }),
  );
  const repository = {
    updatePolicy,
    findContent: jest.fn(() =>
      Promise.resolve({
        id: contentId,
        status: AcademicContentStatus.DRAFT,
        term: {
          isActive: true,
          startDate: new Date(0),
          endDate: new Date('2099-12-31'),
        },
      }),
    ),
    createOrFindRequest,
    persistCapabilityExpiry: jest.fn(() => Promise.resolve(true)),
    markCapabilityFailed: jest.fn(() => Promise.resolve()),
    fenceIssuedCapability: jest.fn(() => Promise.resolve()),
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.APP_CORS_ORIGINS = `${approved},${applicationOnly}`;
    process.env.STORAGE_CORS_ORIGINS = `${approved},${storageOnly}`;
    const sdk = {
      bucket: jest.fn(() => ({
        file: jest.fn(() => ({ createResumableUpload })),
      })),
    };
    const factory: GcsClientFactory = {
      createRuntimeClient: () => sdk as unknown as Storage,
      createReadinessClient: () => sdk as unknown as Storage,
      createSigningClient: () => {
        throw new Error('Signing must not be invoked');
      },
    };
    const adapter = new GcsAdapter(
      new ConfigService({ GCP_PROJECT_ID: 'isolated-contract-fixture' }),
      factory,
    );
    const storage = new StorageService(adapter, {
      resolveBucket: () => 'private-fixture',
    } as unknown as SignedUrlService);
    const capabilities = jest.spyOn(storage, 'getCapabilities');
    capabilities.mockImplementation(() => ({
      resumableUpload: resumable,
      rangeRead: true,
    }));
    const policy = {
      resolve: () => Promise.resolve(effective),
      categoryEnabled: () => true,
    } as unknown as AcademicContentFilePolicyResolver;
    const create = new CreateAcademicContentUploadUseCase(
      repository as never,
      policy,
      storage,
    );
    const teacherAccess = {
      assertCurrentTeacher: () => ({
        schoolId,
        organizationId,
        teacherUserId: actorId,
        permissions,
      }),
    } as unknown as TeacherAppAccessService;
    const teacherFiles = new TeacherAcademicContentFilesUseCases(
      teacherAccess,
      create,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const dependencies = Reflect.getMetadata(
      'design:paramtypes',
      AcademicContentController,
    ) as InjectionToken[];
    const module = await Test.createTestingModule({
      controllers: [
        AcademicContentController,
        AcademicContentFilePolicyController,
        TeacherAcademicContentFilesController,
      ],
      providers: [
        ...dependencies.map((token) => ({
          provide: token,
          useValue: token === CreateAcademicContentUploadUseCase ? create : {},
        })),
        {
          provide: TeacherAcademicContentFilesUseCases,
          useValue: teacherFiles,
        },
        {
          provide: UpdateAcademicContentFilePolicyUseCase,
          useValue: new UpdateAcademicContentFilePolicyUseCase(
            repository as never,
          ),
        },
        {
          provide: GetAcademicContentFilePolicyUseCase,
          useValue: new GetAcademicContentFilePolicyUseCase(policy),
        },
      ],
    }).compile();
    app = module.createNestApplication<INestApplication<App>>();
    app.use((req: Request, _res: unknown, next: () => void) => {
      const context = createRequestContext();
      context.actor = {
        id: actorId,
        userType: req.url.startsWith('/api/v1/teacher/')
          ? UserType.TEACHER
          : UserType.SCHOOL_USER,
      };
      context.activeMembership = {
        membershipId: randomUUID(),
        schoolId,
        organizationId,
        roleId: randomUUID(),
        permissions,
      };
      runWithRequestContext(context, next);
    });
    configureHttpApplication(app, {
      environment: 'test',
      corsOrigins: process.env.APP_CORS_ORIGINS,
      swaggerEnabled: false,
    });
    app.useGlobalGuards(new PermissionsGuard(new Reflector()));
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    effective = effectiveAcademicContentFilePolicy({
      imagesEnabled: false,
      allowGuardianDownload: false,
    });
    permissions = [
      'academics.academic_content.view',
      'academics.academic_content.manage',
      'academics.academic_content.settings.manage',
    ];
    resumable = true;
  });
  afterAll(async () => {
    await app.close();
    for (const key of environmentKeys) {
      if (originalEnvironment[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnvironment[key];
    }
  });

  it('records the actual transformed DTO absent fields as own undefined properties', () => {
    const transformed = plainToInstance(UpdateAcademicContentFilePolicyDto, {
      archivesEnabled: true,
      otherFilesEnabled: true,
    });
    expect(Object.keys(transformed)).toContain('documentsEnabled');
    expect(transformed.documentsEnabled).toBeUndefined();
    expect(transformed.archivesEnabled).toBe(true);
  });

  it.each([
    { archivesEnabled: true },
    { documentsEnabled: false },
    { archivesEnabled: true, otherFilesEnabled: true },
    { imagesEnabled: true, allowGuardianDownload: true },
  ])(
    'PATCH accepts supplied flags %j and preserves every omitted setting',
    async (patch) => {
      const before = { ...effective };
      const response = await request(app.getHttpServer())
        .patch(policyPath)
        .send(patch)
        .expect(200);
      expect(response.body as unknown).toEqual({
        ...before,
        ...patch,
        maximumFileSizeBytes: String(before.maximumFileSizeBytes),
      });
      expect(updatePolicy).toHaveBeenCalledWith({
        schoolId,
        organizationId,
        actorId,
        changes: patch,
      });
    },
  );

  it('accepts an empty PATCH and repeated identical PATCH without changing omitted state', async () => {
    const before = { ...effective };
    await request(app.getHttpServer()).patch(policyPath).send({}).expect(200);
    await request(app.getHttpServer())
      .patch(policyPath)
      .send({ archivesEnabled: true })
      .expect(200);
    const same = await request(app.getHttpServer())
      .patch(policyPath)
      .send({ archivesEnabled: true })
      .expect(200);
    const get = await request(app.getHttpServer()).get(policyPath).expect(200);
    expect(same.body as unknown).toEqual(get.body as unknown);
    expect(effective).toEqual({ ...before, archivesEnabled: true });
    expect(updatePolicy).toHaveBeenNthCalledWith(1, {
      schoolId,
      organizationId,
      actorId,
      changes: {},
    });
  });

  it.each(['1', '10737418240'])(
    'accepts maximum size boundary %s as a partial PATCH',
    async (size) => {
      const before = { ...effective };
      const response = await request(app.getHttpServer())
        .patch(policyPath)
        .send({ maximumFileSizeBytes: size })
        .expect(200);
      expect(response.body as unknown).toEqual({
        ...before,
        maximumFileSizeBytes: size,
      });
      expect(updatePolicy).toHaveBeenCalledWith({
        schoolId,
        organizationId,
        actorId,
        changes: { maximumFileSizeBytes: BigInt(size) },
      });
    },
  );

  it.each([
    { archivesEnabled: null },
    { maximumFileSizeBytes: null },
    { imagesEnabled: 'true' },
    { otherFilesEnabled: 1 },
    { attachmentsEnabled: [] },
    { imagesEnabled: {} },
    { unexpected: true },
    { imagesEnabled: true, schoolId },
    { maximumFileSizeBytes: 1024 },
    { maximumFileSizeBytes: '0' },
    { maximumFileSizeBytes: '10737418241' },
    { maximumFileSizeBytes: '01' },
    { maximumFileSizeBytes: '-1' },
    { maximumFileSizeBytes: '1.5' },
  ])('rejects malformed policy %j before persistence', async (patch) => {
    const before = { ...effective };
    await request(app.getHttpServer())
      .patch(policyPath)
      .send(patch)
      .expect(400);
    expect(updatePolicy).not.toHaveBeenCalled();
    expect(effective).toEqual(before);
  });

  it('keeps the policy-management permission requirement', async () => {
    permissions = ['academics.academic_content.view'];
    await request(app.getHttpServer())
      .patch(policyPath)
      .send({ archivesEnabled: true })
      .expect(403);
    expect(updatePolicy).not.toHaveBeenCalled();
  });

  describe.each(uploadPaths)('upload controller %s', (uploadPath) => {
    const intent = () => ({
      clientRequestId: randomUUID(),
      originalName: 'lecture.pdf',
      expectedMimeType: 'application/pdf',
      expectedSizeBytes: '10',
    });
    it('passes the approved HTTP Origin exactly through the core, StorageService and GCS SDK', async () => {
      const response = await request(app.getHttpServer())
        .post(uploadPath)
        .set('Origin', approved)
        .send(intent())
        .expect(201);
      expect(response.body as unknown).toEqual(
        expect.objectContaining({
          uploadMode: 'resumable',
          sessionUrl: 'https://storage.invalid/session-capability',
        }),
      );
      expect(createResumableUpload).toHaveBeenCalledWith({
        preconditionOpts: { ifGenerationMatch: 0 },
        origin: approved,
        metadata: { contentType: 'application/pdf' },
      });
      expect(createOrFindRequest).toHaveBeenCalledTimes(1);
    });
    it('preserves an approved non-browser request without fabricating an Origin', async () => {
      await request(app.getHttpServer())
        .post(uploadPath)
        .send(intent())
        .expect(201);
      expect(createResumableUpload).toHaveBeenCalledWith({
        preconditionOpts: { ifGenerationMatch: 0 },
        metadata: { contentType: 'application/pdf' },
      });
    });
    it.each([
      'https://unapproved.example.test',
      applicationOnly,
      storageOnly,
      'null',
      '*',
      '',
      `${approved}/`,
      `${approved}, ${storageOnly}`,
    ])(
      'rejects Origin %s before creating any upload intent or capability',
      async (origin) => {
        await request(app.getHttpServer())
          .post(uploadPath)
          .set('Origin', origin)
          .send(intent())
          .expect(400);
        expect(createResumableUpload).not.toHaveBeenCalled();
        expect(createOrFindRequest).not.toHaveBeenCalled();
      },
    );
    it.each(['origin', 'trustedOrigin'])(
      'never accepts browser authority from JSON field %s',
      async (field) => {
        await request(app.getHttpServer())
          .post(uploadPath)
          .set('Origin', approved)
          .send({ ...intent(), [field]: approved })
          .expect(400);
        expect(createResumableUpload).not.toHaveBeenCalled();
        expect(createOrFindRequest).not.toHaveBeenCalled();
      },
    );
    it('preserves fail-closed behavior when resumable storage is unavailable', async () => {
      resumable = false;
      const response = await request(app.getHttpServer())
        .post(uploadPath)
        .send(intent())
        .expect(409);
      expect(response.body as unknown).toMatchObject({
        error: {
          code: 'academic_content.file.storage_resumable_upload_unavailable',
        },
      });
      expect(createResumableUpload).not.toHaveBeenCalled();
      expect(createOrFindRequest).not.toHaveBeenCalled();
    });
  });
});
