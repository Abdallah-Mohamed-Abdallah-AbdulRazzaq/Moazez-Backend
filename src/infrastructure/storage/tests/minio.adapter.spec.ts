import { ConfigService } from '@nestjs/config';
import { Readable } from 'node:stream';
import { MinioAdapter } from '../minio.adapter';

describe('MinioAdapter bounded object listing', () => {
  it('stops after one look-ahead item and returns a continuation key', async () => {
    const adapter = createAdapter([
      object('schools/a'),
      object('schools/b'),
      object('schools/c'),
      object('schools/d'),
    ]);

    await expect(
      adapter.listObjectsPage({
        bucket: 'private-bucket',
        prefix: 'schools/',
        startAfter: 'schools/previous',
        limit: 2,
      }),
    ).resolves.toEqual({
      objects: [resultObject('schools/a'), resultObject('schools/b')],
      nextStartAfter: 'schools/b',
    });

    expect(clientOf(adapter).listObjectsV2).toHaveBeenCalledWith(
      'private-bucket',
      'schools/',
      true,
      'schools/previous',
    );
  });

  it('returns no continuation when the listing ends within the bound', async () => {
    const adapter = createAdapter([object('schools/a')]);

    await expect(
      adapter.listObjectsPage({
        bucket: 'private-bucket',
        prefix: 'schools/',
        limit: 100,
      }),
    ).resolves.toEqual({
      objects: [resultObject('schools/a')],
      nextStartAfter: null,
    });
  });
});

function createAdapter(items: ReturnType<typeof object>[]): MinioAdapter {
  const config = {
    getOrThrow: jest.fn((key: string) => {
      const values: Record<string, string> = {
        STORAGE_ENDPOINT: 'http://127.0.0.1:9000',
        STORAGE_ACCESS_KEY: 'test-access-key',
        STORAGE_SECRET_KEY: 'test-secret-key',
      };
      return values[key];
    }),
  } as unknown as ConfigService;
  const adapter = new MinioAdapter(config);
  clientOf(adapter).listObjectsV2 = jest.fn(() =>
    Readable.from(items, { objectMode: true }),
  );
  return adapter;
}

function clientOf(adapter: MinioAdapter) {
  return (
    adapter as unknown as {
      client: { listObjectsV2: jest.Mock };
    }
  ).client;
}

function object(objectKey: string) {
  return {
    name: objectKey,
    objectKey,
    size: 10,
    lastModified: new Date('2026-07-16T00:00:00.000Z'),
  };
}

function resultObject(objectKey: string) {
  return {
    objectKey,
    size: 10,
    lastModified: new Date('2026-07-16T00:00:00.000Z'),
  };
}
