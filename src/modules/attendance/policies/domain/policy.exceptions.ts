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

export class AttendancePolicyConflictException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'attendance.policy.conflict',
      message: 'An active policy already exists for this scope',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}
