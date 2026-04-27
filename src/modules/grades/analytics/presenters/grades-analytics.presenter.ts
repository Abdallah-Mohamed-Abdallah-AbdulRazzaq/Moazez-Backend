import {
  applyRounding,
  buildDistributionBuckets,
} from '../../shared/domain/grade-calculation';
import { GradesGradebookModel } from '../../shared/application/grades-read-model.builder';
import {
  GradesAnalyticsSummaryResponseDto,
  GradesDistributionResponseDto,
} from '../dto/grades-analytics-query.dto';

export function presentGradesAnalyticsSummary(
  gradebook: GradesGradebookModel,
): GradesAnalyticsSummaryResponseDto {
  const enteredItemCount = gradebook.rows.reduce(
    (sum, row) => sum + row.totalEnteredCount,
    0,
  );
  const missingItemCount = gradebook.rows.reduce(
    (sum, row) => sum + row.missingCount,
    0,
  );
  const absentItemCount = gradebook.rows.reduce(
    (sum, row) => sum + row.absentCount,
    0,
  );
  const completedWeights = gradebook.rows.map((row) => row.completedWeight);
  const calculableCount =
    gradebook.summary.passingCount + gradebook.summary.failingCount;

  return {
    studentCount: gradebook.summary.studentCount,
    assessmentCount: gradebook.summary.assessmentCount,
    enteredItemCount,
    missingItemCount,
    absentItemCount,
    averagePercent: gradebook.summary.averagePercent,
    highestPercent: gradebook.summary.highestPercent,
    lowestPercent: gradebook.summary.lowestPercent,
    passingCount: gradebook.summary.passingCount,
    failingCount: gradebook.summary.failingCount,
    incompleteCount: gradebook.summary.incompleteCount,
    passRate:
      calculableCount > 0
        ? applyRounding(
            (gradebook.summary.passingCount / calculableCount) * 100,
            gradebook.rule.rounding,
          )
        : null,
    completedWeightAverage:
      completedWeights.length > 0
        ? applyRounding(
            completedWeights.reduce((sum, value) => sum + value, 0) /
              completedWeights.length,
            gradebook.rule.rounding,
          )
        : null,
  };
}

export function presentGradesDistribution(
  gradebook: GradesGradebookModel,
  bucketSize = 10,
): GradesDistributionResponseDto {
  const values = gradebook.rows
    .filter((row) => row.totalEnteredCount > 0)
    .map((row) => row.finalPercent)
    .filter((value): value is number => value !== null);

  return {
    buckets: buildDistributionBuckets(values, bucketSize),
    incompleteCount: gradebook.summary.incompleteCount,
    totalStudents: gradebook.summary.studentCount,
  };
}
