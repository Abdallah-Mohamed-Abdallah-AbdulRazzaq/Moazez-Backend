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

export class SubjectCodeConflictException extends ConflictException {
  constructor() {
    super('Subject code already exists in this school');
  }
}
