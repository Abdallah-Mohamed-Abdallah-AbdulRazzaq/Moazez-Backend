import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../common/exceptions/domain-exception';

export class HomeworkSubmissionAttachmentNotFoundException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.submission_attachment.not_found',
      message: 'Homework submission attachment was not found',
      httpStatus: HttpStatus.NOT_FOUND,
      details,
    });
  }
}

export class HomeworkSubmissionAttachmentFileNotFoundException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.submission_attachment.file_not_found',
      message: 'Homework submission attachment file was not found',
      httpStatus: HttpStatus.NOT_FOUND,
      details,
    });
  }
}

export class HomeworkSubmissionAttachmentReadOnlyException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.submission_attachment.read_only',
      message:
        'Homework submission attachment cannot be changed in this submission state',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class HomeworkSubmissionAttachmentInvalidReorderException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.submission_attachment.invalid_reorder',
      message: 'Homework submission attachment reorder target is invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}
