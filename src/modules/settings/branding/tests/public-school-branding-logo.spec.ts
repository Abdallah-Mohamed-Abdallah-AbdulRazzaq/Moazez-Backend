import { once } from 'node:events';
import { PassThrough, Readable } from 'node:stream';
import { ConfigService } from '@nestjs/config';
import { FileVisibility } from '@prisma/client';
import type { Request, Response } from 'express';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../../../common/context/request-context';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import { GetPublicSchoolBrandingLogoUseCase } from '../application/get-public-school-branding-logo.use-case';
import { ResolveSchoolLogoUrlService } from '../application/resolve-school-logo-url.service';
import { PublicSchoolBrandingController } from '../controller/public-school-branding.controller';
import { PublicBrandingLogoServiceUnavailableException } from '../domain/branding-logo.errors';
import { BrandingRepository } from '../infrastructure/branding.repository';

const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
const FILE_ID = '22222222-2222-4222-8222-222222222222';
const VALID_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const VALID_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==',
  'base64',
);

describe('school branding logo resolver', () => {
  it.each(['https://api.example.com', 'https://api.example.com/'])(
    'builds an absolute canonical managed URL from APP_URL %s',
    async (appUrl) => {
      const resolver = createResolver({ appUrl });
      const value = await resolver.resolveForSchool(SCHOOL_ID);

      expect(value).toMatch(
        new RegExp(
          `^https://api\\.example\\.com/api/v1/public/schools/${SCHOOL_ID}/branding/logo\\?v=[A-Za-z0-9_-]+$`,
        ),
      );
      expect(value).not.toContain('//api/v1');
      expect(value).not.toContain(FILE_ID);
    },
  );

  it('fails closed for cross-organization metadata', async () => {
    const resolver = createResolver({ fileOrganizationId: 'org-2' });
    await expect(resolver.resolveForSchool(SCHOOL_ID)).resolves.toBeNull();
    await expect(
      resolver.findEligibleManagedFile(SCHOOL_ID),
    ).resolves.toBeNull();
  });

  it.each([
    [{ schoolId: 'different-school' }, 'cross-school'],
    [{ deletedAt: new Date() }, 'deleted'],
    [{ visibility: FileVisibility.PUBLIC }, 'public visibility'],
    [{ bucket: 'wrong-bucket' }, 'wrong bucket'],
    [{ objectKey: 'schools/other/prefix/logo.png' }, 'wrong prefix'],
    [{ mimeType: 'image/svg+xml' }, 'unsupported MIME'],
    [{ sizeBytes: 0n }, 'invalid size'],
  ])('fails closed for %s managed metadata (%s)', async (fileOverrides) => {
    const resolver = createResolver({ fileOverrides });
    await expect(resolver.resolveForSchool(SCHOOL_ID)).resolves.toBeNull();
  });

  it('uses a safe HTTPS legacy fallback and rejects protected legacy values', async () => {
    const safe = createResolver({
      managed: false,
      legacyUrl: 'https://cdn.example.com/logo.png',
    });
    await expect(safe.resolveForSchool(SCHOOL_ID)).resolves.toBe(
      'https://cdn.example.com/logo.png',
    );

    const protectedValue = createResolver({
      managed: false,
      legacyUrl: `https://api.example.com/api/v1/files/${FILE_ID}/download`,
    });
    await expect(
      protectedValue.resolveForSchool(SCHOOL_ID),
    ).resolves.toBeNull();
  });

  it('rejects a non-HTTPS production APP_URL rather than deriving a request host', async () => {
    const resolver = createResolver({
      appUrl: 'http://internal-api:3000',
      environment: 'production',
    });
    await expect(resolver.resolveForSchool(SCHOOL_ID)).rejects.toThrow(
      'invalid_external_app_url',
    );
  });

  it('rejects a private production APP_URL', async () => {
    const resolver = createResolver({
      appUrl: 'https://10.0.0.8',
      environment: 'production',
    });
    await expect(resolver.resolveForSchool(SCHOOL_ID)).rejects.toThrow(
      'invalid_external_app_url',
    );
  });

  it.each([
    'https://api',
    'https://api.internal',
    'https://api.test',
    'https://user:secret@api.school-domain.com',
    'https://[::ffff:192.168.1.4]',
  ])('rejects known non-public production APP_URL form %s', async (appUrl) => {
    const resolver = createResolver({ appUrl, environment: 'production' });
    await expect(resolver.resolveForSchool(SCHOOL_ID)).rejects.toThrow(
      'invalid_external_app_url',
    );
  });
});

describe('public school branding logo delivery', () => {
  it.each([
    ['image/png', VALID_PNG],
    ['image/jpeg', VALID_JPEG],
  ] as const)(
    'streams exact-length %s bytes with no storage URL',
    async (mimeType, image) => {
      const { useCase } = createPublicUseCase({
        stream: Readable.from(image),
        storedSize: image.byteLength,
        fileSize: image.byteLength,
        mimeType,
      });
      const result = await useCase.execute(SCHOOL_ID);
      const chunks: Buffer[] = [];
      for await (const chunk of result.stream) chunks.push(Buffer.from(chunk));

      expect(Buffer.concat(chunks)).toEqual(image);
      expect(result).toMatchObject({
        mimeType,
        sizeBytes: image.byteLength,
      });
      expect(result).not.toHaveProperty('bucket');
      expect(result).not.toHaveProperty('objectKey');
      expect(result).not.toHaveProperty('fileId');
    },
  );

  it('detects an empty stream and early close as initialization failures', async () => {
    const empty = createPublicUseCase({ stream: Readable.from([]) });
    await expect(empty.useCase.execute(SCHOOL_ID)).rejects.toMatchObject({
      code: 'service_unavailable',
      httpStatus: 503,
    });

    const earlyCloseStream = new PassThrough();
    const earlyClose = createPublicUseCase({ stream: earlyCloseStream });
    const execution = earlyClose.useCase.execute(SCHOOL_ID);
    earlyCloseStream.destroy();
    await expect(execution).rejects.toMatchObject({
      code: 'service_unavailable',
      httpStatus: 503,
    });
  });

  it('detects short clean EOF, extra bytes, and mid-stream operational failure', async () => {
    const short = createPublicUseCase({
      stream: Readable.from(Buffer.from('short')),
    });
    const shortResult = await short.useCase.execute(SCHOOL_ID);
    await expect(consume(shortResult.stream)).rejects.toThrow(
      'storage_stream_byte_count_short',
    );

    const extra = createPublicUseCase({
      stream: Readable.from([Buffer.from('image-byte'), Buffer.from('sx')]),
    });
    const extraResult = await extra.useCase.execute(SCHOOL_ID);
    await expect(consume(extraResult.stream)).rejects.toThrow(
      'storage_stream_byte_count_exceeded',
    );

    const midStream = createPublicUseCase({
      stream: Readable.from(
        (async function* () {
          yield Buffer.from('image');
          throw new Error('operational stream failure');
        })(),
      ),
    });
    const midStreamResult = await midStream.useCase.execute(SCHOOL_ID);
    await expect(consume(midStreamResult.stream)).rejects.toThrow(
      'operational stream failure',
    );
  });

  it('streams matching private object bytes with no storage URL', async () => {
    const { useCase } = createPublicUseCase();
    const result = await useCase.execute(SCHOOL_ID);
    const chunks: Buffer[] = [];
    for await (const chunk of result.stream) chunks.push(Buffer.from(chunk));

    expect(Buffer.concat(chunks).toString()).toBe('image-bytes');
    expect(result).toMatchObject({ mimeType: 'image/png', sizeBytes: 11 });
    expect(result).not.toHaveProperty('bucket');
    expect(result).not.toHaveProperty('objectKey');
    expect(result).not.toHaveProperty('fileId');
  });

  it('returns safe 404 for ineligible metadata, absent objects, and metadata mismatch', async () => {
    const ineligible = createPublicUseCase({ eligible: false });
    await expect(ineligible.useCase.execute(SCHOOL_ID)).rejects.toMatchObject({
      code: 'not_found',
    });

    const absent = createPublicUseCase({
      statError: Object.assign(new Error('absent'), { code: 'NoSuchKey' }),
    });
    await expect(absent.useCase.execute(SCHOOL_ID)).rejects.toMatchObject({
      code: 'not_found',
    });

    const mismatch = createPublicUseCase({ storedSize: 12 });
    await expect(mismatch.useCase.execute(SCHOOL_ID)).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('distinguishes operational storage failure and stream initialization failure', async () => {
    const unavailable = createPublicUseCase({
      statError: Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }),
    });
    await expect(unavailable.useCase.execute(SCHOOL_ID)).rejects.toMatchObject({
      code: 'service_unavailable',
      httpStatus: 503,
    });

    const failedStream = new Readable({
      read() {
        this.destroy(new Error('stream initialization failed'));
      },
    });
    const initializationFailure = createPublicUseCase({ stream: failedStream });
    await expect(
      initializationFailure.useCase.execute(SCHOOL_ID),
    ).rejects.toMatchObject({ code: 'service_unavailable', httpStatus: 503 });
  });

  it('terminates a mid-stream failure without attempting a second response', async () => {
    const stream = new PassThrough();
    const getPublicLogo = {
      execute: jest.fn().mockResolvedValue({
        stream,
        mimeType: 'image/png',
        sizeBytes: 10,
      }),
    } as unknown as GetPublicSchoolBrandingLogoUseCase;
    const controller = new PublicSchoolBrandingController(getPublicLogo);
    const responseStream = new PassThrough() as PassThrough & {
      status: jest.Mock;
      setHeader: jest.Mock;
      json: jest.Mock;
    };
    responseStream.status = jest.fn().mockReturnValue(responseStream);
    responseStream.setHeader = jest.fn();
    responseStream.json = jest.fn();
    const responseDestroy = jest.spyOn(responseStream, 'destroy');

    const delivery = controller.getLogo(
      SCHOOL_ID,
      {} as Request,
      responseStream as unknown as Response,
    );
    await Promise.resolve();
    stream.emit('error', new Error('mid-stream'));
    await delivery;

    expect(responseDestroy).toHaveBeenCalled();
    expect(responseStream.status).toHaveBeenCalledTimes(1);
    expect(responseStream.json).not.toHaveBeenCalled();
  });

  it('cancels the underlying storage iterator when delivery is abandoned', async () => {
    const source = new PassThrough();
    const iterator = source[Symbol.asyncIterator]();
    const iteratorReturn = jest.spyOn(iterator, 'return');
    jest.spyOn(source, Symbol.asyncIterator).mockReturnValue(iterator);
    source.write(Buffer.from('image'));
    const { useCase } = createPublicUseCase({
      stream: source,
      storedSize: 11,
      fileSize: 11,
    });

    const result = await useCase.execute(SCHOOL_ID);
    const closed = once(result.stream, 'close');
    result.stream.destroy();
    await closed;

    await eventually(() => expect(iteratorReturn).toHaveBeenCalledTimes(1));
    expect(source.destroyed).toBe(true);
  });

  it('marks operational 503 responses non-cacheable', async () => {
    const getPublicLogo = {
      execute: jest
        .fn()
        .mockRejectedValue(new PublicBrandingLogoServiceUnavailableException()),
    } as unknown as GetPublicSchoolBrandingLogoUseCase;
    const controller = new PublicSchoolBrandingController(getPublicLogo);
    const response = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;
    const request = {} as Request;

    await expect(
      runWithRequestContext(createRequestContext('request-1'), () =>
        controller.getLogo(SCHOOL_ID, request, response),
      ),
    ).resolves.toBeUndefined();
    expect(response.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'no-store',
    );
    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'service_unavailable',
        message: 'Service temporarily unavailable',
        traceId: 'request-1',
      },
    });
  });
});

function createResolver(options?: {
  appUrl?: string;
  environment?: string;
  managed?: boolean;
  legacyUrl?: string | null;
  fileOrganizationId?: string;
  fileOverrides?: Record<string, unknown>;
}) {
  const repository = {
    findLogoResolutionRecords: jest.fn().mockResolvedValue([
      {
        id: SCHOOL_ID,
        organizationId: 'org-1',
        schoolProfile: {
          logoUrl: options?.legacyUrl ?? null,
          logoFile:
            options?.managed === false
              ? null
              : {
                  ...managedFile(options?.fileOrganizationId),
                  ...(options?.fileOverrides ?? {}),
                },
        },
      },
    ]),
  } as unknown as BrandingRepository;
  const values: Record<string, string> = {
    APP_URL: options?.appUrl ?? 'https://api.example.com',
    NODE_ENV: options?.environment ?? 'test',
    STORAGE_BUCKET: 'private-bucket',
  };
  const config = {
    getOrThrow: jest.fn((key: string) => values[key]),
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
  return new ResolveSchoolLogoUrlService(repository, config);
}

function createPublicUseCase(options?: {
  eligible?: boolean;
  statError?: Error;
  storedSize?: number;
  fileSize?: number;
  stream?: Readable;
  mimeType?: 'image/png' | 'image/jpeg';
}) {
  const mimeType = options?.mimeType ?? 'image/png';
  const sizeBytes = options?.fileSize ?? 11;
  const resolver = {
    findEligibleManagedFile: jest
      .fn()
      .mockResolvedValue(
        options?.eligible === false
          ? null
          : managedFile('org-1', { mimeType, sizeBytes: BigInt(sizeBytes) }),
      ),
  } as unknown as ResolveSchoolLogoUrlService;
  const storage = {
    statObject: options?.statError
      ? jest.fn().mockRejectedValue(options.statError)
      : jest.fn().mockResolvedValue({
          size: options?.storedSize ?? 11,
          metaData: { 'content-type': mimeType },
        }),
    getObject: jest
      .fn()
      .mockResolvedValue(
        options?.stream ?? Readable.from(Buffer.from('image-bytes')),
      ),
  } as unknown as StorageService;
  return {
    useCase: new GetPublicSchoolBrandingLogoUseCase(resolver, storage),
  };
}

function managedFile(
  organizationId = 'org-1',
  overrides: Record<string, unknown> = {},
) {
  return {
    id: FILE_ID,
    organizationId,
    schoolId: SCHOOL_ID,
    bucket: 'private-bucket',
    objectKey: `schools/${SCHOOL_ID}/branding/logos/logo.png`,
    mimeType: 'image/png' as const,
    sizeBytes: 11n,
    visibility: FileVisibility.PRIVATE,
    deletedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

async function consume(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function eventually(assertion: () => void): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      assertion();
      return;
    } catch {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }
  assertion();
}
