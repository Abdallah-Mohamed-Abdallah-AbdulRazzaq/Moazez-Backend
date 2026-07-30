import { FileVisibility } from '@prisma/client';
import { MinioAdapter } from '../minio.adapter';
import { SignedUrlService } from '../signed-url.service';
import { StorageService } from '../storage.service';

describe('StorageService readiness', () => {
  it('resolves when both configured buckets are available', async () => {
    const { service, minioAdapter } = createService();
    minioAdapter.bucketExistsForReadiness.mockResolvedValue(true);

    await expect(service.checkReadiness()).resolves.toBeUndefined();

    expect(minioAdapter.bucketExistsForReadiness).toHaveBeenNthCalledWith(
      1,
      'private-bucket',
    );
    expect(minioAdapter.bucketExistsForReadiness).toHaveBeenNthCalledWith(
      2,
      'public-bucket',
    );
    expect(minioAdapter.bucketExists).not.toHaveBeenCalled();
  });

  it.each([
    [false, true],
    [true, false],
  ])(
    'rejects when a configured bucket is missing',
    async (privateExists, publicExists) => {
      const { service, minioAdapter } = createService();
      minioAdapter.bucketExistsForReadiness
        .mockResolvedValueOnce(privateExists)
        .mockResolvedValueOnce(publicExists);

      await expect(service.checkReadiness()).rejects.toThrow(
        'storage_bucket_unavailable',
      );
    },
  );

  it('maps provider rejection to the stable storage error', async () => {
    const { service, minioAdapter } = createService();
    minioAdapter.bucketExistsForReadiness
      .mockRejectedValueOnce(new Error('provider-secret-detail'))
      .mockResolvedValueOnce(true);

    await expect(service.checkReadiness()).rejects.toThrow(
      'storage_bucket_unavailable',
    );
  });

  it('waits for both readiness operations to settle after one rejects', async () => {
    const { service, minioAdapter } = createService();
    const privateBucket = deferred<boolean>();
    const publicBucket = deferred<boolean>();
    minioAdapter.bucketExistsForReadiness
      .mockReturnValueOnce(privateBucket.promise)
      .mockReturnValueOnce(publicBucket.promise);

    const readiness = service.checkReadiness();
    let settled = false;
    void readiness.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );

    privateBucket.reject(new Error('private-provider-detail'));
    await Promise.resolve();
    expect(settled).toBe(false);

    publicBucket.resolve(true);
    await expect(readiness).rejects.toThrow('storage_bucket_unavailable');
    expect(settled).toBe(true);
  });

  it('starts two fresh provider operations after prior settlement', async () => {
    const { service, minioAdapter } = createService();
    minioAdapter.bucketExistsForReadiness.mockResolvedValue(true);

    await service.checkReadiness();
    await service.checkReadiness();

    expect(minioAdapter.bucketExistsForReadiness).toHaveBeenCalledTimes(4);
    expect(minioAdapter.bucketExistsForReadiness.mock.calls).toEqual([
      ['private-bucket'],
      ['public-bucket'],
      ['private-bucket'],
      ['public-bucket'],
    ]);
  });

  it('does not expose or log provider error details', async () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const { service, minioAdapter } = createService();
    minioAdapter.bucketExistsForReadiness
      .mockRejectedValueOnce(
        new Error('http://secret-endpoint/private-bucket?credential=secret'),
      )
      .mockResolvedValueOnce(true);

    try {
      let error: unknown;
      try {
        await service.checkReadiness();
      } catch (caught: unknown) {
        error = caught;
      }

      expect(error).toEqual(new Error('storage_bucket_unavailable'));
      expect(String(error)).not.toContain('secret-endpoint');
      expect(String(error)).not.toContain('credential');
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });
});

function createService(): {
  service: StorageService;
  minioAdapter: {
    bucketExists: jest.Mock<Promise<boolean>, [string]>;
    bucketExistsForReadiness: jest.Mock<Promise<boolean>, [string]>;
  };
} {
  const minioAdapter = {
    bucketExists: jest.fn<Promise<boolean>, [string]>(),
    bucketExistsForReadiness: jest.fn<Promise<boolean>, [string]>(),
  };
  const signedUrlService = {
    resolveBucket: jest.fn((visibility: FileVisibility) =>
      visibility === FileVisibility.PUBLIC ? 'public-bucket' : 'private-bucket',
    ),
  };
  const service = new StorageService(
    minioAdapter as unknown as MinioAdapter,
    signedUrlService as unknown as SignedUrlService,
  );
  return { service, minioAdapter };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
