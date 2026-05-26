import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../common/exceptions/domain-exception';

export class HomeworkAnswerNotFoundException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.answer.not_found',
      message: 'Homework answer was not found',
      httpStatus: HttpStatus.NOT_FOUND,
      details,
    });
  }
}

export class HomeworkAnswerInvalidPayloadException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.answer.invalid_payload',
      message: 'Homework answer payload is invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class HomeworkAnswerInvalidOptionException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.answer.invalid_option',
      message: 'Homework answer option is invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class HomeworkAnswerMissingRequiredException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.answer.missing_required',
      message: 'Required homework answer is missing',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class HomeworkAnswerReadOnlyException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.answer.read_only',
      message: 'Homework answer cannot be changed in this submission state',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class HomeworkAnswerInvalidSubmissionScopeException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.answer.invalid_submission_scope',
      message: 'Homework answer submission scope was not found',
      httpStatus: HttpStatus.NOT_FOUND,
      details,
    });
  }
}
