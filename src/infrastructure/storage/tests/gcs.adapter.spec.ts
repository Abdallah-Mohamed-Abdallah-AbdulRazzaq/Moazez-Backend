import { type Storage } from '@google-cloud/storage';
import { ConfigService } from '@nestjs/config';
import { GoogleAuth, Impersonated } from 'google-auth-library';
import { PassThrough, Readable } from 'node:stream';
import {
  DefaultGcsClientFactory,
  GcsAdapter,
  type GcsClientFactory,
} from '../gcs.adapter';
import { ObjectStorageError } from '../object-storage.errors';

const NOW = new Date('2026-08-10T12:00:00.000Z');

describe('GcsAdapter object operations', () => {
  it('streams Buffer, string, and Readable uploads with metadata intact', async () => {
    const harness = createHarness();

    await harness.adapter.putObject({
      bucket: 'private-bucket',
      objectKey: 'buffer.bin',
      body: Buffer.from('buffer-body'),
      contentType: 'application/octet-stream',
      metadata: { owner: 'school-1' },
    });
    await harness.adapter.putObject({
      bucket: 'private-bucket',
      objectKey: 'string.txt',
      body: 'string-body',
      contentType: 'text/plain',
    });
    await harness.adapter.putObject({
      bucket: 'private-bucket',
      objectKey: 'stream.bin',
      body: Readable.from([Buffer.from('stream-'), Buffer.from('body')]),
      sizeBytes: 11,
    });

    expect(harness.uploadedBodies.map((body) => body.toString())).toEqual([
      'buffer-body',
      'string-body',
      'stream-body',
    ]);
    expect(harness.runtimeFile.createWriteStream).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        resumable: false,
        contentType: 'application/octet-stream',
        metadata: {
          contentType: 'application/octet-stream',
          metadata: { owner: 'school-1' },
        },
      }),
    );
    expect(harness.runtimeFile.createWriteStream).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ resumable: true }),
    );
  });

  it('normalizes put results and object metadata without leaking SDK shapes', async () => {
    const harness = createHarness();

    await expect(
      harness.adapter.putObject({
        bucket: 'private-bucket',
        objectKey: 'object.pdf',
        body: Buffer.from('pdf'),
      }),
    ).resolves.toEqual({
      etag: 'gcs-etag',
      generation: '42',
      version: null,
    });

    await expect(
      harness.adapter.statObject({
        bucket: 'private-bucket',
        objectKey: 'object.pdf',
      }),
    ).resolves.toEqual({
      size: 11,
      etag: 'gcs-etag',
      contentType: 'application/pdf',
      metadata: { owner: 'school-1' },
      lastModified: new Date('2026-08-10T10:00:00.000Z'),
      generation: '42',
      version: null,
    });
  });

  it('streams reads and preserves idempotent current-coordinate deletion', async () => {
    const harness = createHarness();
    harness.runtimeFile.createReadStream.mockReturnValue(
      Readable.from([Buffer.from('object-bytes')]),
    );

    const stream = await harness.adapter.getObject({
      bucket: 'private-bucket',
      objectKey: 'object.bin',
    });
    await expect(readAll(stream)).resolves.toEqual(Buffer.from('object-bytes'));

    await expect(
      harness.adapter.deleteObject({
        bucket: 'private-bucket',
        objectKey: 'object.bin',
      }),
    ).resolves.toBeUndefined();
    expect(harness.runtimeFile.delete).toHaveBeenCalledWith({
      ignoreNotFound: true,
    });
  });

  it('normalizes asynchronous read-stream provider failures', async () => {
    const harness = createHarness();
    const source = new PassThrough();
    harness.runtimeFile.createReadStream.mockReturnValue(source);
    const stream = await harness.adapter.getObject({
      bucket: 'private-bucket',
      objectKey: 'missing.bin',
    });
    const error = new Promise<unknown>((resolve) =>
      stream.once('error', resolve),
    );

    source.destroy({ code: 404 } as unknown as Error);

    await expect(error).resolves.toEqual(new ObjectStorageError('not_found'));
  });

  it('normalizes synchronous read-stream construction failures as rejected promises', async () => {
    const harness = createHarness();
    harness.runtimeFile.createReadStream.mockImplementationOnce(() => {
      throw Object.assign(new Error('private provider detail'), { code: 404 });
    });

    await expect(
      harness.adapter.getObject({
        bucket: 'private-bucket',
        objectKey: 'missing.bin',
      }),
    ).rejects.toEqual(new ObjectStorageError('not_found'));
  });

  it('supports existence and opaque native-token pagination', async () => {
    const harness = createHarness();
    harness.runtimeFile.exists.mockResolvedValueOnce([true]);
    harness.runtimeBucket.getFiles
      .mockResolvedValueOnce([
        [
          {
            name: 'schools/a',
            metadata: {
              size: '7',
              updated: '2026-08-10T10:00:00.000Z',
            },
          },
        ],
        { pageToken: 'native-secret-page-token' },
      ])
      .mockResolvedValueOnce([[], null]);

    await expect(
      harness.adapter.objectExists({
        bucket: 'private-bucket',
        objectKey: 'schools/a',
      }),
    ).resolves.toBe(true);
    const page = await harness.adapter.listObjectsPage({
      bucket: 'private-bucket',
      prefix: 'schools/',
      limit: 100,
    });
    expect(page.objects).toEqual([
      {
        objectKey: 'schools/a',
        size: 7,
        lastModified: new Date('2026-08-10T10:00:00.000Z'),
      },
    ]);
    expect(typeof page.nextCursor).toBe('string');
    expect(page.nextCursor).not.toContain('native-secret-page-token');

    await harness.adapter.listObjectsPage({
      bucket: 'private-bucket',
      prefix: 'schools/',
      cursor: page.nextCursor ?? undefined,
      limit: 100,
    });
    expect(harness.runtimeBucket.getFiles).toHaveBeenLastCalledWith({
      prefix: 'schools/',
      maxResults: 100,
      autoPaginate: false,
      pageToken: 'native-secret-page-token',
    });
  });

  it('performs read-only readiness against the bounded readiness client', async () => {
    const harness = createHarness();
    harness.readinessBucket.exists.mockResolvedValue([true]);

    await expect(
      harness.adapter.isBucketAvailable('private-bucket'),
    ).resolves.toBe(true);
    expect(harness.readinessClient.bucket).toHaveBeenCalledWith(
      'private-bucket',
    );
    expect(harness.runtimeClient.bucket).not.toHaveBeenCalledWith(
      'private-bucket',
    );
    expect(harness.createBucket).not.toHaveBeenCalled();
  });

  it('normalizes GCS provider failures', async () => {
    const harness = createHarness();
    harness.runtimeFile.getMetadata.mockRejectedValueOnce({
      code: 404,
      message: 'private provider detail',
    });

    await expect(
      harness.adapter.statObject({
        bucket: 'private-bucket',
        objectKey: 'missing',
      }),
    ).rejects.toEqual(new ObjectStorageError('not_found'));
  });
});

describe('GcsAdapter keyless signed capabilities', () => {
  it('uses a lazy, separate dedicated signer for V4 GET and PUT URLs', async () => {
    const harness = createHarness();

    expect(harness.createSigningClient).not.toHaveBeenCalled();
    expect(harness.config.getOrThrow).not.toHaveBeenCalledWith(
      'GCS_SIGNING_SERVICE_ACCOUNT',
    );

    await expect(
      harness.adapter.createSignedGetUrl({
        bucket: 'private-bucket',
        objectKey: 'final/video.mp4',
        expiresInSeconds: 300,
        overrides: {
          contentType: 'video/mp4',
          contentDisposition: 'inline',
        },
      }),
    ).resolves.toEqual({
      url: 'https://storage.invalid/signed',
      expiresAt: new Date('2026-08-10T12:05:00.000Z'),
    });

    await expect(
      harness.adapter.createSignedPutUrl({
        bucket: 'private-bucket',
        objectKey: 'staging/upload-id',
        expiresInSeconds: 3_600,
      }),
    ).resolves.toEqual({
      url: 'https://storage.invalid/signed',
      expiresAt: new Date('2026-08-10T13:00:00.000Z'),
    });

    expect(harness.createSigningClient).toHaveBeenCalledTimes(1);
    expect(harness.createSigningClient).toHaveBeenCalledWith({
      projectId: 'moazez-test-project',
      signerServiceAccount:
        'moazez-gcs-signer@moazez-test-project.iam.gserviceaccount.com',
    });
    expect(harness.signingClient).not.toBe(harness.runtimeClient);
    expect(harness.signingFile.getSignedUrl).toHaveBeenNthCalledWith(1, {
      version: 'v4',
      action: 'read',
      expires: new Date('2026-08-10T12:05:00.000Z'),
      responseType: 'video/mp4',
      responseDisposition: 'inline',
    });
    expect(harness.signingFile.getSignedUrl).toHaveBeenNthCalledWith(2, {
      version: 'v4',
      action: 'write',
      expires: new Date('2026-08-10T13:00:00.000Z'),
    });
    expect(harness.config.getOrThrow).not.toHaveBeenCalledWith(
      'GOOGLE_APPLICATION_CREDENTIALS',
    );
    expect(harness.config.getOrThrow).not.toHaveBeenCalledWith(
      'STORAGE_SECRET_KEY',
    );
  });

  it('rejects any signed capability above the locked one-hour maximum', async () => {
    const harness = createHarness();

    await expect(
      harness.adapter.createSignedGetUrl({
        bucket: 'private-bucket',
        objectKey: 'object',
        expiresInSeconds: 3_601,
      }),
    ).rejects.toThrow('storage_signed_url_ttl_invalid');
    expect(harness.createSigningClient).not.toHaveBeenCalled();
  });
});

describe('DefaultGcsClientFactory keyless authentication', () => {
  it('builds the signing Storage client with an impersonated target and no key material', async () => {
    const getClient = jest
      .spyOn(GoogleAuth.prototype, 'getClient')
      .mockResolvedValue({} as never);
    const factory = new DefaultGcsClientFactory();

    let signingClient: Storage;
    try {
      signingClient = await factory.createSigningClient({
        projectId: 'moazez-test-project',
        signerServiceAccount:
          'moazez-gcs-signer@moazez-test-project.iam.gserviceaccount.com',
      });
    } finally {
      getClient.mockRestore();
    }

    const signer = await signingClient.authClient.getClient();
    expect(signer).toBeInstanceOf(Impersonated);
    expect((signer as Impersonated).getTargetPrincipal()).toBe(
      'moazez-gcs-signer@moazez-test-project.iam.gserviceaccount.com',
    );
    expect(signer).not.toHaveProperty('key');
    expect(signer).not.toHaveProperty('keyFile');
  });
});

function createHarness() {
  const uploadedBodies: Buffer[] = [];
  const runtimeFile = {
    createWriteStream: jest.fn(() => {
      const stream = new PassThrough();
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: unknown) => chunks.push(toBuffer(chunk)));
      stream.once('finish', () => uploadedBodies.push(Buffer.concat(chunks)));
      return stream;
    }),
    getMetadata: jest.fn().mockResolvedValue([
      {
        size: '11',
        etag: 'gcs-etag',
        contentType: 'application/pdf; charset=binary',
        metadata: { owner: 'school-1' },
        updated: '2026-08-10T10:00:00.000Z',
        generation: '42',
      },
    ]),
    createReadStream: jest.fn(),
    delete: jest.fn().mockResolvedValue([{}]),
    exists: jest.fn(),
  };
  const runtimeBucket = {
    file: jest.fn(() => runtimeFile),
    getFiles: jest.fn(),
  };
  const createBucket = jest.fn();
  const runtimeClient = {
    bucket: jest.fn(() => runtimeBucket),
    createBucket,
  };
  const readinessBucket = { exists: jest.fn() };
  const readinessClient = {
    bucket: jest.fn(() => readinessBucket),
  };
  const signingFile = {
    getSignedUrl: jest
      .fn()
      .mockResolvedValue(['https://storage.invalid/signed']),
  };
  const signingClient = {
    bucket: jest.fn(() => ({ file: jest.fn(() => signingFile) })),
  };
  const createSigningClient = jest.fn(
    (): Promise<Storage> =>
      Promise.resolve(signingClient as unknown as Storage),
  );
  const factory = {
    createRuntimeClient: jest.fn(() => runtimeClient as unknown as Storage),
    createReadinessClient: jest.fn(() => readinessClient as unknown as Storage),
    createSigningClient,
  } as jest.Mocked<GcsClientFactory>;
  const values: Record<string, string> = {
    GCP_PROJECT_ID: 'moazez-test-project',
    GCS_SIGNING_SERVICE_ACCOUNT:
      'moazez-gcs-signer@moazez-test-project.iam.gserviceaccount.com',
  };
  const config = {
    getOrThrow: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService & { getOrThrow: jest.Mock };
  const adapter = new GcsAdapter(config, factory, () => NOW);

  return {
    adapter,
    config,
    factory,
    runtimeClient,
    runtimeBucket,
    runtimeFile,
    readinessClient,
    readinessBucket,
    signingClient,
    signingFile,
    createSigningClient,
    createBucket,
    uploadedBodies,
  };
}

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<unknown>) {
    chunks.push(toBuffer(chunk));
  }
  return Buffer.concat(chunks);
}

function toBuffer(chunk: unknown): Buffer {
  if (typeof chunk === 'string') return Buffer.from(chunk);
  if (chunk instanceof Uint8Array) return Buffer.from(chunk);
  throw new TypeError('unexpected_stream_chunk');
}
