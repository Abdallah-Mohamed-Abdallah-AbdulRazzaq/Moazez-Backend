import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { FileVisibility } from '@prisma/client';
import { MinioAdapter } from '../../src/infrastructure/storage/minio.adapter';
import { SignedUrlService } from '../../src/infrastructure/storage/signed-url.service';
import { StorageService } from '../../src/infrastructure/storage/storage.service';

jest.setTimeout(120_000);

describe('learning media direct MinIO operations', () => {
  const config = new ConfigService(process.env);
  const adapter = new MinioAdapter(config);
  const storage = new StorageService(
    adapter,
    new SignedUrlService(adapter, config),
  );
  const bucket = process.env.STORAGE_BUCKET ?? '';
  const objectKey = `learning-media-integration/${randomUUID()}`;
  const expiryObjectKey = `learning-media-integration/expiry/${randomUUID()}`;
  const body = Buffer.from('direct-put-learning-media-proof');

  afterAll(async () => {
    if (bucket) {
      await storage.deleteObject({ bucket, objectKey }).catch(() => undefined);
      await storage
        .deleteObject({ bucket, objectKey: expiryObjectKey })
        .catch(() => undefined);
    }
  });

  it('returns the exact expiry encoded by the signed PUT capability', async () => {
    const capability = await storage.createUploadUrl({
      bucket,
      objectKey: expiryObjectKey,
      expiresInSeconds: 60,
    });

    expect(typeof capability.url).toBe('string');
    expect(capability.expiresAt).toBeInstanceOf(Date);
    const signedUrl = new URL(capability.url);
    const signedAt = signedUrl.searchParams.get('X-Amz-Date');
    const signedSeconds = signedUrl.searchParams.get('X-Amz-Expires');
    expect(signedAt).toMatch(/^\d{8}T\d{6}Z$/u);
    expect(signedSeconds).toBe('60');
  });

  it('supports signed PUT, exact stat, authenticated stream, and confirmed deletion', async () => {
    const uploadCapability = await storage.createUploadUrl({
      bucket,
      objectKey,
      expiresInSeconds: 3_600,
    });
    const response = await fetch(uploadCapability.url, {
      method: 'PUT',
      body,
      headers: { 'content-type': 'video/mp4' },
    });
    expect(response.ok).toBe(true);
    const stat = await storage.statObject({ bucket, objectKey });
    expect(stat.size).toBe(body.byteLength);
    const stream = await storage.getObject({ bucket, objectKey });
    const chunks: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    expect(Buffer.concat(chunks)).toEqual(body);
    await storage.deleteObjectAndConfirmAbsent({ bucket, objectKey });
    await expect(storage.objectExists({ bucket, objectKey })).resolves.toBe(
      false,
    );
  });

  it('keeps the upload bucket private', () => {
    expect(storage.resolveBucket(FileVisibility.PRIVATE)).toBe(bucket);
  });

  it('permits only the configured browser origin for a PUT preflight', async () => {
    const endpoint = process.env.STORAGE_ENDPOINT;
    const configuredOrigin =
      process.env.STORAGE_CORS_ORIGINS?.split(',')[0]?.trim();
    if (!endpoint || !configuredOrigin) {
      throw new Error(
        'STORAGE_ENDPOINT and STORAGE_CORS_ORIGINS are required for CORS proof',
      );
    }
    expect(configuredOrigin).not.toBe('*');
    const target = `${endpoint}/${bucket}/cors-preflight-${randomUUID()}`;
    const allowed = await fetch(target, {
      method: 'OPTIONS',
      headers: {
        origin: configuredOrigin,
        'access-control-request-method': 'PUT',
        'access-control-request-headers': 'content-type',
      },
    });
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get('access-control-allow-origin')).toBe(
      configuredOrigin,
    );
    expect(allowed.headers.get('access-control-allow-methods')).toContain(
      'PUT',
    );
    expect(allowed.headers.get('access-control-allow-headers')).toContain(
      'content-type',
    );
    expect(allowed.headers.get('access-control-allow-origin')).not.toBe('*');

    const denied = await fetch(target, {
      method: 'OPTIONS',
      headers: {
        origin: 'https://unconfigured.invalid',
        'access-control-request-method': 'PUT',
        'access-control-request-headers': 'content-type',
      },
    });
    expect(denied.status).toBe(204);
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
  });
});
