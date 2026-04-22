import { ConflictException } from '@nestjs/common';

type PrismaErrorLike = {
  code?: string;
};

export function isAttachmentUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  return (error as PrismaErrorLike).code === 'P2002';
}

export class AttachmentLinkConflictException extends ConflictException {
  constructor() {
    super('Attachment link already exists for this preview target');
  }
}
