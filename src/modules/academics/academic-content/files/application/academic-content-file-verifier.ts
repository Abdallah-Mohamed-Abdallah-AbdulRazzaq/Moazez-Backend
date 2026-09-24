import { Injectable } from '@nestjs/common';
import type { FileUploadSession } from '@prisma/client';
import { StorageService } from '../../../../../infrastructure/storage/storage.service';
import { isObjectStorageNotFoundError } from '../../../../../infrastructure/storage/object-storage.errors';
import { ACADEMIC_CONTENT_PLATFORM_HARD_MAX_FILE_SIZE_BYTES } from '../domain/academic-content-file.constants';
import {
  resolveAcademicContentFileType,
  verifyAcademicContentSignature,
} from '../domain/academic-content-file.registry';

export class AcademicContentFileRejection extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

@Injectable()
export class AcademicContentFileVerifier {
  constructor(private readonly storage: StorageService) {}

  async verify(
    session: FileUploadSession,
  ): Promise<{ mimeType: string; sizeBytes: bigint }> {
    const type = resolveAcademicContentFileType(
      session.originalName,
      session.expectedMimeType,
    );
    if (!type) throw new AcademicContentFileRejection('unsupported_file_type');
    let stat: Awaited<ReturnType<StorageService['statObject']>>;
    try {
      stat = await this.storage.statObject({
        bucket: session.finalBucket,
        objectKey: session.finalObjectKey,
      });
    } catch (error) {
      if (isObjectStorageNotFoundError(error))
        throw new AcademicContentFileRejection('object_missing');
      throw error;
    }
    if (!Number.isSafeInteger(stat.size) || stat.size <= 0)
      throw new AcademicContentFileRejection('actual_size_invalid');
    const actual = BigInt(stat.size);
    if (actual > ACADEMIC_CONTENT_PLATFORM_HARD_MAX_FILE_SIZE_BYTES)
      throw new AcademicContentFileRejection('platform_size_exceeded');
    if (actual !== session.expectedSizeBytes)
      throw new AcademicContentFileRejection('actual_size_mismatch');
    if (
      stat.contentType &&
      stat.contentType.trim().toLowerCase() !== type.mimeType
    )
      throw new AcademicContentFileRejection('provider_content_type_mismatch');
    let bytes: Buffer;
    try {
      bytes = await this.storage.readObjectRange({
        bucket: session.finalBucket,
        objectKey: session.finalObjectKey,
        offset: 0,
        length: Math.min(stat.size, type.signature === 'text' ? 4096 : 32),
      });
    } catch (error) {
      if (isObjectStorageNotFoundError(error))
        throw new AcademicContentFileRejection('object_missing');
      throw error;
    }
    if (!verifyAcademicContentSignature(type, bytes))
      throw new AcademicContentFileRejection('mime_signature_mismatch');
    return { mimeType: type.mimeType, sizeBytes: actual };
  }
}
