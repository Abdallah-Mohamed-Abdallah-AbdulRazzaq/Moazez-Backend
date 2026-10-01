import { Logger } from '@nestjs/common';
import type { Response } from 'express';
import { Readable, Writable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import { ObjectStorageError } from '../object-storage.errors';
import { streamPrivateMediaContent } from '../private-media-content.response';
import { PrivateMediaContentService } from '../private-media-content.service';
import { StorageService } from '../storage.service';

const descriptor = {
  bucket: 'private-test',
  objectKey: 'internal/test-file',
  originalName: 'test.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 6n,
};

function setup() {
  const source = Readable.from([Buffer.from('abc'), Buffer.from('def')]);
  const storage = {
    statObject: jest
      .fn()
      .mockResolvedValue({ size: 6, contentType: 'provider/type' }),
    getObject: jest.fn().mockResolvedValue(source),
    createDownloadUrl: jest.fn(),
    readObjectRange: jest.fn(),
  };
  const service = new PrivateMediaContentService(
    storage as unknown as StorageService,
  );
  const notFound = () =>
    new NotFoundDomainException('Feature attachment not found');
  return { service, storage, source, notFound };
}

describe('PrivateMediaContentService', () => {
  it('stats before reading and returns only File metadata and incremental bytes without signing', async () => {
    const { service, storage, notFound } = setup();
    let produced = 0;
    const source = Readable.from(
      (async function* () {
        for (let index = 0; index < 100; index++) {
          produced++;
          yield Buffer.alloc(1024, index);
        }
      })(),
      { objectMode: false, highWaterMark: 1024 },
    );
    storage.statObject.mockResolvedValue({ size: 102400 });
    storage.getObject.mockResolvedValue(source);
    const content = await service.open(
      { ...descriptor, sizeBytes: 102400n },
      notFound,
    );
    expect(storage.statObject).toHaveBeenCalledWith({
      bucket: descriptor.bucket,
      objectKey: descriptor.objectKey,
    });
    expect(storage.statObject.mock.invocationCallOrder[0]).toBeLessThan(
      storage.getObject.mock.invocationCallOrder[0],
    );
    expect(produced).toBeLessThan(100);
    expect(content).toMatchObject({
      mimeType: descriptor.mimeType,
      sizeBytes: 102400,
      originalName: descriptor.originalName,
    });
    expect(Object.keys(content).sort()).toEqual([
      'mimeType',
      'originalName',
      'sizeBytes',
      'stream',
    ]);
    let received = 0;
    for await (const chunk of content.stream)
      received += (chunk as Buffer).byteLength;
    expect(received).toBe(102400);
    expect(source.destroyed).toBe(true);
    expect(storage.createDownloadUrl).not.toHaveBeenCalled();
    expect(storage.readObjectRange).not.toHaveBeenCalled();
  });

  it('maps missing objects to the feature safe not-found error', async () => {
    const { service, storage, notFound } = setup();
    storage.statObject.mockRejectedValue(new ObjectStorageError('not_found'));
    await expect(service.open(descriptor, notFound)).rejects.toMatchObject({
      code: 'not_found',
      httpStatus: 404,
      message: 'Feature attachment not found',
      details: undefined,
    });
    expect(storage.getObject).not.toHaveBeenCalled();
  });

  it('rejects size mismatch before starting a read', async () => {
    const { service, storage, notFound } = setup();
    storage.statObject.mockResolvedValue({ size: 7 });
    await expect(service.open(descriptor, notFound)).rejects.toMatchObject({
      code: 'not_found',
      httpStatus: 404,
    });
    expect(storage.getObject).not.toHaveBeenCalled();
  });

  it.each(['stat', 'get', 'first byte'])(
    'sanitizes a provider failure during %s as 503 without retaining its cause',
    async (stage) => {
      const { service, storage, notFound } = setup();
      const raw = new Error(
        'credentials bucket internal/test-file https://storage.googleapis.com/provider',
      );
      if (stage === 'stat') storage.statObject.mockRejectedValue(raw);
      if (stage === 'get') storage.getObject.mockRejectedValue(raw);
      if (stage === 'first byte')
        storage.getObject.mockResolvedValue(
          Readable.from(
            (async function* () {
              throw raw;
              yield Buffer.from('never');
            })(),
          ),
        );
      const failure: unknown = await service
        .open(descriptor, notFound)
        .catch((error: unknown) => error);
      expect(failure).toMatchObject({
        code: 'service_unavailable',
        httpStatus: 503,
        message: 'Service temporarily unavailable',
        details: undefined,
      });
      expect(failure).not.toHaveProperty('cause');
    },
  );

  it('handles a disappearance after stat without committing a response', async () => {
    const { service, storage, notFound } = setup();
    storage.getObject.mockResolvedValue(
      Readable.from(
        (async function* () {
          throw new ObjectStorageError('not_found');
          yield Buffer.from('never');
        })(),
      ),
    );
    await expect(service.open(descriptor, notFound)).rejects.toMatchObject({
      code: 'not_found',
      httpStatus: 404,
    });
  });

  it('destroys the provider source on an aborted content stream', async () => {
    const { service, storage } = setup();
    const source = new Readable({ read() {} });
    source.push(Buffer.from('abc'));
    storage.getObject.mockResolvedValue(source);
    const content = await service.open(descriptor);
    content.stream.destroy();
    await finished(content.stream).catch(() => undefined);
    expect(source.destroyed).toBe(true);
  });

  it.each([5, 7])(
    'terminates a stream whose actual byte count is %i instead of the descriptor size',
    async (actual) => {
      const { service, storage } = setup();
      const source = Readable.from([
        Buffer.from('abc'),
        Buffer.alloc(actual - 3),
      ]);
      storage.getObject.mockResolvedValue(source);
      const content = await service.open(descriptor);
      await expect(
        (async () => {
          for await (const _chunk of content.stream) {
            /* consume without collecting */
          }
        })(),
      ).rejects.toMatchObject({
        code: 'service_unavailable',
        message: 'Service temporarily unavailable',
      });
      expect(source.destroyed).toBe(true);
    },
  );

  it('destroys both streams on response failure and logs only a fixed event', async () => {
    const { service, source } = setup();
    const content = await service.open(descriptor);
    const response = new Writable({
      write(_chunk, _encoding, callback) {
        callback(new Error('raw provider coordinates'));
      },
    });
    Object.assign(response, { status: jest.fn(), setHeader: jest.fn() });
    const logging = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    try {
      await streamPrivateMediaContent(
        content,
        response as unknown as Response,
        'attachment',
      );
      expect(content.stream.destroyed).toBe(true);
      expect(source.destroyed).toBe(true);
      expect(response.destroyed).toBe(true);
      expect(logging.mock.calls).toEqual([
        [{ event: 'private_media.content.stream_failed' }],
      ]);
    } finally {
      logging.mockRestore();
    }
  });

  it('sanitizes filename headers and preserves Unicode through filename*', async () => {
    const { service } = setup();
    const content = await service.open({
      ...descriptor,
      originalName: 'مرفق"\r\n\\.pdf',
    });
    const response = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    });
    const headers = new Map<string, string>();
    Object.assign(response, {
      status: jest.fn(),
      setHeader: (key: string, value: string) => headers.set(key, value),
    });
    await streamPrivateMediaContent(
      content,
      response as unknown as Response,
      'attachment',
    );
    const header = headers.get('Content-Disposition')!;
    expect(header).not.toMatch(/[\r\n\\]/u);
    expect(header).toContain('filename="____.pdf"');
    expect(header).toContain(
      `filename*=UTF-8''${encodeURIComponent('مرفق.pdf')}`,
    );
    expect(headers.get('Accept-Ranges')).toBeUndefined();
    expect(headers.get('Content-Range')).toBeUndefined();
  });
});
