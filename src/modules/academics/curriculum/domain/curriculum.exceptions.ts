import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../../common/exceptions/domain-exception';

export class CurriculumNotFoundException extends DomainException {
  constructor(_details?: Record<string, unknown>) {
    super({
      code: 'academics.curriculum.not_found',
      message: 'Curriculum was not found or is outside scope',
      httpStatus: HttpStatus.NOT_FOUND,
    });
  }
}

export class CurriculumDuplicateException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.curriculum.duplicate',
      message: 'Curriculum already exists for this academic scope',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class CurriculumInvalidScopeException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.curriculum.invalid_scope',
      message: 'Curriculum academic scope is invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class CurriculumReadOnlyException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.curriculum.read_only',
      message: 'Curriculum is read-only in its current state',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class CurriculumActivationIncompleteException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.curriculum.activation_incomplete',
      message:
        'Curriculum must include at least one unit and lesson before activation',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class CurriculumUnitNotFoundException extends DomainException {
  constructor(_details?: Record<string, unknown>) {
    super({
      code: 'academics.curriculum.unit_not_found',
      message: 'Curriculum unit was not found or is outside scope',
      httpStatus: HttpStatus.NOT_FOUND,
    });
  }
}

export class CurriculumLessonNotFoundException extends DomainException {
  constructor(_details?: Record<string, unknown>) {
    super({
      code: 'academics.curriculum.lesson_not_found',
      message: 'Curriculum lesson was not found or is outside scope',
      httpStatus: HttpStatus.NOT_FOUND,
    });
  }
}

export class CurriculumInvalidReorderException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.curriculum.invalid_reorder',
      message: 'Curriculum reorder target is invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

type PrismaErrorLike = {
  code?: string;
};

export function isUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  return (error as PrismaErrorLike).code === 'P2002';
}
