import { GradeItemStatus, GradeRoundingMode } from '@prisma/client';

export type GradeNumericValue =
  | number
  | string
  | { toNumber: () => number }
  | null
  | undefined;

export interface GradeCalculationRule {
  passMark: GradeNumericValue;
  rounding: GradeRoundingMode | string;
}

export interface GradeCalculationCellInput {
  status: GradeItemStatus | string;
  score: GradeNumericValue;
  maxScore: GradeNumericValue;
  weight: GradeNumericValue;
}

export interface CalculatedGradeCell {
  percent: number | null;
  weightedContribution: number | null;
}

export interface StudentFinalCalculation {
  finalPercent: number | null;
  completedWeight: number;
  hasEnteredScores: boolean;
  totalEnteredCount: number;
  missingCount: number;
  absentCount: number;
}

export type GradebookStudentStatus = 'passing' | 'failing' | 'incomplete';

export interface DistributionBucket {
  from: number;
  to: number;
  count: number;
}

export function toGradeNumber(value: GradeNumericValue): number | null {
  if (value === null || value === undefined || value === '') return null;

  const numberValue =
    typeof value === 'object' && 'toNumber' in value
      ? value.toNumber()
      : Number(value);

  return Number.isFinite(numberValue) ? numberValue : null;
}

export function calculateAssessmentPercent(
  score: GradeNumericValue,
  maxScore: GradeNumericValue,
): number | null {
  const scoreValue = toGradeNumber(score);
  const maxScoreValue = toGradeNumber(maxScore);

  if (
    scoreValue === null ||
    maxScoreValue === null ||
    maxScoreValue <= 0
  ) {
    return null;
  }

  return (scoreValue / maxScoreValue) * 100;
}

export function calculateWeightedContribution(
  percent: GradeNumericValue,
  weight: GradeNumericValue,
): number | null {
  const percentValue = toGradeNumber(percent);
  const weightValue = toGradeNumber(weight);

  if (percentValue === null || weightValue === null) return null;

  return (percentValue * weightValue) / 100;
}

export function applyRounding(
  value: GradeNumericValue,
  rounding: GradeRoundingMode | string,
): number | null {
  const numberValue = toGradeNumber(value);
  if (numberValue === null) return null;

  const normalized = String(rounding).trim().toUpperCase();
  if (normalized === GradeRoundingMode.NONE) return numberValue;

  const decimals =
    normalized === GradeRoundingMode.DECIMAL_0
      ? 0
      : normalized === GradeRoundingMode.DECIMAL_1
        ? 1
        : 2;
  const factor = 10 ** decimals;

  return Math.round((numberValue + Number.EPSILON) * factor) / factor;
}

export function calculateGradeCell(
  cell: GradeCalculationCellInput,
  rule: GradeCalculationRule,
): CalculatedGradeCell {
  if (normalizeItemStatus(cell.status) !== GradeItemStatus.ENTERED) {
    return { percent: null, weightedContribution: null };
  }

  const percent = calculateAssessmentPercent(cell.score, cell.maxScore);
  const weightedContribution = calculateWeightedContribution(
    percent,
    cell.weight,
  );

  return {
    percent: applyRounding(percent, rule.rounding),
    weightedContribution: applyRounding(
      weightedContribution,
      rule.rounding,
    ),
  };
}

export function calculateStudentFinalPercent(
  cells: GradeCalculationCellInput[],
  rule: GradeCalculationRule,
): StudentFinalCalculation {
  let rawFinalPercent = 0;
  let completedWeight = 0;
  let totalEnteredCount = 0;
  let missingCount = 0;
  let absentCount = 0;

  for (const cell of cells) {
    const status = normalizeItemStatus(cell.status);

    if (status === GradeItemStatus.MISSING) {
      missingCount += 1;
      continue;
    }

    if (status === GradeItemStatus.ABSENT) {
      absentCount += 1;
      continue;
    }

    if (status !== GradeItemStatus.ENTERED) continue;

    const percent = calculateAssessmentPercent(cell.score, cell.maxScore);
    const contribution = calculateWeightedContribution(percent, cell.weight);
    const weight = toGradeNumber(cell.weight) ?? 0;

    if (contribution === null) continue;

    rawFinalPercent += contribution;
    completedWeight += weight;
    totalEnteredCount += 1;
  }

  const hasEnteredScores = totalEnteredCount > 0;

  return {
    finalPercent: hasEnteredScores
      ? applyRounding(rawFinalPercent, rule.rounding)
      : null,
    completedWeight: applyRounding(completedWeight, rule.rounding) ?? 0,
    hasEnteredScores,
    totalEnteredCount,
    missingCount,
    absentCount,
  };
}

export function deriveGradebookStudentStatus(
  finalPercent: GradeNumericValue,
  hasEnteredScores: boolean,
  rule: GradeCalculationRule,
): GradebookStudentStatus {
  if (!hasEnteredScores) return 'incomplete';

  const finalPercentValue = toGradeNumber(finalPercent) ?? 0;
  const passMark = toGradeNumber(rule.passMark) ?? 50;

  return finalPercentValue >= passMark ? 'passing' : 'failing';
}

export function buildDistributionBuckets(
  values: GradeNumericValue[],
  bucketSize = 10,
): DistributionBucket[] {
  const normalizedBucketSize = clampInteger(bucketSize, 5, 50);
  const buckets: DistributionBucket[] = [];

  for (let from = 0; from < 100; from += normalizedBucketSize) {
    buckets.push({
      from,
      to: Math.min(from + normalizedBucketSize - 1, 100),
      count: 0,
    });
  }

  if (buckets.length > 0) {
    buckets[buckets.length - 1].to = 100;
  }

  for (const value of values) {
    const numberValue = toGradeNumber(value);
    if (numberValue === null) continue;

    const clamped = Math.min(Math.max(numberValue, 0), 100);
    const index =
      clamped >= 100
        ? buckets.length - 1
        : Math.floor(clamped / normalizedBucketSize);
    buckets[index].count += 1;
  }

  return buckets;
}

export function normalizeItemStatus(
  status: GradeItemStatus | string,
): GradeItemStatus {
  const normalized = String(status).trim().toUpperCase();

  switch (normalized) {
    case GradeItemStatus.ENTERED:
      return GradeItemStatus.ENTERED;
    case GradeItemStatus.ABSENT:
      return GradeItemStatus.ABSENT;
    case GradeItemStatus.MISSING:
    default:
      return GradeItemStatus.MISSING;
  }
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.trunc(value), min), max);
}
