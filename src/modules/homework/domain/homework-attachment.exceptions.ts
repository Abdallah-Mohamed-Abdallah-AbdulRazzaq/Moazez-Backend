import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../common/exceptions/domain-exception';

export class HomeworkAttachmentNotFoundException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.attachment.not_found',
      message: 'Homework assignment attachment was not found',
      httpStatus: HttpStatus.NOT_FOUND,
      details,
    });
  }
}

export class HomeworkAttachmentFileNotFoundException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.attachment.file_not_found',
      message: 'Homework attachment file was not found',
      httpStatus: HttpStatus.NOT_FOUND,
      details,
    });
  }
}

export class HomeworkAttachmentReadOnlyException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.attachment.read_only',
      message: 'Homework attachment cannot be changed for this assignment',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class HomeworkAttachmentInvalidReorderException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.attachment.invalid_reorder',
      message: 'Homework attachment reorder target is invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}
