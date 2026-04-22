import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../../common/exceptions/domain-exception';

export class FilesUploadSizeExceededException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'files.upload.size_exceeded',
      message: 'File size exceeds allowed limit',
      httpStatus: HttpStatus.PAYLOAD_TOO_LARGE,
      details,
    });
  }
}

export class FilesUploadMimeNotAllowedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'files.upload.mime_not_allowed',
      message: 'File type is not allowed',
      httpStatus: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      details,
    });
  }
}

export class FilesNotFoundException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'files.not_found',
      message: 'File not found or not accessible',
      httpStatus: HttpStatus.NOT_FOUND,
      details,
    });
  }
}
