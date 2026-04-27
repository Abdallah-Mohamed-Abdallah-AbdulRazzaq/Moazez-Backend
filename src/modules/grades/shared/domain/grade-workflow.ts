import { HttpStatus } from '@nestjs/common';
import {
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
} from '@prisma/client';
import {
  DomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';

export interface GradeAssessmentWorkflowLike {
  approvalStatus: GradeAssessmentApprovalStatus | string;
  lockedAt?: Date | string | null;
  isLocked?: boolean | null;
}

export interface GradeTermWritableLike {
  id?: string;
  isActive?: boolean | null;
  closedAt?: Date | string | null;
}

export class GradeTermClosedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'grades.term.closed',
      message: 'Term is closed for grade modifications',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export function normalizeAssessmentApprovalStatus(
  input: GradeAssessmentApprovalStatus | string,
): GradeAssessmentApprovalStatus {
  const normalized = String(input).trim();

  switch (normalized.toUpperCase()) {
    case GradeAssessmentApprovalStatus.DRAFT:
      return GradeAssessmentApprovalStatus.DRAFT;
    case GradeAssessmentApprovalStatus.PUBLISHED:
      return GradeAssessmentApprovalStatus.PUBLISHED;
    case GradeAssessmentApprovalStatus.APPROVED:
      return GradeAssessmentApprovalStatus.APPROVED;
    default:
      throw new ValidationDomainException(
        'Assessment approval status is invalid',
        {
          field: 'approvalStatus',
          value: input,
        },
      );
  }
}

export function normalizeDeliveryMode(
  input: GradeAssessmentDeliveryMode | string,
): GradeAssessmentDeliveryMode {
  const normalized = String(input).trim();

  switch (normalized.toUpperCase()) {
    case GradeAssessmentDeliveryMode.SCORE_ONLY:
      return GradeAssessmentDeliveryMode.SCORE_ONLY;
    case GradeAssessmentDeliveryMode.QUESTION_BASED:
      return GradeAssessmentDeliveryMode.QUESTION_BASED;
    default:
      throw new ValidationDomainException(
        'Assessment delivery mode is invalid',
        {
          field: 'deliveryMode',
          value: input,
        },
      );
  }
}

export function isAssessmentLocked(
  assessmentLike: Pick<GradeAssessmentWorkflowLike, 'lockedAt' | 'isLocked'>,
): boolean {
  return Boolean(assessmentLike.lockedAt) || assessmentLike.isLocked === true;
}

export function canPublishAssessment(
  assessmentLike: GradeAssessmentWorkflowLike,
): boolean {
  return (
    !isAssessmentLocked(assessmentLike) &&
    normalizeAssessmentApprovalStatus(assessmentLike.approvalStatus) ===
      GradeAssessmentApprovalStatus.DRAFT
  );
}

export function canApproveAssessment(
  assessmentLike: GradeAssessmentWorkflowLike,
): boolean {
  return (
    !isAssessmentLocked(assessmentLike) &&
    normalizeAssessmentApprovalStatus(assessmentLike.approvalStatus) ===
      GradeAssessmentApprovalStatus.PUBLISHED
  );
}

export function canLockAssessment(
  assessmentLike: GradeAssessmentWorkflowLike,
): boolean {
  return (
    !isAssessmentLocked(assessmentLike) &&
    normalizeAssessmentApprovalStatus(assessmentLike.approvalStatus) ===
      GradeAssessmentApprovalStatus.APPROVED
  );
}

export function isScoreOnlyDeliveryMode(
  deliveryMode: GradeAssessmentDeliveryMode | string,
): boolean {
  return (
    normalizeDeliveryMode(deliveryMode) ===
    GradeAssessmentDeliveryMode.SCORE_ONLY
  );
}

export function assertScoreOnlyDeliveryMode(
  deliveryMode: GradeAssessmentDeliveryMode | string,
): void {
  if (!isScoreOnlyDeliveryMode(deliveryMode)) {
    throw new ValidationDomainException(
      'Question-based assessments are deferred for Sprint 4B',
      { deliveryMode },
    );
  }
}

export function assertTermWritable(termLike: GradeTermWritableLike): void {
  if (termLike.isActive === false || Boolean(termLike.closedAt)) {
    throw new GradeTermClosedException({ termId: termLike.id });
  }
}
