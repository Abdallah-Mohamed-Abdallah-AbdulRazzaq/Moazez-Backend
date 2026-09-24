import {
  FileUploadPurpose,
  FileUploadSessionStatus,
  type FileUploadSession,
} from '@prisma/client';
import { ObjectStorageError } from '../../../../../infrastructure/storage/object-storage.errors';
import {
  AcademicContentFileRejection,
  AcademicContentFileVerifier,
} from '../application/academic-content-file-verifier';

describe('ACC bounded verifier', () => {
  const session = {
    id: 'upload-id',
    purpose: FileUploadPurpose.ACADEMIC_CONTENT,
    status: FileUploadSessionStatus.VERIFYING,
    originalName: 'lecture.pdf',
    expectedMimeType: 'application/pdf',
    expectedSizeBytes: 10n,
    finalBucket: 'private',
    finalObjectKey: 'academic-content/school/objects/upload-id',
  } as unknown as FileUploadSession;
  const storage = {
    statObject: jest
      .fn()
      .mockResolvedValue({ size: 10, contentType: 'application/pdf' }),
    readObjectRange: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.7xx')),
    getObject: jest.fn(),
  };
  const verifier = new AcademicContentFileVerifier(storage as never);

  beforeEach(() => jest.clearAllMocks());

  it('uses stat and bounded range, not full-object get', async () => {
    await expect(verifier.verify(session)).resolves.toEqual({
      mimeType: 'application/pdf',
      sizeBytes: 10n,
    });
    expect(storage.readObjectRange).toHaveBeenCalledWith({
      bucket: 'private',
      objectKey: 'academic-content/school/objects/upload-id',
      offset: 0,
      length: 10,
    });
    expect(storage.getObject).not.toHaveBeenCalled();
  });

  it('rejects size and provider/content signature contradictions', async () => {
    storage.statObject.mockResolvedValueOnce({
      size: 11,
      contentType: 'application/pdf',
    });
    await expect(verifier.verify(session)).rejects.toMatchObject({
      reason: 'actual_size_mismatch',
    } satisfies Partial<AcademicContentFileRejection>);
    storage.statObject.mockResolvedValueOnce({
      size: 10,
      contentType: 'image/png',
    });
    await expect(verifier.verify(session)).rejects.toMatchObject({
      reason: 'provider_content_type_mismatch',
    });
    storage.readObjectRange.mockResolvedValueOnce(Buffer.from('not a pdf!'));
    await expect(verifier.verify(session)).rejects.toMatchObject({
      reason: 'mime_signature_mismatch',
    });
  });

  it('uses a small range even for multi-GB files, without reading or saving the full object', async () => {
    const size = 7 * 1024 * 1024 * 1024;
    storage.statObject.mockResolvedValueOnce({
      size,
      contentType: 'application/pdf',
    });
    await expect(
      verifier.verify({ ...session, expectedSizeBytes: BigInt(size) }),
    ).resolves.toMatchObject({ sizeBytes: BigInt(size) });
    expect(storage.readObjectRange).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 0, length: 32 }),
    );
    expect(storage.getObject).not.toHaveBeenCalled();
  });

  it('classifies provider not-found and hard-ceiling breach deterministically', async () => {
    storage.statObject.mockRejectedValueOnce(
      new ObjectStorageError('not_found'),
    );
    await expect(verifier.verify(session)).rejects.toMatchObject({
      reason: 'object_missing',
    });
    storage.statObject.mockResolvedValueOnce({
      size: 10737418241,
      contentType: 'application/pdf',
    });
    await expect(verifier.verify(session)).rejects.toMatchObject({
      reason: 'platform_size_exceeded',
    });
  });
});
