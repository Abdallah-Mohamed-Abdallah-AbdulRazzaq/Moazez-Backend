import { FileVisibility } from '@prisma/client';
import type { ObjectStoragePort } from '../object-storage.port';
import { SignedUrlService } from '../signed-url.service';
import { StorageService } from '../storage.service';

describe('StorageService readiness', () => {
  it('resolves when both configured buckets are available', async () => {
    const { service, objectStorage } = createService();
    objectStorage.isBucketAvailable.mockResolvedValue(true);

    await expect(service.checkReadiness()).resolves.toBeUndefined();

    expect(objectStorage.isBucketAvailable).toHaveBeenNthCalledWith(
      1,
      'private-bucket',
    );
    expect(objectStorage.isBucketAvailable).toHaveBeenNthCalledWith(
      2,
      'public-bucket',
    );
  });

  it.each([
    [false, true],
    [true, false],
  ])(
    'rejects when a configured bucket is missing',
    async (privateExists, publicExists) => {
      const { service, objectStorage } = createService();
      objectStorage.isBucketAvailable
        .mockResolvedValueOnce(privateExists)
        .mockResolvedValueOnce(publicExists);

      await expect(service.checkReadiness()).rejects.toThrow(
        'storage_bucket_unavailable',
      );
    },
  );

  it('maps provider rejection to the stable storage error', async () => {
    const { service, objectStorage } = createService();
    objectStorage.isBucketAvailable
      .mockRejectedValueOnce(new Error('provider-secret-detail'))
      .mockResolvedValueOnce(true);

    await expect(service.checkReadiness()).rejects.toThrow(
      'storage_bucket_unavailable',
    );
  });

  it('waits for both readiness operations to settle after one rejects', async () => {
    const { service, objectStorage } = createService();
    const privateBucket = deferred<boolean>();
    const publicBucket = deferred<boolean>();
    objectStorage.isBucketAvailable
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
    const { service, objectStorage } = createService();
    objectStorage.isBucketAvailable.mockResolvedValue(true);

    await service.checkReadiness();
    await service.checkReadiness();

    expect(objectStorage.isBucketAvailable).toHaveBeenCalledTimes(4);
    expect(objectStorage.isBucketAvailable.mock.calls).toEqual([
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
    const { service, objectStorage } = createService();
    objectStorage.isBucketAvailable
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
  it('preserves saveObject bucket resolution and caller-facing result', async () => {
    const { service, objectStorage } = createService();
    objectStorage.putObject.mockResolvedValue({
      etag: 'etag-1',
      generation: '17',
      version: null,
    });

    await expect(
      service.saveObject({
        objectKey: 'files/report.pdf',
        body: Buffer.from('report'),
        contentType: 'application/pdf',
      }),
    ).resolves.toEqual({ bucket: 'private-bucket', etag: 'etag-1' });

    expect(objectStorage.putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: 'private-bucket',
        objectKey: 'files/report.pdf',
      }),
    );
  });
});

function createService(): {
  service: StorageService;
  objectStorage: {
    isBucketAvailable: jest.Mock<Promise<boolean>, [string]>;
    putObject: jest.Mock;
  };
} {
  const objectStorage = {
    isBucketAvailable: jest.fn<Promise<boolean>, [string]>(),
    putObject: jest.fn(),
  };
  const signedUrlService = {
    resolveBucket: jest.fn((visibility: FileVisibility) =>
      visibility === FileVisibility.PUBLIC ? 'public-bucket' : 'private-bucket',
    ),
  };
  const service = new StorageService(
    objectStorage as unknown as ObjectStoragePort,
    signedUrlService as unknown as SignedUrlService,
  );
  return { service, objectStorage };
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
