import { FileVisibility, UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import { BrandingLogoCleanupQueueService } from '../application/branding-logo-cleanup-queue.service';
import { DeleteBrandingLogoUseCase } from '../application/delete-branding-logo.use-case';
import { GetBrandingUseCase } from '../application/get-branding.use-case';
import { UploadBrandingLogoUseCase } from '../application/upload-branding-logo.use-case';
import { BRANDING_LOGO_MAX_SIZE_BYTES } from '../domain/branding-logo.constants';
import { BrandingRepository } from '../infrastructure/branding.repository';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==',
  'base64',
);

describe('branding logo managed lifecycle', () => {
  it.each([
    ['image/png', PNG],
    ['image/jpeg', JPEG],
  ])(
    'uploads valid %s privately with context ownership',
    async (mimeType, buffer) => {
      const harness = createUploadHarness();

      await runScoped(() =>
        harness.useCase.execute({
          buffer,
          mimetype: mimeType,
          originalname: 'school-logo.image',
        }),
      );

      expect(harness.storage.saveObject).toHaveBeenCalledWith(
        expect.objectContaining({
          body: buffer,
          visibility: FileVisibility.PRIVATE,
          contentType: mimeType,
        }),
      );
      expect(harness.repository.replaceManagedLogo).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedPrivateBucket: 'private-bucket',
          scope: expect.objectContaining({
            schoolId: 'school-1',
            organizationId: 'org-1',
            actorId: 'user-1',
          }),
          file: expect.objectContaining({ mimeType }),
        }),
      );
    },
  );

  it('rejects unsupported, mismatched, and oversized images before storage', async () => {
    const harness = createUploadHarness();

    await expect(
      runScoped(() =>
        harness.useCase.execute({
          buffer: PNG,
          mimetype: 'image/svg+xml',
          originalname: 'logo.svg',
        }),
      ),
    ).rejects.toMatchObject({
      code: 'settings.branding.logo.mime_not_allowed',
    });
    await expect(
      runScoped(() =>
        harness.useCase.execute({
          buffer: PNG,
          mimetype: 'image/jpeg',
          originalname: 'logo.jpg',
        }),
      ),
    ).rejects.toMatchObject({ code: 'settings.branding.logo.mime_mismatch' });
    await expect(
      runScoped(() =>
        harness.useCase.execute({
          buffer: Buffer.concat([
            PNG,
            Buffer.alloc(BRANDING_LOGO_MAX_SIZE_BYTES),
          ]),
          mimetype: 'image/png',
          originalname: 'large.png',
        }),
      ),
    ).rejects.toMatchObject({ code: 'settings.branding.logo.size_exceeded' });
    expect(harness.storage.saveObject).not.toHaveBeenCalled();
    expect(harness.repository.recordLogoFailure).toHaveBeenCalledTimes(3);
    expect(harness.repository.recordLogoFailure).toHaveBeenCalledWith({
      scope: expect.objectContaining({
        actorId: 'user-1',
        userType: UserType.SCHOOL_USER,
        organizationId: 'org-1',
        schoolId: 'school-1',
      }),
      action: 'branding.logo.upload.validation_failed',
      failureKind: 'validation_failure',
    });
  });

  it('rejects signature-only and structurally incomplete images', async () => {
    const harness = createUploadHarness();
    await expect(
      runScoped(() =>
        harness.useCase.execute({
          buffer: PNG.subarray(0, 8),
          mimetype: 'image/png',
          originalname: 'truncated.png',
        }),
      ),
    ).rejects.toMatchObject({
      code: 'settings.branding.logo.invalid_structure',
    });
    expect(harness.storage.saveObject).not.toHaveBeenCalled();
  });

  it('records sanitized best-effort evidence without masking a storage-write failure', async () => {
    const harness = createUploadHarness();
    const originalError = new Error('storage write unavailable');
    harness.storage.saveObject.mockRejectedValueOnce(originalError);

    await expect(
      runScoped(() =>
        harness.useCase.execute({
          buffer: PNG,
          mimetype: 'image/png',
          originalname: 'logo.png',
        }),
      ),
    ).rejects.toBe(originalError);
    expect(harness.repository.recordLogoFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'branding.logo.upload.storage_write_failed',
        failureKind: 'storage_write_failure',
      }),
    );
    expect(harness.repository.replaceManagedLogo).not.toHaveBeenCalled();
  });

  it('compensates the new object when the database transaction fails', async () => {
    const harness = createUploadHarness();
    harness.repository.replaceManagedLogo.mockRejectedValueOnce(
      new Error('database transaction failed'),
    );

    await expect(
      runScoped(() =>
        harness.useCase.execute({
          buffer: PNG,
          mimetype: 'image/png',
          originalname: 'logo.png',
        }),
      ),
    ).rejects.toThrow('database transaction failed');
    expect(harness.storage.deleteObject).toHaveBeenCalledWith({
      bucket: 'private-bucket',
      objectKey: expect.stringMatching(
        /^schools\/school-1\/branding\/logos\/.+\.png$/,
      ),
    });
    expect(harness.cleanup.cleanupAfterCommit).not.toHaveBeenCalled();
    expect(harness.repository.recordLogoFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'branding.logo.upload.transaction_failed',
        failureKind: 'database_transaction_failure',
      }),
    );
  });

  it('preserves the transaction error when new-object compensation also fails', async () => {
    const harness = createUploadHarness();
    const originalError = new Error('serializable retries exhausted');
    harness.repository.replaceManagedLogo.mockRejectedValueOnce(originalError);
    harness.storage.deleteObject.mockRejectedValueOnce(
      new Error('compensation storage unavailable'),
    );

    await expect(
      runScoped(() =>
        harness.useCase.execute({
          buffer: PNG,
          mimetype: 'image/png',
          originalname: 'logo.png',
        }),
      ),
    ).rejects.toBe(originalError);
    expect(harness.repository.recordLogoFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'branding.logo.upload.compensation_failed',
        failureKind: 'compensation_failure',
      }),
    );
  });

  it('schedules post-commit cleanup for a replaced managed object', async () => {
    const harness = createUploadHarness();
    const previousFile = managedFileFixture();
    harness.repository.replaceManagedLogo.mockResolvedValueOnce({
      profile: { id: 'profile-1' },
      previousFile,
    } as never);

    await runScoped(() =>
      harness.useCase.execute({
        buffer: JPEG,
        mimetype: 'image/jpeg',
        originalname: 'logo.jpg',
      }),
    );
    expect(harness.cleanup.cleanupAfterCommit).toHaveBeenCalledWith(
      previousFile,
    );
  });

  it('does not dispatch cleanup or storage deletion without eligible cleanup information', async () => {
    const harness = createUploadHarness();

    await runScoped(() =>
      harness.useCase.execute({
        buffer: PNG,
        mimetype: 'image/png',
        originalname: 'logo.png',
      }),
    );

    expect(harness.cleanup.cleanupAfterCommit).not.toHaveBeenCalled();
    expect(harness.storage.deleteObject).not.toHaveBeenCalled();
  });

  it('deletes idempotently and uses the same cleanup lifecycle', async () => {
    const previousFile = managedFileFixture();
    const repository = {
      deleteManagedLogo: jest
        .fn()
        .mockResolvedValueOnce({ changed: true, previousFile })
        .mockResolvedValueOnce({ changed: false, previousFile: null }),
    } as unknown as jest.Mocked<Pick<BrandingRepository, 'deleteManagedLogo'>>;
    const cleanup = {
      cleanupAfterCommit: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<
      Pick<BrandingLogoCleanupQueueService, 'cleanupAfterCommit'>
    >;
    const storage = {
      resolveBucket: jest.fn().mockReturnValue('private-bucket'),
    } as unknown as StorageService;
    const useCase = new DeleteBrandingLogoUseCase(
      repository as BrandingRepository,
      cleanup as BrandingLogoCleanupQueueService,
      storage,
    );

    await runScoped(() => useCase.execute());
    await runScoped(() => useCase.execute());

    expect(repository.deleteManagedLogo).toHaveBeenCalledTimes(2);
    expect(repository.deleteManagedLogo).toHaveBeenCalledWith(
      expect.objectContaining({ schoolId: 'school-1' }),
      'private-bucket',
    );
    expect(cleanup.cleanupAfterCommit).toHaveBeenNthCalledWith(1, previousFile);
    expect(cleanup.cleanupAfterCommit).toHaveBeenCalledTimes(1);
  });
});

function createUploadHarness() {
  const storage = {
    saveObject: jest.fn().mockResolvedValue({
      bucket: 'private-bucket',
      etag: 'etag',
    }),
    deleteObject: jest.fn().mockResolvedValue(undefined),
    resolveBucket: jest.fn().mockReturnValue('private-bucket'),
  } as unknown as jest.Mocked<
    Pick<StorageService, 'saveObject' | 'deleteObject' | 'resolveBucket'>
  >;
  const repository = {
    replaceManagedLogo: jest.fn().mockResolvedValue({
      profile: { id: 'profile-1' },
      previousFile: null,
    }),
    recordLogoFailure: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<
    Pick<BrandingRepository, 'replaceManagedLogo' | 'recordLogoFailure'>
  >;
  const cleanup = {
    cleanupAfterCommit: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<
    Pick<BrandingLogoCleanupQueueService, 'cleanupAfterCommit'>
  >;
  const getBranding = {
    execute: jest
      .fn()
      .mockResolvedValue({ logoUrl: 'https://api.example/logo' }),
  } as unknown as jest.Mocked<Pick<GetBrandingUseCase, 'execute'>>;

  return {
    storage,
    repository,
    cleanup,
    useCase: new UploadBrandingLogoUseCase(
      storage as StorageService,
      repository as BrandingRepository,
      cleanup as BrandingLogoCleanupQueueService,
      getBranding as GetBrandingUseCase,
    ),
  };
}

function managedFileFixture() {
  return {
    id: 'file-1',
    organizationId: 'org-1',
    schoolId: 'school-1',
    bucket: 'private-bucket',
    objectKey:
      'schools/school-1/branding/logos/77777777-7777-4777-8777-777777777777.png',
    mimeType: 'image/png',
    sizeBytes: BigInt(PNG.byteLength),
    visibility: FileVisibility.PRIVATE,
    deletedAt: new Date(),
    createdAt: new Date(),
  };
}

function runScoped<T>(work: () => Promise<T>): Promise<T> {
  return runWithRequestContext(createRequestContext(), async () => {
    setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
    setActiveMembership({
      membershipId: 'membership-1',
      organizationId: 'org-1',
      schoolId: 'school-1',
      roleId: 'role-1',
      permissions: ['settings.branding.manage'],
    });
    return work();
  });
}
