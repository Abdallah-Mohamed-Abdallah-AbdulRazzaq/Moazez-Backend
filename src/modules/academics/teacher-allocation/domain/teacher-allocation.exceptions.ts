import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../../common/exceptions/domain-exception';

type PrismaErrorLike = {
  code?: string;
};

export function isUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  return (error as PrismaErrorLike).code === 'P2002';
}

export class TeacherAllocationConflictException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.allocation.duplicate',
      message: 'Teacher allocation already exists',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class TeacherAllocationInvalidScopeException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.allocation.invalid_scope',
      message: 'Teacher allocation scope is invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class TeacherAllocationInvalidBulkSizeException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.allocation.invalid_bulk_size',
      message: 'Teacher allocation bulk request size is invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class TeacherAllocationDuplicatePairException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.allocation.duplicate_pair',
      message: 'Teacher allocation bulk request contains a duplicate allocation pair',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class TeacherAllocationClosedTermException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.allocation.closed_term',
      message: 'Term is closed for teacher allocation changes',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class TeacherAllocationMissingSubjectAllocationException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.allocation.missing_subject_allocation',
      message: 'Subject allocation weekly-hours row is required before teacher allocation',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class TeacherAllocationDeleteConflictException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.allocation.delete_conflict',
      message: 'Teacher allocation cannot be deleted because dependent academic records exist',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class TeacherAllocationClearConflictException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.allocation.clear_conflict',
      message: 'Teacher allocations cannot be cleared because dependent academic records exist',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}
