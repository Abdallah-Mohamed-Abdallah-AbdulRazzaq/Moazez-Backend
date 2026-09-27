import { AcademicContentStatus, AcademicContentType } from '@prisma/client';

export interface AcademicContentEffectiveWorkflowPolicy {
  preparationApprovalRequired: boolean;
}

export function effectiveAcademicContentWorkflowPolicy(
  row?: Partial<AcademicContentEffectiveWorkflowPolicy> | null,
): AcademicContentEffectiveWorkflowPolicy {
  return {
    preparationApprovalRequired: row?.preparationApprovalRequired ?? false,
  };
}

export function isAcademicContentApprovalRequired(
  type: AcademicContentType,
  policy: AcademicContentEffectiveWorkflowPolicy,
): boolean {
  return (
    type === AcademicContentType.TEACHER_PREPARATION &&
    policy.preparationApprovalRequired
  );
}

export function isAcademicContentSubmissionSource(
  status: AcademicContentStatus,
): boolean {
  return (
    status === AcademicContentStatus.DRAFT ||
    status === AcademicContentStatus.CHANGES_REQUESTED
  );
}

export function isAcademicContentReviewState(
  status: AcademicContentStatus,
): boolean {
  return status === AcademicContentStatus.SUBMITTED;
}

export function isAcademicContentReviewOutcome(
  status: AcademicContentStatus,
): boolean {
  return (
    status === AcademicContentStatus.APPROVED ||
    status === AcademicContentStatus.CHANGES_REQUESTED
  );
}
