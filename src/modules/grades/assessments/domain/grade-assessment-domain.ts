import { HttpStatus } from '@nestjs/common';
import {
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
  GradeAssessmentType,
  GradeScopeType,
} from '@prisma/client';
import {
  DomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import {
  GradeTermWritableLike,
  assertScoreOnlyDeliveryMode,
  assertTermWritable,
  isAssessmentLocked,
  normalizeAssessmentApprovalStatus,
  normalizeDeliveryMode,
} from '../../shared/domain/grade-workflow';
import {
  NormalizedGradeScope,
  ResolveGradeScopeInput,
  resolveGradeScopeInput,
} from '../../shared/domain/grade-scope';

export interface AssessmentCrudLike {
  approvalStatus: GradeAssessmentApprovalStatus | string;
  deliveryMode: GradeAssessmentDeliveryMode | string;
  maxScore?: unknown;
  lockedAt?: Date | string | null;
  isLocked?: boolean | null;
}

export interface AssessmentCrudTermLike extends GradeTermWritableLike {
  startDate?: Date | string | null;
  endDate?: Date | string | null;
}

export interface AssessmentScopePayload {
  scopeType: GradeScopeType;
  scopeKey: string;
  stageId: string | null;
  gradeId: string | null;
  sectionId: string | null;
  classroomId: string | null;
}

export class GradeAssessmentLockedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'grades.assessment.locked',
      message: 'Assessment is locked',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class GradeAssessmentNotPublishedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'grades.assessment.not_published',
      message: 'Assessment must be published first',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class GradeAssessmentNotApprovedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'grades.assessment.not_approved',
      message: 'Assessment must be approved first',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class GradeAssessmentAlreadyPublishedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'grades.assessment.already_published',
      message: 'Assessment is already published',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class GradeAssessmentAlreadyApprovedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'grades.assessment.already_approved',
      message: 'Assessment is already approved',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class GradeAssessmentAlreadyLockedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'grades.assessment.already_locked',
      message: 'Assessment is already locked',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class GradeAssessmentInvalidStatusTransitionException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'grades.assessment.invalid_status_transition',
      message: 'Assessment status transition is invalid',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export function validateAssessmentWeight(value: unknown): number {
  const weight = Number(value);
  if (!Number.isFinite(weight) || weight <= 0 || weight > 100) {
    throw new ValidationDomainException(
      'Assessment weight must be greater than 0 and at most 100',
      { field: 'weight', value },
    );
  }

  return weight;
}

export function validateAssessmentMaxScore(value: unknown): number {
  const maxScore = Number(value);
  if (!Number.isFinite(maxScore) || maxScore <= 0) {
    throw new ValidationDomainException(
      'Assessment max score must be greater than 0',
      { field: 'maxScore', value },
    );
  }

  return maxScore;
}

export function normalizeAssessmentType(
  input: GradeAssessmentType | string,
): GradeAssessmentType {
  const value = String(input).trim().toUpperCase();

  switch (value) {
    case GradeAssessmentType.QUIZ:
      return GradeAssessmentType.QUIZ;
    case GradeAssessmentType.MONTH_EXAM:
      return GradeAssessmentType.MONTH_EXAM;
    case GradeAssessmentType.MIDTERM:
      return GradeAssessmentType.MIDTERM;
    case GradeAssessmentType.TERM_EXAM:
      return GradeAssessmentType.TERM_EXAM;
    case GradeAssessmentType.ASSIGNMENT:
      return GradeAssessmentType.ASSIGNMENT;
    case GradeAssessmentType.FINAL:
      return GradeAssessmentType.FINAL;
    case GradeAssessmentType.PRACTICAL:
      return GradeAssessmentType.PRACTICAL;
    default:
      throw new ValidationDomainException('Assessment type is invalid', {
        field: 'type',
        value: input,
      });
  }
}

export function normalizeScoreOnlyDeliveryMode(
  input?: GradeAssessmentDeliveryMode | string | null,
): GradeAssessmentDeliveryMode {
  const deliveryMode = normalizeDeliveryMode(
    input ?? GradeAssessmentDeliveryMode.SCORE_ONLY,
  );
  assertScoreOnlyDeliveryMode(deliveryMode);
  return deliveryMode;
}

export function assertScoreOnlyAssessment(
  assessment: Pick<AssessmentCrudLike, 'deliveryMode'>,
): void {
  assertScoreOnlyDeliveryMode(assessment.deliveryMode);
}

export function assertAssessmentMutableForCrud(
  assessment: AssessmentCrudLike,
): void {
  assertScoreOnlyAssessment(assessment);

  if (isAssessmentLocked(assessment)) {
    throw new GradeAssessmentLockedException();
  }

  if (
    normalizeAssessmentApprovalStatus(assessment.approvalStatus) !==
    GradeAssessmentApprovalStatus.DRAFT
  ) {
    throw new GradeAssessmentInvalidStatusTransitionException({
      approvalStatus: assessment.approvalStatus,
    });
  }
}

export function assertAssessmentDeletableForCrud(
  assessment: AssessmentCrudLike,
): void {
  assertAssessmentMutableForCrud(assessment);
}

export function assertPublishableAssessment(
  assessment: AssessmentCrudLike,
): void {
  assertScoreOnlyAssessment(assessment);
  validateWorkflowMaxScore(assessment);

  if (isAssessmentLocked(assessment)) {
    throw new GradeAssessmentLockedException();
  }

  const approvalStatus = normalizeAssessmentApprovalStatus(
    assessment.approvalStatus,
  );
  if (approvalStatus === GradeAssessmentApprovalStatus.DRAFT) return;
  if (approvalStatus === GradeAssessmentApprovalStatus.PUBLISHED) {
    throw new GradeAssessmentAlreadyPublishedException({
      approvalStatus,
    });
  }
  if (approvalStatus === GradeAssessmentApprovalStatus.APPROVED) {
    throw new GradeAssessmentAlreadyApprovedException({
      approvalStatus,
    });
  }

  throw new GradeAssessmentInvalidStatusTransitionException({
    approvalStatus,
  });
}

export function assertApprovableAssessment(
  assessment: AssessmentCrudLike,
): void {
  validateWorkflowMaxScore(assessment);

  if (isAssessmentLocked(assessment)) {
    throw new GradeAssessmentLockedException();
  }

  const approvalStatus = normalizeAssessmentApprovalStatus(
    assessment.approvalStatus,
  );
  if (approvalStatus === GradeAssessmentApprovalStatus.PUBLISHED) return;
  if (approvalStatus === GradeAssessmentApprovalStatus.DRAFT) {
    throw new GradeAssessmentNotPublishedException({ approvalStatus });
  }
  if (approvalStatus === GradeAssessmentApprovalStatus.APPROVED) {
    throw new GradeAssessmentAlreadyApprovedException({
      approvalStatus,
    });
  }

  throw new GradeAssessmentInvalidStatusTransitionException({
    approvalStatus,
  });
}

export function assertLockableAssessment(assessment: AssessmentCrudLike): void {
  assertScoreOnlyAssessment(assessment);

  if (isAssessmentLocked(assessment)) {
    throw new GradeAssessmentAlreadyLockedException();
  }

  const approvalStatus = normalizeAssessmentApprovalStatus(
    assessment.approvalStatus,
  );
  if (approvalStatus === GradeAssessmentApprovalStatus.APPROVED) return;

  throw new GradeAssessmentNotApprovedException({ approvalStatus });
}

export function assertTermWritableForAssessment(
  term: AssessmentCrudTermLike,
): void {
  assertTermWritable(term);
}

export function assertWorkflowTermWritable(term: AssessmentCrudTermLike): void {
  assertTermWritableForAssessment(term);
}

export function assertDateInsideTerm(
  date: Date,
  term: AssessmentCrudTermLike,
): void {
  if (!term.startDate || !term.endDate) return;

  const assessmentDate = dateOnlyEpoch(date);
  const startDate = dateOnlyEpoch(new Date(term.startDate));
  const endDate = dateOnlyEpoch(new Date(term.endDate));

  if (assessmentDate < startDate || assessmentDate > endDate) {
    throw new ValidationDomainException(
      'Assessment date must be inside the term',
      {
        field: 'date',
        termId: term.id,
        startDate: formatDateOnly(new Date(term.startDate)),
        endDate: formatDateOnly(new Date(term.endDate)),
        date: formatDateOnly(date),
      },
    );
  }
}

export function buildAssessmentScopePayload(
  input: ResolveGradeScopeInput,
): AssessmentScopePayload {
  const scope = resolveGradeScopeInput(input);

  return {
    scopeType: scope.scopeType,
    scopeKey: scope.scopeKey,
    stageId: scope.stageId,
    gradeId: scope.gradeId,
    sectionId: scope.sectionId,
    classroomId: scope.classroomId,
  };
}

export function assertWeightBudget(params: {
  currentWeightTotal: number;
  nextWeight: number;
  maxTotal?: number;
}): void {
  const maxTotal = params.maxTotal ?? 100;
  const nextTotal = params.currentWeightTotal + params.nextWeight;

  if (nextTotal > maxTotal + Number.EPSILON) {
    throw new ValidationDomainException(
      'Assessment weight budget cannot exceed 100 for this subject and scope',
      {
        field: 'weight',
        currentWeightTotal: params.currentWeightTotal,
        nextWeight: params.nextWeight,
        nextTotal,
        maxTotal,
      },
    );
  }
}

export function assertNoGradeItemsForProtectedAssessmentChange(params: {
  gradeItemCount: number;
  changedFields: string[];
}): void {
  if (params.gradeItemCount === 0 || params.changedFields.length === 0) {
    return;
  }

  throw new GradeAssessmentInvalidStatusTransitionException({
    reason: 'grade_items_exist',
    changedFields: params.changedFields,
    gradeItemCount: params.gradeItemCount,
  });
}

export function dateOnlyEpoch(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function hasOwn<T extends object>(object: T, key: keyof T): boolean {
  return (
    Object.prototype.hasOwnProperty.call(object, key) &&
    object[key] !== undefined
  );
}

export function normalizeNullableText(value: unknown): string | null {
  if (value === undefined || value === null) return null;

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

export function normalizeOptionalTextForPatch(value: unknown): string | null {
  return normalizeNullableText(value);
}

export function areScopesEqual(
  first: Pick<
    NormalizedGradeScope,
    | 'scopeType'
    | 'scopeKey'
    | 'stageId'
    | 'gradeId'
    | 'sectionId'
    | 'classroomId'
  >,
  second: Pick<
    NormalizedGradeScope,
    | 'scopeType'
    | 'scopeKey'
    | 'stageId'
    | 'gradeId'
    | 'sectionId'
    | 'classroomId'
  >,
): boolean {
  return (
    first.scopeType === second.scopeType &&
    first.scopeKey === second.scopeKey &&
    first.stageId === second.stageId &&
    first.gradeId === second.gradeId &&
    first.sectionId === second.sectionId &&
    first.classroomId === second.classroomId
  );
}

function validateWorkflowMaxScore(assessment: AssessmentCrudLike): void {
  if (assessment.maxScore === undefined) return;
  validateAssessmentMaxScore(assessment.maxScore);
}
