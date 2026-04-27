import {
  GradeItemStatus,
  GradeRoundingMode,
  GradeRuleScale,
} from '@prisma/client';
import {
  buildDistributionBuckets,
  calculateAssessmentPercent,
  calculateStudentFinalPercent,
  calculateWeightedContribution,
  deriveGradebookStudentStatus,
  applyRounding,
} from '../domain/grade-calculation';

describe('grade calculation helpers', () => {
  const rule = {
    gradingScale: GradeRuleScale.PERCENTAGE,
    passMark: 50,
    rounding: GradeRoundingMode.DECIMAL_2,
  };

  it('calculates assessment percent and weighted contribution', () => {
    expect(calculateAssessmentPercent(18, 20)).toBe(90);
    expect(calculateWeightedContribution(90, 30)).toBe(27);
  });

  it('avoids division by zero', () => {
    expect(calculateAssessmentPercent(10, 0)).toBeNull();
    expect(calculateWeightedContribution(null, 20)).toBeNull();
  });

  it.each([
    [GradeRoundingMode.NONE, 12.345],
    [GradeRoundingMode.DECIMAL_0, 12],
    [GradeRoundingMode.DECIMAL_1, 12.3],
    [GradeRoundingMode.DECIMAL_2, 12.35],
  ])('applies %s rounding', (rounding, expected) => {
    expect(applyRounding(12.345, rounding)).toBe(expected);
  });

  it('calculates final percent from entered scores only and counts non-entered statuses', () => {
    const result = calculateStudentFinalPercent(
      [
        {
          status: GradeItemStatus.ENTERED,
          score: 18,
          maxScore: 20,
          weight: 50,
        },
        {
          status: GradeItemStatus.MISSING,
          score: null,
          maxScore: 10,
          weight: 25,
        },
        {
          status: GradeItemStatus.ABSENT,
          score: null,
          maxScore: 10,
          weight: 25,
        },
      ],
      rule,
    );

    expect(result).toMatchObject({
      finalPercent: 45,
      completedWeight: 50,
      hasEnteredScores: true,
      totalEnteredCount: 1,
      missingCount: 1,
      absentCount: 1,
    });
  });

  it('derives pass/fail/incomplete from entered score presence and passMark', () => {
    expect(deriveGradebookStudentStatus(null, false, rule)).toBe('incomplete');
    expect(deriveGradebookStudentStatus(49, true, rule)).toBe('failing');
    expect(deriveGradebookStudentStatus(50, true, rule)).toBe('passing');
  });

  it('builds buckets and keeps incomplete students outside distribution inputs', () => {
    expect(buildDistributionBuckets([0, 9.9, 10, 89, 90, 100], 10)).toEqual([
      { from: 0, to: 9, count: 2 },
      { from: 10, to: 19, count: 1 },
      { from: 20, to: 29, count: 0 },
      { from: 30, to: 39, count: 0 },
      { from: 40, to: 49, count: 0 },
      { from: 50, to: 59, count: 0 },
      { from: 60, to: 69, count: 0 },
      { from: 70, to: 79, count: 0 },
      { from: 80, to: 89, count: 1 },
      { from: 90, to: 100, count: 2 },
    ]);
  });
});
