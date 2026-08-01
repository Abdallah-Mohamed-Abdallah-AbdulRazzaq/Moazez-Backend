import {
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { RequestContextMiddleware } from '../common/context/context.middleware';
import { GlobalExceptionFilter } from '../common/exceptions/global-exception.filter';
import { GetFileDownloadUrlUseCase } from '../modules/files/uploads/application/get-file-download-url.use-case';
import { UploadFileUseCase } from '../modules/files/uploads/application/upload-file.use-case';
import { UploadsController } from '../modules/files/uploads/controller/uploads.controller';
import { FILES_UPLOAD_MAX_SIZE_BYTES } from '../modules/files/uploads/domain/file-upload.constraints';
import { DeleteBrandingLogoUseCase } from '../modules/settings/branding/application/delete-branding-logo.use-case';
import { GetBrandingUseCase } from '../modules/settings/branding/application/get-branding.use-case';
import { UpdateBrandingUseCase } from '../modules/settings/branding/application/update-branding.use-case';
import { UploadBrandingLogoUseCase } from '../modules/settings/branding/application/upload-branding-logo.use-case';
import { BrandingController } from '../modules/settings/branding/controller/branding.controller';
import { BRANDING_LOGO_MAX_SIZE_BYTES } from '../modules/settings/branding/domain/branding-logo.constants';
import {
  type ApplicationWorkKind,
  type ApplicationWorkLease,
  ApplicationLifecycleState,
} from './application-lifecycle.state';
import { GracefulShutdownCoordinator } from './graceful-shutdown';
import { configureHttpApplication } from './http-application';
import {
  HttpLifecycleAdmissionGuard,
  HttpLifecycleCompletionInterceptor,
} from './http-drain.middleware';

jest.setTimeout(30_000);

const SMALL_FILE = Buffer.from('route-scoped-filter-lifecycle');

class TrackingLifecycleState extends ApplicationLifecycleState {
  readonly admitted = jest.fn();
  readonly released = jest.fn();

  override tryAdmit(kind: ApplicationWorkKind): ApplicationWorkLease | null {
    const lease = super.tryAdmit(kind);
    if (!lease) return null;

    this.admitted(kind);
    return {
      release: () => {
        this.released(kind);
        lease.release();
      },
    };
  }
}

class DownstreamAuthenticationGuard implements CanActivate {
  constructor(private readonly reject: boolean) {}

  canActivate(_context: ExecutionContext): boolean {
    if (this.reject) throw new UnauthorizedException();
    return true;
  }
}

describe('route-scoped multipart filter lifecycle settlement', () => {
  const applications: INestApplication[] = [];

  afterEach(async () => {
    await Promise.all(applications.splice(0).map((app) => app.close()));
  });

  it.each([
    {
      name: 'Branding',
      path: '/api/v1/settings/branding/logo',
    },
    {
      name: 'generic Files',
      path: '/api/v1/files',
    },
  ])(
    '$name guard rejection releases once before the completion interceptor',
    async ({ path }) => {
      const fixture = await createFixture({ rejectInGuard: true });

      await request(fixture.app.getHttpServer())
        .post(path)
        .attach('file', SMALL_FILE, {
          filename: 'unauthorized.png',
          contentType: 'image/png',
        })
        .expect(401);

      expect(fixture.completion).not.toHaveBeenCalled();
      expect(fixture.lifecycle.admitted).toHaveBeenCalledTimes(1);
      expect(fixture.lifecycle.released).toHaveBeenCalledTimes(1);
      expect(fixture.lifecycle.getActiveWorkCount()).toBe(0);
      await expectShutdownSuccess(fixture);
    },
  );

  it('preserves the Branding multipart 413 envelope and releases once', async () => {
    const fixture = await createFixture();

    const response = await request(fixture.app.getHttpServer())
      .post('/api/v1/settings/branding/logo')
      .attach('file', Buffer.alloc(BRANDING_LOGO_MAX_SIZE_BYTES + 1), {
        filename: 'oversized.png',
        contentType: 'image/png',
      })
      .expect(413);

    expect(response.body).toEqual({
      error: {
        code: 'settings.branding.logo.size_exceeded',
        message: 'The school logo exceeds the maximum allowed size',
        details: { maxSizeBytes: BRANDING_LOGO_MAX_SIZE_BYTES },
        traceId: expect.any(String),
      },
    });
    expect(fixture.lifecycle.admitted).toHaveBeenCalledTimes(1);
    expect(fixture.lifecycle.released).toHaveBeenCalledTimes(1);
    expect(fixture.lifecycle.getActiveWorkCount()).toBe(0);
    await expectShutdownSuccess(fixture);
  });

  it('preserves the generic Files multipart 413 envelope and releases once', async () => {
    const fixture = await createFixture();

    const response = await request(fixture.app.getHttpServer())
      .post('/api/v1/files')
      .attach('file', Buffer.alloc(FILES_UPLOAD_MAX_SIZE_BYTES + 2), {
        filename: 'oversized.pdf',
        contentType: 'application/pdf',
      })
      .expect(413);

    expect(response.body).toEqual({
      error: {
        code: 'files.upload.size_exceeded',
        message: 'File size exceeds allowed limit',
        details: { maxSizeBytes: FILES_UPLOAD_MAX_SIZE_BYTES },
        traceId: expect.any(String),
      },
    });
    expect(fixture.lifecycle.admitted).toHaveBeenCalledTimes(1);
    expect(fixture.lifecycle.released).toHaveBeenCalledTimes(1);
    expect(fixture.lifecycle.getActiveWorkCount()).toBe(0);
    await expectShutdownSuccess(fixture);
  });

  it.each([
    {
      name: 'Branding',
      path: '/api/v1/settings/branding/logo',
      failBranding: true,
    },
    {
      name: 'generic Files',
      path: '/api/v1/files',
      failFiles: true,
    },
  ])(
    '$name unrecognized failure remains a 500 and releases exactly once',
    async ({ failBranding, failFiles, path }) => {
      const fixture = await createFixture({ failBranding, failFiles });

      const response = await request(fixture.app.getHttpServer())
        .post(path)
        .attach('file', SMALL_FILE, {
          filename: 'valid.png',
          contentType: 'image/png',
        })
        .expect(500);

      expect(response.body.error).toEqual(
        expect.objectContaining({
          code: 'internal_error',
          traceId: expect.any(String),
        }),
      );
      expect(response.body.error.code).not.toContain('size_exceeded');
      expect(fixture.lifecycle.admitted).toHaveBeenCalledTimes(1);
      expect(fixture.lifecycle.released).toHaveBeenCalledTimes(1);
      expect(fixture.lifecycle.getActiveWorkCount()).toBe(0);
      await expectShutdownSuccess(fixture);
    },
  );

  async function createFixture(
    options: {
      failBranding?: boolean;
      failFiles?: boolean;
      rejectInGuard?: boolean;
    } = {},
  ): Promise<{
    app: INestApplication;
    completion: jest.SpyInstance;
    coordinator: GracefulShutdownCoordinator;
    lifecycle: TrackingLifecycleState;
    processTarget: {
      exit: jest.Mock;
      exitCode: string | number | null | undefined;
      off: jest.Mock;
      on: jest.Mock;
    };
  }> {
    const uploadBranding = {
      execute: jest.fn(async () => {
        if (options.failBranding)
          throw new Error('unrecognized branding error');
        return {};
      }),
    };
    const uploadFile = {
      execute: jest.fn(async () => {
        if (options.failFiles) throw new Error('unrecognized files error');
        return {};
      }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [BrandingController, UploadsController],
      providers: [
        { provide: GetBrandingUseCase, useValue: { execute: jest.fn() } },
        { provide: UpdateBrandingUseCase, useValue: { execute: jest.fn() } },
        { provide: UploadBrandingLogoUseCase, useValue: uploadBranding },
        {
          provide: DeleteBrandingLogoUseCase,
          useValue: { execute: jest.fn() },
        },
        { provide: UploadFileUseCase, useValue: uploadFile },
        {
          provide: GetFileDownloadUrlUseCase,
          useValue: { execute: jest.fn() },
        },
      ],
    }).compile();
    const app = moduleRef.createNestApplication();
    applications.push(app);

    const lifecycle = new TrackingLifecycleState();
    const requestContext = new RequestContextMiddleware();
    app.use((incomingRequest, response, next) =>
      requestContext.use(incomingRequest, response, next),
    );
    configureHttpApplication(
      app,
      {
        environment: 'test',
        corsOrigins: 'http://localhost:3001',
        swaggerEnabled: false,
      },
      lifecycle,
    );
    app.useGlobalGuards(
      new HttpLifecycleAdmissionGuard(lifecycle),
      new DownstreamAuthenticationGuard(options.rejectInGuard ?? false),
    );
    const completionInterceptor = new HttpLifecycleCompletionInterceptor();
    const completion = jest.spyOn(completionInterceptor, 'intercept');
    app.useGlobalInterceptors(completionInterceptor);
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.listen(0, '127.0.0.1');

    const processTarget = {
      exit: jest.fn(),
      exitCode: undefined as string | number | null | undefined,
      off: jest.fn(),
      on: jest.fn(),
    };
    const coordinator = new GracefulShutdownCoordinator({
      app,
      httpServer: app.getHttpServer(),
      managementServer: { close: (callback) => callback() },
      lifecycle,
      queue: { beginWorkerDrain: jest.fn().mockResolvedValue(undefined) },
      realtime: {
        disconnectSocketsForShutdown: jest.fn().mockResolvedValue(undefined),
      },
      timeoutMs: 5_000,
      logger: { error: jest.fn(), log: jest.fn() },
      processTarget,
    });

    return {
      app,
      completion,
      coordinator,
      lifecycle,
      processTarget,
    };
  }

  async function expectShutdownSuccess(fixture: {
    app: INestApplication;
    coordinator: GracefulShutdownCoordinator;
    processTarget: {
      exitCode: string | number | null | undefined;
    };
  }): Promise<void> {
    await fixture.coordinator.handleSignal('SIGTERM');
    expect(fixture.processTarget.exitCode).toBe(0);
    applications.splice(applications.indexOf(fixture.app), 1);
  }
});
