import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../../common/exceptions/domain-exception';

export class LessonContentNotFoundException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.lesson_content.not_found',
      message: 'Lesson content item was not found or is outside scope',
      httpStatus: HttpStatus.NOT_FOUND,
      details,
    });
  }
}

export class LessonContentInvalidScopeException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.lesson_content.invalid_scope',
      message: 'Lesson content scope is invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class LessonContentInvalidTypePayloadException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.lesson_content.invalid_type_payload',
      message: 'Lesson content payload does not match its type',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class LessonContentInvalidUrlException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.lesson_content.invalid_url',
      message: 'Lesson content URL is invalid or unsafe',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class LessonContentFileNotFoundException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.lesson_content.file_not_found',
      message: 'Lesson content file was not found or is outside scope',
      httpStatus: HttpStatus.NOT_FOUND,
      details,
    });
  }
}

export class LessonContentReadOnlyException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.lesson_content.read_only',
      message: 'Lesson content cannot be changed for an archived curriculum',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}
