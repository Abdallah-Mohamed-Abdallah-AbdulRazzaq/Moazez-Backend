import { ConflictException } from '@nestjs/common';

type PrismaErrorLike = {
  code?: string;
};

export function isUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  return (error as PrismaErrorLike).code === 'P2002';
}

export class TeacherAllocationConflictException extends ConflictException {
  constructor() {
    super('Teacher allocation already exists');
  }
}
