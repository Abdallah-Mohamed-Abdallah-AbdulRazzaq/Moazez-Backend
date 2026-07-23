import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';
import { MinioAdapter } from '../../src/infrastructure/storage/minio.adapter';
import { SignedUrlService } from '../../src/infrastructure/storage/signed-url.service';
import { StorageService } from '../../src/infrastructure/storage/storage.service';

jest.setTimeout(120_000);

describe('learning media playback Range support', () => {
  const config = new ConfigService(process.env);
  const adapter = new MinioAdapter(config);
  const storage = new StorageService(
    adapter,
    new SignedUrlService(adapter, config),
  );
  const bucket = `playback-range-${randomUUID()}`;
  const objectKey = `learning-media-playback-range/${randomUUID()}.mp4`;
  const body = Buffer.alloc(4096);
  const minio = createMinioClient();

  beforeAll(() => {
    for (let index = 0; index < body.length; index += 1) {
      body[index] = index % 251;
    }
  });

  afterAll(async () => {
    try {
      await storage.deleteObject({ bucket, objectKey }).catch(() => undefined);
    } finally {
      if (await minio.bucketExists(bucket)) {
        await minio.removeBucket(bucket);
      }
    }
  });

  it('returns a 300-second inline signed GET that supports byte ranges', async () => {
    await storage.saveObject({
      bucket,
      objectKey,
      body,
      sizeBytes: body.byteLength,
      contentType: 'video/mp4',
    });

    const firstCapability = await storage.createDownloadUrl({
      bucket,
      objectKey,
      expiresInSeconds: 300,
      disposition: 'inline',
      contentType: 'video/mp4',
    });
    const signedUrl = new URL(firstCapability.url);
    expect(signedUrl.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(firstCapability.expiresAt.toISOString()).toBe(
      expectedExpiry(signedUrl, 300).toISOString(),
    );

    const response = await fetch(firstCapability.url, {
      headers: { range: 'bytes=0-1023' },
    });
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe(
      `bytes 0-1023/${body.byteLength}`,
    );
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(response.headers.get('content-type')).toBe('video/mp4');
    expect(response.headers.get('content-disposition')).toBe('inline');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(
      body.subarray(0, 1024),
    );

    const secondCapability = await storage.createDownloadUrl({
      bucket,
      objectKey,
      expiresInSeconds: 300,
      disposition: 'inline',
      contentType: 'video/mp4',
    });
    expect(secondCapability.url).toContain('X-Amz-Expires=300');
    await expect(storage.objectExists({ bucket, objectKey })).resolves.toBe(
      true,
    );
  });
});

function expectedExpiry(url: URL, expectedSeconds: number): Date {
  const signedAt = url.searchParams.get('X-Amz-Date');
  const expires = Number(url.searchParams.get('X-Amz-Expires'));
  expect(signedAt).toMatch(/^\d{8}T\d{6}Z$/u);
  expect(expires).toBe(expectedSeconds);
  return new Date(
    Date.UTC(
      Number(signedAt!.slice(0, 4)),
      Number(signedAt!.slice(4, 6)) - 1,
      Number(signedAt!.slice(6, 8)),
      Number(signedAt!.slice(9, 11)),
      Number(signedAt!.slice(11, 13)),
      Number(signedAt!.slice(13, 15)),
    ) +
      expires * 1000,
  );
}

function createMinioClient(): Client {
  const endpoint = new URL(process.env.STORAGE_ENDPOINT ?? '');
  return new Client({
    endPoint: endpoint.hostname,
    port: endpoint.port
      ? Number(endpoint.port)
      : endpoint.protocol === 'https:'
        ? 443
        : 80,
    useSSL: endpoint.protocol === 'https:',
    accessKey: process.env.STORAGE_ACCESS_KEY ?? '',
    secretKey: process.env.STORAGE_SECRET_KEY ?? '',
  });
}
