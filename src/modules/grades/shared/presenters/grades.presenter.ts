import {
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
  GradeItemStatus,
  GradeScopeType,
} from '@prisma/client';
import {
  mapScopeTypeToResponse,
  normalizeGradeScopeType,
} from '../domain/grade-scope';
import {
  normalizeAssessmentApprovalStatus,
  normalizeDeliveryMode,
} from '../domain/grade-workflow';
import { normalizeGradeItemStatus } from '../domain/grade-item-validation';

export type PresentableDecimal =
  | number
  | string
  | { toNumber: () => number }
  | null
  | undefined;

export function presentGradeScopeType(
  scopeType: GradeScopeType | string,
): string {
  return mapScopeTypeToResponse(normalizeGradeScopeType(scopeType));
}

export function presentAssessmentApprovalStatus(
  status: GradeAssessmentApprovalStatus | string,
): string {
  return normalizeAssessmentApprovalStatus(status).toLowerCase();
}

export function presentDeliveryMode(
  mode: GradeAssessmentDeliveryMode | string,
): string {
  const deliveryMode = normalizeDeliveryMode(mode);
  return deliveryMode === GradeAssessmentDeliveryMode.QUESTION_BASED
    ? 'question_based'
    : deliveryMode;
}

export function presentGradeItemStatus(
  status: GradeItemStatus | string,
): string {
  return normalizeGradeItemStatus(status).toLowerCase();
}

export function presentDecimal(value: PresentableDecimal): number | null {
  if (value === null || value === undefined || value === '') return null;

  const numberValue =
    typeof value === 'object' && 'toNumber' in value
      ? value.toNumber()
      : Number(value);

  return Number.isFinite(numberValue) ? numberValue : null;
}
