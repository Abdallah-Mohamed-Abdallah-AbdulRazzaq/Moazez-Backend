import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../../common/exceptions/domain-exception';

export class LessonPlanNotFoundException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.lesson_plan.not_found',
      message: 'Lesson plan was not found or is outside scope',
      httpStatus: HttpStatus.NOT_FOUND,
      details,
    });
  }
}

export class LessonPlanDuplicateException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.lesson_plan.duplicate',
      message:
        'A lesson plan already exists for this teacher allocation and week',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class LessonPlanInvalidScopeException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.lesson_plan.invalid_scope',
      message: 'Lesson plan academic scope is invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class LessonPlanClosedTermException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.lesson_plan.closed_term',
      message: 'Lesson plan cannot be changed for a closed term',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class LessonPlanInvalidDateRangeException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.lesson_plan.invalid_date_range',
      message: 'Lesson plan date range is invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class LessonPlanHolidayDateException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.lesson_plan.holiday_date',
      message: 'Lesson plan item cannot be scheduled on a holiday',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class LessonPlanAutoPlanNoCurriculumException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.lesson_plan.auto_plan_no_curriculum',
      message: 'No curriculum lessons are available for auto-plan',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class LessonPlanAutoPlanNoSlotsException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.lesson_plan.auto_plan_no_slots',
      message: 'No timetable slots are available for auto-plan',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class LessonPlanInvalidTimetableEntryException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.lesson_plan.invalid_timetable_entry',
      message: 'Lesson plan timetable entry scope is invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class LessonPlanReadOnlyException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.lesson_plan.read_only',
      message: 'Lesson plan is read-only in its current state',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class LessonPlanInvalidTransitionException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.lesson_plan.invalid_transition',
      message: 'Lesson plan status transition is invalid',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class LessonPlanItemNotFoundException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.lesson_plan.item_not_found',
      message: 'Lesson plan item was not found or is outside scope',
      httpStatus: HttpStatus.NOT_FOUND,
      details,
    });
  }
}

export class LessonPlanInvalidItemScopeException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.lesson_plan.invalid_item_scope',
      message: 'Lesson plan item scope is invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class LessonPlanItemInvalidTransitionException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.lesson_plan.item_invalid_transition',
      message: 'Lesson plan item status transition is invalid',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

type PrismaErrorLike = {
  code?: string;
};

export function isUniqueConstraintError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    (error as PrismaErrorLike).code === 'P2002'
  );
}
