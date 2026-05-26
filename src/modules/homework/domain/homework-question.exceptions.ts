import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../common/exceptions/domain-exception';

export class HomeworkQuestionNotFoundException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.question.not_found',
      message: 'Homework question was not found',
      httpStatus: HttpStatus.NOT_FOUND,
      details,
    });
  }
}

export class HomeworkQuestionInvalidTypePayloadException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.question.invalid_type_payload',
      message: 'Homework question payload does not match its type',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class HomeworkQuestionInvalidOptionsException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.question.invalid_options',
      message: 'Homework question options are invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class HomeworkQuestionReadOnlyException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.question.read_only',
      message: 'Homework question cannot be changed for this assignment',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class HomeworkQuestionOptionNotFoundException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.question.option_not_found',
      message: 'Homework question option was not found',
      httpStatus: HttpStatus.NOT_FOUND,
      details,
    });
  }
}

export class HomeworkQuestionInvalidReorderException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.question.invalid_reorder',
      message: 'Homework question reorder target is invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class HomeworkAssignmentInvalidQuestionStructureException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.assignment.invalid_question_structure',
      message: 'Homework assignment has invalid question structure',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}
