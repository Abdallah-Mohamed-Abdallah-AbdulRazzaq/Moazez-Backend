import { Readable, Writable } from 'node:stream';
import { finished, pipeline } from 'node:stream/promises';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import { ACADEMIC_CONTENT_FILE_TYPES } from '../../../modules/academics/academic-content/files/domain/academic-content-file.registry';
import { PrivateMediaContentService } from '../private-media-content.service';
import { StorageService } from '../storage.service';

const descriptor = {
  bucket: 'test-private',
  objectKey: 'internal-test-key',
  originalName: 'test.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 6n,
};
function serviceFor(source: Readable, size = 6) {
  const storage = {
    statObject: jest.fn().mockResolvedValue({
      size,
      etag: 'original',
      generation: null,
      version: null,
    }),
    getObject: jest.fn().mockResolvedValue(source),
  };
  return {
    storage,
    service: new PrivateMediaContentService(
      storage as unknown as StorageService,
    ),
  };
}
describe('Private media integrity, reauthorization and bounded streaming', () => {
  it.each([512 * 1024 ** 2, 10 * 1024 ** 3])(
    'streams %i logical bytes with fixed chunks and bounded buffers',
    async (size) => {
      const chunk = Buffer.alloc(64 * 1024, 42);
      let produced = 0,
        received = 0,
        maxBuffered = 0;
      const source = Readable.from(
        (function* () {
          for (let offset = 0; offset < size; offset += chunk.length) {
            produced += chunk.length;
            yield chunk;
          }
        })(),
        { objectMode: false, highWaterMark: chunk.length },
      );
      const { storage, service } = serviceFor(source, size);
      const content = await service.open({
        ...descriptor,
        sizeBytes: BigInt(size),
      });
      expect(produced).toBeLessThan(size);
      await pipeline(
        content.stream,
        new Writable({
          highWaterMark: chunk.length,
          write(bytes: Buffer, _encoding, callback) {
            received += bytes.length;
            maxBuffered = Math.max(
              maxBuffered,
              source.readableLength + content.stream.readableLength,
            );
            callback();
          },
        }),
      );
      expect(received).toBe(size);
      expect(maxBuffered).toBeLessThanOrEqual(4 * chunk.length);
      expect(source.destroyed).toBe(true);
      expect(storage.getObject).toHaveBeenCalledTimes(1);
    },
    30_000,
  );
  it.each(ACADEMIC_CONTENT_FILE_TYPES)(
    'streams registered $extension / $mimeType without conversion',
    async (type) => {
      const body = Buffer.from([0, 1, 2, 128, 254, 255]);
      const { service } = serviceFor(Readable.from(body));
      const content = await service.open({
        ...descriptor,
        originalName: 'test' + type.extension,
        mimeType: type.mimeType,
      });
      const chunks: Buffer[] = [];
      for await (const chunk of content.stream as AsyncIterable<Buffer>)
        chunks.push(chunk);
      expect(Buffer.concat(chunks)).toEqual(body);
      expect(content.mimeType).toBe(type.mimeType);
    },
  );
  it('rechecks domain authority after the provider first byte and before delivery', async () => {
    const source = new Readable({ read() {} });
    const { service } = serviceFor(source);
    const resolve = jest
      .fn()
      .mockResolvedValueOnce(descriptor)
      .mockRejectedValueOnce(new NotFoundDomainException());
    const pending = service.openAuthorized(
      resolve,
      () => new NotFoundDomainException(),
    );
    await new Promise<void>((done) => setImmediate(done));
    source.push(Buffer.from('abcdef'));
    source.push(null);
    await expect(pending).rejects.toMatchObject({ httpStatus: 404 });
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(source.destroyed).toBe(true);
  });
  it.each([{ head: true }, { range: 'bytes=9-' }])(
    'reauthorizes metadata-only requests %j',
    async (options) => {
      const { service, storage } = serviceFor(
        Readable.from(Buffer.from('abcdef')),
      );
      const resolve = jest
        .fn()
        .mockResolvedValueOnce(descriptor)
        .mockRejectedValueOnce(new NotFoundDomainException());
      await expect(
        service.openAuthorized(
          resolve,
          () => new NotFoundDomainException(),
          options,
        ),
      ).rejects.toMatchObject({ httpStatus: 404 });
      expect(storage.getObject).not.toHaveBeenCalled();
    },
  );
  it('rejects an unversioned object changed between stat and GET snapshot', async () => {
    const source = Readable.from(Buffer.from('abcdef'));
    const { service, storage } = serviceFor(source);
    storage.statObject
      .mockResolvedValueOnce({ size: 6, etag: 'old' })
      .mockResolvedValueOnce({ size: 6, etag: 'new' });
    await expect(service.open(descriptor)).rejects.toMatchObject({
      httpStatus: 404,
    });
    expect(source.destroyed).toBe(true);
  });
  it('cancels initialization and destroys a late provider stream', async () => {
    const source = new Readable({ read() {} });
    const controller = new AbortController();
    const { service, storage } = serviceFor(source);
    let resolveProvider!: (stream: Readable) => void;
    storage.getObject.mockReturnValue(
      new Promise<Readable>((resolve) => {
        resolveProvider = resolve;
      }),
    );
    const pending = service.open(descriptor, undefined, {
      signal: controller.signal,
    });
    await new Promise<void>((done) => setImmediate(done));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ httpStatus: 503 });
    resolveProvider(source);
    await new Promise<void>((done) => setImmediate(done));
    expect(source.destroyed).toBe(true);
  });
  it('propagates response cancellation to an active provider without consuming the rest', async () => {
    const source = new Readable({ read() {} });
    source.push(Buffer.from('abc'));
    const controller = new AbortController();
    const { service } = serviceFor(source);
    const content = await service.open(descriptor, undefined, {
      signal: controller.signal,
    });
    controller.abort();
    await finished(content.stream).catch(() => undefined);
    expect(content.stream.destroyed).toBe(true);
    expect(source.destroyed).toBe(true);
  });
  it('withholds final advertised bytes on excess data or a provider failure after the final chunk', async () => {
    for (const excess of [true, false]) {
      const source = Readable.from(
        (function* () {
          yield Buffer.from('abc');
          yield Buffer.from('def');
          if (excess) yield Buffer.from('g');
          else throw new Error('private-provider-coordinates');
        })(),
      );
      const { service } = serviceFor(source);
      const content = await service.open(descriptor);
      let received = 0;
      await expect(
        (async () => {
          for await (const chunk of content.stream as AsyncIterable<Buffer>)
            received += chunk.length;
        })(),
      ).rejects.toMatchObject({ code: 'service_unavailable' });
      expect(received).toBeLessThan(6);
      expect(source.destroyed).toBe(true);
    }
  });
});
