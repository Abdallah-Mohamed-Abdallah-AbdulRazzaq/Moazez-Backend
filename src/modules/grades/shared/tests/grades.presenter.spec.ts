import {
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
  GradeItemStatus,
  GradeScopeType,
} from '@prisma/client';
import {
  presentAssessmentApprovalStatus,
  presentDecimal,
  presentDeliveryMode,
  presentGradeItemStatus,
  presentGradeScopeType,
} from '../presenters/grades.presenter';

describe('grades presenter helpers', () => {
  it('returns frontend-friendly strings', () => {
    expect(presentGradeScopeType(GradeScopeType.CLASSROOM)).toBe('classroom');
    expect(
      presentAssessmentApprovalStatus(GradeAssessmentApprovalStatus.PUBLISHED),
    ).toBe('published');
    expect(presentDeliveryMode(GradeAssessmentDeliveryMode.SCORE_ONLY)).toBe(
      'SCORE_ONLY',
    );
    expect(presentGradeItemStatus(GradeItemStatus.ENTERED)).toBe('entered');
  });

  it('converts decimal-like values to numbers', () => {
    expect(presentDecimal('12.50')).toBe(12.5);
    expect(presentDecimal({ toNumber: () => 7.25 })).toBe(7.25);
    expect(presentDecimal(null)).toBeNull();
  });
});
