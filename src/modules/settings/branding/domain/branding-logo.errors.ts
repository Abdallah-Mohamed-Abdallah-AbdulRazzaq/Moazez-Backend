import { HttpStatus } from '@nestjs/common';
import {
  DomainException,
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';

export class BrandingLogoFileRequiredException extends ValidationDomainException {
  constructor() {
    super('A multipart file field named "file" is required', { field: 'file' });
  }
}

export class BrandingLogoMimeNotAllowedException extends DomainException {
  constructor() {
    super({
      code: 'settings.branding.logo.mime_not_allowed',
      message: 'Only PNG and JPEG school logos are allowed',
      httpStatus: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
    });
  }
}

export class BrandingLogoMimeMismatchException extends DomainException {
  constructor() {
    super({
      code: 'settings.branding.logo.mime_mismatch',
      message: 'The declared image type does not match the file content',
      httpStatus: HttpStatus.BAD_REQUEST,
    });
  }
}

export class BrandingLogoInvalidStructureException extends DomainException {
  constructor() {
    super({
      code: 'settings.branding.logo.invalid_structure',
      message: 'The school logo file structure is invalid or incomplete',
      httpStatus: HttpStatus.BAD_REQUEST,
    });
  }
}

export class BrandingLogoSizeExceededException extends DomainException {
  constructor(maxSizeBytes: number) {
    super({
      code: 'settings.branding.logo.size_exceeded',
      message: 'The school logo exceeds the maximum allowed size',
      httpStatus: HttpStatus.PAYLOAD_TOO_LARGE,
      details: { maxSizeBytes },
    });
  }
}

export class PublicBrandingLogoNotFoundException extends NotFoundDomainException {
  constructor() {
    super('Resource not found');
  }
}

export class PublicBrandingLogoServiceUnavailableException extends DomainException {
  constructor(cause?: unknown) {
    super({
      code: 'service_unavailable',
      message: 'Service temporarily unavailable',
      httpStatus: HttpStatus.SERVICE_UNAVAILABLE,
      cause,
    });
  }
}

export function isStorageObjectNotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { code?: unknown; statusCode?: unknown };
  return (
    value.statusCode === HttpStatus.NOT_FOUND ||
    value.code === 'NoSuchKey' ||
    value.code === 'NoSuchObject' ||
    value.code === 'NotFound'
  );
}
