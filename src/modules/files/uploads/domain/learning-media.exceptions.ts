import { HttpStatus } from '@nestjs/common';
import { FileUploadSessionStatus } from '@prisma/client';
import { DomainException } from '../../../../common/exceptions/domain-exception';
import { LEARNING_MEDIA_ALLOWED_MIME_TYPES } from './learning-media.constants';

export class LearningMediaNotReadyException extends DomainException {
  constructor(status: FileUploadSessionStatus) {
    super({
      code: 'learning.media.not_ready',
      message: 'Learning media is not ready',
      httpStatus: HttpStatus.CONFLICT,
      details: { status },
    });
  }
}

export class LearningMediaUnsupportedTypeException extends DomainException {
  constructor() {
    super({
      code: 'learning.media.unsupported_type',
      message: 'Learning media type is not supported',
      httpStatus: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      details: { allowedCategories: [...LEARNING_MEDIA_ALLOWED_MIME_TYPES] },
    });
  }
}

export class LearningMediaUploadExpiredException extends DomainException {
  constructor() {
    super({
      code: 'learning.media.upload_expired',
      message: 'Learning media upload has expired',
      httpStatus: HttpStatus.GONE,
      details: { retryable: false },
    });
  }
}

export class LearningMediaUploadConflictException extends DomainException {
  constructor(reasonCode: string, retryable: boolean) {
    super({
      code: 'learning.media.upload_conflict',
      message: 'Learning media upload conflicts with the requested operation',
      httpStatus: HttpStatus.CONFLICT,
      details: { reasonCode, retryable },
    });
  }
}

export class LearningMediaSizeExceededException extends DomainException {
  constructor(maximumBytes: bigint, actualBytes: bigint) {
    super({
      code: 'learning.media.size_exceeded',
      message: 'Learning media exceeds the allowed size',
      httpStatus: HttpStatus.PAYLOAD_TOO_LARGE,
      details: {
        maximumBytes: maximumBytes.toString(),
        actualBytes: actualBytes.toString(),
      },
    });
  }
}

export class LearningMediaVerificationFailedException extends DomainException {
  constructor(reasonCode: string) {
    super({
      code: 'learning.media.verification_failed',
      message: 'Learning media verification failed',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details: { reasonCode },
    });
  }
}
