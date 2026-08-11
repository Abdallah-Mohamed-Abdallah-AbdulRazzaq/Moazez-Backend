import { ConfigService } from '@nestjs/config';
import { FileVisibility } from '@prisma/client';
import { MinioAdapter } from '../minio.adapter';
import type { ObjectStoragePort } from '../object-storage.port';
import { SignedUrlService } from '../signed-url.service';

describe('SignedUrlService', () => {
  it('creates an inline signed GET capability without filename exposure', async () => {
    const createSignedGetUrl = jest.fn().mockResolvedValue({
      url: 'https://storage.invalid/object?X-Amz-Date=20260723T120000Z&X-Amz-Expires=300',
      expiresAt: new Date('2026-07-23T12:05:00.000Z'),
    });
    const objectStorage = {
      createSignedGetUrl,
    } as unknown as ObjectStoragePort;
    const service = new SignedUrlService(objectStorage, config());

    await expect(
      service.createDownloadUrl({
        bucket: 'private-bucket',
        objectKey: 'final/video.mp4',
        expiresInSeconds: 300,
        disposition: 'inline',
        contentType: 'video/mp4',
        downloadFileName: 'ignored.mp4',
      }),
    ).resolves.toEqual({
      url: 'https://storage.invalid/object?X-Amz-Date=20260723T120000Z&X-Amz-Expires=300',
      expiresAt: new Date('2026-07-23T12:05:00.000Z'),
    });

    expect(createSignedGetUrl).toHaveBeenCalledWith({
      bucket: 'private-bucket',
      objectKey: 'final/video.mp4',
      expiresInSeconds: 300,
      overrides: {
        contentDisposition: 'inline',
        contentType: 'video/mp4',
      },
    });
  });

  it('preserves attachment filename sanitization for existing callers', async () => {
    const createSignedGetUrl = jest.fn().mockResolvedValue({
      url: 'https://storage.invalid/object',
      expiresAt: new Date('2026-07-23T12:15:00.000Z'),
    });
    const objectStorage = {
      createSignedGetUrl,
    } as unknown as ObjectStoragePort;
    const service = new SignedUrlService(objectStorage, config());

    await service.createDownloadUrl({
      objectKey: 'files/doc.pdf',
      visibility: FileVisibility.PRIVATE,
      downloadFileName: ' report"\r\n.pdf ',
    });

    expect(createSignedGetUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: 'private-bucket',
        expiresInSeconds: 900,
        overrides: {
          contentDisposition: 'attachment; filename="report.pdf"',
        },
      }),
    );
  });

  it('supports no disposition override while retaining an explicit content type', async () => {
    const createSignedGetUrl = jest.fn().mockResolvedValue({
      url: 'https://storage.invalid/object',
      expiresAt: new Date('2026-07-23T12:15:00.000Z'),
    });
    const service = new SignedUrlService(
      { createSignedGetUrl } as unknown as ObjectStoragePort,
      config(),
    );

    await service.createDownloadUrl({
      objectKey: 'files/doc.pdf',
      disposition: 'none',
      contentType: 'application/pdf',
    });

    expect(createSignedGetUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        overrides: {
          contentType: 'application/pdf',
        },
      }),
    );
  });

  it('emits attachment even when no filename is supplied', async () => {
    const createSignedGetUrl = jest.fn().mockResolvedValue({
      url: 'https://storage.invalid/object',
      expiresAt: new Date('2026-07-23T12:15:00.000Z'),
    });
    const service = new SignedUrlService(
      { createSignedGetUrl } as unknown as ObjectStoragePort,
      config(),
    );

    await service.createDownloadUrl({
      objectKey: 'files/doc.pdf',
      disposition: 'attachment',
    });

    expect(createSignedGetUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        overrides: {
          contentDisposition: 'attachment',
        },
      }),
    );
  });
});

describe('MinioAdapter signed GET expiry', () => {
  it('derives expiry from the signed timestamp and TTL', async () => {
    const adapter = new MinioAdapter(config());
    const client = adapter as unknown as {
      client: {
        presignedGetObject: (
          bucket: string,
          objectKey: string,
          expiresInSeconds: number,
          responseHeaders?: Record<string, string>,
        ) => Promise<string>;
      };
    };
    jest
      .spyOn(client.client, 'presignedGetObject')
      .mockResolvedValue(
        'https://storage.invalid/object?X-Amz-Date=20260723T120000Z&X-Amz-Expires=300',
      );

    await expect(
      adapter.createSignedGetUrl({
        bucket: 'private-bucket',
        objectKey: 'final/video.mp4',
        expiresInSeconds: 300,
      }),
    ).resolves.toEqual({
      url: 'https://storage.invalid/object?X-Amz-Date=20260723T120000Z&X-Amz-Expires=300',
      expiresAt: new Date('2026-07-23T12:05:00.000Z'),
    });
  });

  it.each([
    'https://storage.invalid/object?X-Amz-Expires=300',
    'https://storage.invalid/object?X-Amz-Date=20261323T120000Z&X-Amz-Expires=300',
    'https://storage.invalid/object?X-Amz-Date=20260723T120000Z&X-Amz-Expires=0',
  ])(
    'rejects malformed signed expiry without exposing the URL: %s',
    async (url) => {
      const adapter = new MinioAdapter(config());
      const client = adapter as unknown as {
        client: {
          presignedGetObject: () => Promise<string>;
        };
      };
      jest.spyOn(client.client, 'presignedGetObject').mockResolvedValue(url);

      await expect(
        adapter.createSignedGetUrl({
          bucket: 'private-bucket',
          objectKey: 'final/video.mp4',
          expiresInSeconds: 300,
        }),
      ).rejects.toThrow(/^storage_signed_get_expiry_/u);
    },
  );
});

function config(): ConfigService {
  return {
    getOrThrow: jest.fn((key: string) => {
      const values: Record<string, string> = {
        STORAGE_ENDPOINT: 'http://127.0.0.1:9000',
        STORAGE_ACCESS_KEY: 'test-access-key',
        STORAGE_SECRET_KEY: 'test-secret-key',
        STORAGE_BUCKET: 'private-bucket',
        STORAGE_PUBLIC_BUCKET: 'public-bucket',
      };
      return values[key];
    }),
  } as unknown as ConfigService;
}
