import { GradeItemStatus } from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import {
  GradeItemScoreOutOfRangeException,
  validateGradeItemStatusAndScore,
  validateScoreWithinRange,
} from '../domain/grade-item-validation';

describe('grade item validation helpers', () => {
  it('accepts score within maxScore', () => {
    expect(() => validateScoreWithinRange(8, 10)).not.toThrow();
  });

  it('rejects score above maxScore', () => {
    expect(() => validateScoreWithinRange(11, 10)).toThrow(
      GradeItemScoreOutOfRangeException,
    );
  });

  it('requires score for ENTERED status', () => {
    expect(() =>
      validateGradeItemStatusAndScore(GradeItemStatus.ENTERED, null, 10),
    ).toThrow(ValidationDomainException);
  });

  it('allows MISSING and ABSENT to omit score', () => {
    expect(
      validateGradeItemStatusAndScore(GradeItemStatus.MISSING, null, 10),
    ).toBe(GradeItemStatus.MISSING);

    expect(
      validateGradeItemStatusAndScore(GradeItemStatus.ABSENT, undefined, 10),
    ).toBe(GradeItemStatus.ABSENT);
  });
});
