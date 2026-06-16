import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../../common/exceptions/domain-exception';

export class TeacherLessonPreparationNotFoundException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'teacher_app.lesson_preparation.not_found',
      message: 'Teacher lesson preparation item was not found',
      httpStatus: HttpStatus.NOT_FOUND,
      details,
    });
  }
}

export class TeacherLessonPreparationClosedTermException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'teacher_app.lesson_preparation.closed_term',
      message: 'Teacher lesson preparation cannot be changed for a closed term',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class TeacherLessonPreparationReadOnlyException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'teacher_app.lesson_preparation.read_only',
      message: 'Teacher lesson preparation item is read-only',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class TeacherLessonPreparationInvalidStatusException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'teacher_app.lesson_preparation.invalid_status',
      message: 'Teacher lesson preparation status is invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class TeacherLessonPreparationInvalidTransitionException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'teacher_app.lesson_preparation.invalid_transition',
      message: 'Teacher lesson preparation status transition is invalid',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}
