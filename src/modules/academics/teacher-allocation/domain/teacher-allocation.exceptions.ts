import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../../common/exceptions/domain-exception';

type PrismaErrorLike = {
  code?: string;
  meta?: unknown;
};

export function isUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  return (error as PrismaErrorLike).code === 'P2002';
}

export function isForeignKeyConstraintError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    (error as PrismaErrorLike).code === 'P2003'
  );
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
      message:
        'Teacher allocation bulk request contains a duplicate allocation pair',
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
      message:
        'Subject allocation weekly-hours row is required before teacher allocation',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class TeacherAllocationDeleteConflictException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.allocation.delete_conflict',
      message:
        'Teacher allocation cannot be deleted because dependent academic records exist',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class TeacherAllocationClearConflictException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.allocation.clear_conflict',
      message:
        'Teacher allocations cannot be cleared because dependent academic records exist',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class TeacherAllocationReassignmentTargetNotFoundException extends DomainException {
  constructor() {
    super({
      code: 'academics.allocation.reassignment_target_not_found',
      message: 'Reassignment target teacher not found',
      httpStatus: HttpStatus.NOT_FOUND,
    });
  }
}

export class TeacherAllocationReassignmentTargetIneligibleException extends DomainException {
  constructor(reasonCode: string) {
    super({
      code: 'academics.allocation.reassignment_target_ineligible',
      message: 'Reassignment target teacher is not eligible',
      httpStatus: HttpStatus.CONFLICT,
      details: { reasonCode },
    });
  }
}

export class TeacherAllocationReassignmentBlockedException extends DomainException {
  constructor(
    blockers: ReadonlyArray<{
      domain: string;
      code: string;
      count: number;
      statuses?: Record<string, number>;
    }>,
  ) {
    super({
      code: 'academics.allocation.reassignment_blocked',
      message: 'Teacher allocation reassignment is blocked',
      httpStatus: HttpStatus.CONFLICT,
      details: { blockers },
    });
  }
}

export class TeacherAllocationReassignmentStalePreviewException extends DomainException {
  constructor() {
    super({
      code: 'academics.allocation.reassignment_stale_preview',
      message: 'Teacher allocation reassignment preview is stale',
      httpStatus: HttpStatus.CONFLICT,
    });
  }
}

export class TeacherAllocationReassignmentConcurrentChangeException extends DomainException {
  constructor() {
    super({
      code: 'academics.allocation.reassignment_concurrent_change',
      message: 'Teacher allocation changed concurrently',
      httpStatus: HttpStatus.CONFLICT,
    });
  }
}

export function isTeacherAllocationReassignmentConcurrencyError(
  error: unknown,
): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as PrismaErrorLike;
  return (
    candidate.code === 'P2034' ||
    candidate.code === 'P2002' ||
    (candidate.code === 'P2010' && isSerializationFailure(candidate.meta))
  );
}

function isSerializationFailure(meta: unknown): boolean {
  return (
    typeof meta === 'object' &&
    meta !== null &&
    'code' in meta &&
    (meta as { code?: unknown }).code === '40001'
  );
}
