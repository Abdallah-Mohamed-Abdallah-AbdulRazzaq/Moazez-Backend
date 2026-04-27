import {
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
} from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import {
  assertScoreOnlyDeliveryMode,
  canApproveAssessment,
  canLockAssessment,
  canPublishAssessment,
  isAssessmentLocked,
} from '../domain/grade-workflow';

describe('grade workflow helpers', () => {
  it('allows draft to publish, published to approve, and approved to lock', () => {
    expect(
      canPublishAssessment({
        approvalStatus: GradeAssessmentApprovalStatus.DRAFT,
      }),
    ).toBe(true);

    expect(
      canApproveAssessment({
        approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
      }),
    ).toBe(true);

    expect(
      canLockAssessment({
        approvalStatus: GradeAssessmentApprovalStatus.APPROVED,
      }),
    ).toBe(true);
  });

  it('rejects lock before approved', () => {
    expect(
      canLockAssessment({
        approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
      }),
    ).toBe(false);
  });

  it('recognizes locked assessments', () => {
    expect(
      isAssessmentLocked({
        lockedAt: new Date('2026-04-27T12:00:00.000Z'),
      }),
    ).toBe(true);
    expect(isAssessmentLocked({ isLocked: true })).toBe(true);
  });

  it('rejects question-based delivery mode for score-only Sprint 4A helpers', () => {
    expect(() =>
      assertScoreOnlyDeliveryMode(GradeAssessmentDeliveryMode.QUESTION_BASED),
    ).toThrow(ValidationDomainException);
  });
});
