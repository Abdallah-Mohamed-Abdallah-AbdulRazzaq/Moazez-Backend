import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../../common/exceptions/domain-exception';

export class SubjectAllocationInvalidScopeException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.subject_allocation.invalid_scope',
      message: 'Subject allocation academic scope is invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class SubjectAllocationDuplicatePairException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.subject_allocation.duplicate_pair',
      message: 'Subject allocation bulk request contains a duplicate grade and subject pair',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class SubjectAllocationInvalidWeeklyHoursException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.subject_allocation.invalid_weekly_hours',
      message: 'Subject allocation weekly hours value is invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class SubjectAllocationInvalidBulkSizeException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.subject_allocation.invalid_bulk_size',
      message: 'Subject allocation bulk request size is invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class SubjectAllocationClosedTermException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.subject_allocation.closed_term',
      message: 'Term is closed for subject allocation changes',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

type PrismaErrorLike = {
  code?: string;
};

export function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      (error as PrismaErrorLike).code === 'P2002',
  );
}
