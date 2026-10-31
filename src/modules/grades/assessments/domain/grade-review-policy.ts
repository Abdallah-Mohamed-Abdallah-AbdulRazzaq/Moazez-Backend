import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../../common/exceptions/domain-exception';

export const GRADE_REVIEW_LEVELS = ['NONE', 'DETAILS', 'KEYS'] as const;
export type GradeReviewLevel = (typeof GRADE_REVIEW_LEVELS)[number];
export type GradeReviewAudience = 'STUDENT' | 'PARENT';

export class GradeReviewConflictException extends DomainException {
  constructor(
    reason:
      | 'stale_version'
      | 'not_finalized'
      | 'not_approved'
      | 'key_not_approved'
      | 'already_applied'
      | 'stale_suggestion'
      | 'manual_decision_required',
  ) {
    super({
      code: 'grades.review.conflict',
      message: 'Grade review state does not permit this operation',
      httpStatus: HttpStatus.CONFLICT,
      details: { reason },
    });
  }
}

export function gradeReviewLevel(value: unknown): GradeReviewLevel {
  return GRADE_REVIEW_LEVELS.includes(value as GradeReviewLevel)
    ? (value as GradeReviewLevel)
    : 'NONE';
}

export function gradeReviewApproved(assessment: {
  approvalStatus: string;
  approvedAt: Date | null;
}): boolean {
  return (
    ['APPROVED', 'LOCKED'].includes(assessment.approvalStatus) &&
    assessment.approvedAt !== null
  );
}

export function gradeReviewFinalized(submission: {
  status: string;
  correctedAt: Date | null;
  reviewedById: string | null;
}): boolean {
  return (
    submission.status === 'CORRECTED' &&
    submission.correctedAt !== null &&
    submission.reviewedById !== null
  );
}

export function effectiveGradeReviewLevel(input: {
  audience: GradeReviewAudience;
  assessment: { approvalStatus: string; approvedAt: Date | null };
  submission: {
    status: string;
    correctedAt: Date | null;
    reviewedById: string | null;
  };
  policy: { studentLevel: unknown; parentLevel: unknown } | null;
}): GradeReviewLevel {
  if (
    !gradeReviewApproved(input.assessment) ||
    !gradeReviewFinalized(input.submission)
  )
    return 'NONE';
  return gradeReviewLevel(
    input.audience === 'STUDENT'
      ? input.policy?.studentLevel
      : input.policy?.parentLevel,
  );
}
