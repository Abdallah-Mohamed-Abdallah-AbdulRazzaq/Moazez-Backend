import { Controller, Get, Req, Res } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Request, Response } from 'express';
import { Readable } from 'node:stream';
import request from 'supertest';
import { GlobalExceptionFilter } from '../../../common/exceptions/global-exception.filter';
import {
  createApplicationCorsOptions,
  APPROVED_PRODUCTION_APPLICATION_ORIGINS,
} from '../../../bootstrap/application-cors.policy';
import {
  privateMediaContentRequest,
  streamPrivateMediaContent,
} from '../private-media-content.response';
import { PrivateMediaContentService } from '../private-media-content.service';
import { resolvePrivateMediaRange } from '../private-media-range';
import { StorageService } from '../storage.service';

const bytes = Buffer.from('0123456789');
const file = {
  bucket: 'private-test',
  objectKey: 'internal-key',
  originalName: 'مرفق.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 10n,
};
@Controller('content')
class ContentController {
  constructor(private readonly content: PrivateMediaContentService) {}
  @Get()
  async get(@Req() req: Request, @Res() res: Response) {
    const result = await this.content.open(
      file,
      undefined,
      privateMediaContentRequest(req, res, 'attachment'),
    );
    await streamPrivateMediaContent(result, res, 'attachment');
  }
}
describe('Private media streamed HTTP ranges', () => {
  const storage = {
    statObject: jest.fn().mockResolvedValue({
      size: 10,
      etag: 'storage-etag',
      generation: '1234567890123456789',
      version: null,
    }),
    getObject: jest.fn(
      (input: { range?: { offset: number; length: number } }) =>
        Promise.resolve(
          Readable.from(
            input.range
              ? bytes.subarray(
                  input.range.offset,
                  input.range.offset + input.range.length,
                )
              : bytes,
          ),
        ),
    ),
  };
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ContentController],
      providers: [
        PrivateMediaContentService,
        { provide: StorageService, useValue: storage },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.enableCors(
      createApplicationCorsOptions(APPROVED_PRODUCTION_APPLICATION_ORIGINS),
    );
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());
  it('returns full bytes and safe headers without a redirect', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/content')
      .expect(200);
    expect(response.body).toEqual(bytes);
    expect(response.headers).toMatchObject({
      'content-length': '10',
      'content-type': 'application/pdf',
      'cache-control': 'no-store, private, max-age=0',
      'x-content-type-options': 'nosniff',
      'accept-ranges': 'bytes',
    });
    expect(response.headers.location).toBeUndefined();
    expect(response.headers['content-disposition']).toContain(
      'filename*=UTF-8',
    );
    expect(storage.getObject).toHaveBeenCalledWith(
      expect.objectContaining({ raw: true, generation: '1234567890123456789' }),
    );
  });
  it.each([
    ['bytes=2-4', '234', 'bytes 2-4/10'],
    ['bytes=7-', '789', 'bytes 7-9/10'],
    ['bytes=-3', '789', 'bytes 7-9/10'],
    ['bytes=0-999', '0123456789', 'bytes 0-9/10'],
  ])('streams %s as exact 206 bytes', async (range, body, contentRange) => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/content')
      .set('Range', range)
      .expect(206);
    expect(response.body).toEqual(Buffer.from(body));
    expect(response.headers['content-range']).toBe(contentRange);
    expect(response.headers['content-length']).toBe(String(body.length));
    expect(storage.getObject.mock.calls.at(-1)?.[0].range).toEqual(
      resolvePrivateMediaRange(range, bytes.length),
    );
  });
  it.each([
    'bytes=10-',
    'bytes=4-2',
    'bytes=-0',
    'bytes=9007199254740992-',
    'bytes=0-1,4-5',
    'items=0-1',
    'bytes=-',
    'bytes=1.5-2',
    'bytes=0-1e2',
  ])('rejects %s with 416 and no provider stream', async (range) => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/content')
      .set('Range', range)
      .expect(416);
    expect(response.headers['content-range']).toBe('bytes */10');
    expect(response.headers['content-length']).toBe('0');
    expect(storage.getObject).not.toHaveBeenCalled();
  });
  it('supports HEAD with full metadata and no object body read', async () => {
    const response = await request(app.getHttpServer())
      .head('/api/v1/content')
      .set('Range', 'bytes=2-4')
      .expect(200);
    expect(response.headers['content-length']).toBe('10');
    expect(response.text).toBeUndefined();
    expect(storage.getObject).not.toHaveBeenCalled();
  });
  it('matches only a strong opaque If-Range validator; mismatches and dates return full 200', async () => {
    const initial = await request(app.getHttpServer())
      .head('/api/v1/content')
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/content')
      .set('Range', 'bytes=2-4')
      .set('If-Range', String(initial.headers.etag))
      .expect(206);
    for (const value of [
      '"different"',
      'W/' + initial.headers.etag,
      new Date().toUTCString(),
    ]) {
      const response = await request(app.getHttpServer())
        .get('/api/v1/content')
        .set('Range', 'bytes=2-4')
        .set('If-Range', value)
        .expect(200);
      expect(response.body).toEqual(bytes);
    }
  });
  it.each(APPROVED_PRODUCTION_APPLICATION_ORIGINS)(
    'exposes required headers for %s with credentials',
    async (origin) => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/content')
        .set('Origin', origin)
        .expect(200);
      expect(response.headers['access-control-allow-origin']).toBe(origin);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
      expect(response.headers['access-control-expose-headers']).toBe(
        'Content-Disposition,Content-Range,Accept-Ranges,ETag',
      );
    },
  );
  it('does not expose a foreign origin', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/content')
      .set('Origin', 'https://foreign.invalid')
      .expect(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
describe('Private media bounded range/parser and MIME safety', () => {
  it('keeps multi-gigabyte offsets exact without allocating a file buffer', () => {
    expect(resolvePrivateMediaRange('bytes=10737418239-', 10737418240)).toEqual(
      { offset: 10737418239, length: 1 },
    );
    expect(resolvePrivateMediaRange('bytes=-10737418240', 10737418240)).toEqual(
      { offset: 0, length: 10737418240 },
    );
  });
  it.each(['text/html', 'image/svg+xml', 'application/javascript'])(
    'downloads %s as attachment and rejects inline before storage',
    async (mimeType) => {
      const storage = {
        statObject: jest.fn().mockResolvedValue({ size: 10 }),
        getObject: jest.fn().mockResolvedValue(Readable.from(bytes)),
      };
      const service = new PrivateMediaContentService(
        storage as unknown as StorageService,
      );
      await expect(
        service.open({ ...file, mimeType }, undefined, {
          disposition: 'inline',
        }),
      ).rejects.toMatchObject({ httpStatus: 403 });
      expect(storage.statObject).not.toHaveBeenCalled();
      const content = await service.open({ ...file, mimeType });
      for await (const chunk of content.stream) {
        expect(chunk).toBeInstanceOf(Uint8Array);
        /* streaming consumption */
      }
      expect(content.mimeType).toBe(mimeType);
    },
  );
  it('uses octet-stream for a malformed download MIME', async () => {
    const storage = {
      statObject: jest.fn().mockResolvedValue({ size: 10 }),
      getObject: jest.fn().mockResolvedValue(Readable.from(bytes)),
    };
    const content = await new PrivateMediaContentService(
      storage as unknown as StorageService,
    ).open({ ...file, mimeType: 'text/html\r\ninjected' });
    expect(content.mimeType).toBe('application/octet-stream');
    content.stream.destroy();
  });
});
