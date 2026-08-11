import { ConfigService } from '@nestjs/config';
import { PassThrough } from 'node:stream';
import { ObjectStorageError } from '../../../../infrastructure/storage/object-storage.errors';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import {
  MediaVerificationError,
  MediaVerifierService,
} from '../application/media-verifier.service';

describe('MediaVerifierService provider-neutral storage errors', () => {
  it('maps normalized stat absence to the existing object_not_found result', async () => {
    const storage = {
      statObject: jest
        .fn()
        .mockRejectedValue(new ObjectStorageError('not_found')),
    } as unknown as StorageService;
    const verifier = new MediaVerifierService(storage, {} as ConfigService);

    await expect(
      verifier.verify({
        bucket: 'private-bucket',
        objectKey: 'learning-media/staging/upload-id',
        expectedMimeType: 'application/pdf',
        expectedSizeBytes: 1n,
      }),
    ).rejects.toEqual(new MediaVerificationError('object_not_found'));
  });

  it('maps normalized asynchronous stream absence to the same result', async () => {
    const source = new PassThrough();
    const storage = {
      statObject: jest.fn().mockResolvedValue({ size: 1 }),
      getObject: jest.fn(() => {
        setImmediate(() => source.destroy(new ObjectStorageError('not_found')));
        return Promise.resolve(source);
      }),
    } as unknown as StorageService;
    const verifier = new MediaVerifierService(storage, {} as ConfigService);

    await expect(
      verifier.verify({
        bucket: 'private-bucket',
        objectKey: 'learning-media/staging/upload-id',
        expectedMimeType: 'application/pdf',
        expectedSizeBytes: 1n,
      }),
    ).rejects.toEqual(new MediaVerificationError('object_not_found'));
  });
});
