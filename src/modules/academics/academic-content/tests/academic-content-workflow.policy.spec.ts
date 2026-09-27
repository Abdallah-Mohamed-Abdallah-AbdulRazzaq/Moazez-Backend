import { AcademicContentStatus, AcademicContentType } from '@prisma/client';
import {
  effectiveAcademicContentWorkflowPolicy,
  isAcademicContentApprovalRequired,
  isAcademicContentReviewOutcome,
  isAcademicContentReviewState,
  isAcademicContentSubmissionSource,
} from '../domain/academic-content-workflow.policy';
import { isAcademicContentMutable } from '../domain/academic-content-lifecycle.policy';

describe('ACC-6A pure workflow foundation', () => {
  it('resolves absent and explicit policy values without persistence', () => {
    expect(effectiveAcademicContentWorkflowPolicy(null)).toEqual({
      preparationApprovalRequired: false,
    });
    expect(
      effectiveAcademicContentWorkflowPolicy({
        preparationApprovalRequired: false,
      }),
    ).toEqual({ preparationApprovalRequired: false });
    expect(
      effectiveAcademicContentWorkflowPolicy({
        preparationApprovalRequired: true,
      }),
    ).toEqual({ preparationApprovalRequired: true });
  });

  it('requires approval only for Teacher Preparation when enabled', () => {
    expect(
      isAcademicContentApprovalRequired(
        AcademicContentType.TEACHER_PREPARATION,
        { preparationApprovalRequired: true },
      ),
    ).toBe(true);
    expect(
      isAcademicContentApprovalRequired(
        AcademicContentType.TEACHER_PREPARATION,
        { preparationApprovalRequired: false },
      ),
    ).toBe(false);
    for (const type of Object.values(AcademicContentType).filter(
      (type) => type !== AcademicContentType.TEACHER_PREPARATION,
    )) {
      expect(
        isAcademicContentApprovalRequired(type, {
          preparationApprovalRequired: true,
        }),
      ).toBe(false);
    }
  });

  it('describes future submission and review transitions without enabling runtime authoring', () => {
    expect(isAcademicContentSubmissionSource(AcademicContentStatus.DRAFT)).toBe(
      true,
    );
    expect(
      isAcademicContentSubmissionSource(
        AcademicContentStatus.CHANGES_REQUESTED,
      ),
    ).toBe(true);
    expect(
      isAcademicContentSubmissionSource(AcademicContentStatus.APPROVED),
    ).toBe(false);
    expect(isAcademicContentReviewState(AcademicContentStatus.SUBMITTED)).toBe(
      true,
    );
    expect(isAcademicContentReviewOutcome(AcademicContentStatus.APPROVED)).toBe(
      true,
    );
    expect(
      isAcademicContentReviewOutcome(AcademicContentStatus.CHANGES_REQUESTED),
    ).toBe(true);
    expect(Object.values(AcademicContentStatus)).not.toContain('UNDER_REVIEW');
    expect(
      isAcademicContentMutable(AcademicContentStatus.CHANGES_REQUESTED),
    ).toBe(false);
  });
});
