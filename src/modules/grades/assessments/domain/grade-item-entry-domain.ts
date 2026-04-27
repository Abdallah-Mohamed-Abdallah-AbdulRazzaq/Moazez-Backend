import { HttpStatus } from '@nestjs/common';
import {
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
  GradeItemStatus,
  GradeScopeType,
} from '@prisma/client';
import {
  DomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import {
  GradeNumericValue,
  normalizeGradeItemStatus,
  validateGradeItemStatusAndScore,
} from '../../shared/domain/grade-item-validation';
import {
  GradeTermWritableLike,
  assertScoreOnlyDeliveryMode,
  assertTermWritable,
  isAssessmentLocked,
  normalizeAssessmentApprovalStatus,
} from '../../shared/domain/grade-workflow';
import {
  GradeAssessmentLockedException,
  GradeAssessmentNotPublishedException,
} from './grade-assessment-domain';

export interface GradeItemAssessmentLike {
  id: string;
  schoolId: string;
  academicYearId: string;
  termId: string;
  scopeType: GradeScopeType | string;
  scopeKey: string;
  stageId?: string | null;
  gradeId?: string | null;
  sectionId?: string | null;
  classroomId?: string | null;
  deliveryMode: GradeAssessmentDeliveryMode | string;
  approvalStatus: GradeAssessmentApprovalStatus | string;
  maxScore: GradeNumericValue;
  lockedAt?: Date | string | null;
  isLocked?: boolean | null;
}

export interface GradeItemEnrollmentLike {
  id: string;
  studentId: string;
  academicYearId: string;
  termId?: string | null;
  classroomId: string;
  classroom?: {
    id: string;
    sectionId?: string | null;
    section?: {
      id: string;
      gradeId?: string | null;
      grade?: {
        id: string;
        stageId?: string | null;
      } | null;
    } | null;
  } | null;
}

export interface GradeItemEntryCommand {
  studentId?: string;
  status: GradeItemStatus | string;
  score?: number | string | null;
  comment?: string | null;
}

export interface NormalizedGradeItemEntryPayload {
  status: GradeItemStatus;
  score: number | null;
  comment: string | null;
}

export interface NormalizedBulkGradeItemEntryPayload extends NormalizedGradeItemEntryPayload {
  studentId: string;
}

export interface GradeItemUpsertPayload extends NormalizedGradeItemEntryPayload {
  schoolId: string;
  termId: string;
  assessmentId: string;
  studentId: string;
  enrollmentId: string | null;
  enteredById: string | null;
  enteredAt: Date;
}

export class GradebookNoEnrollmentException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'grades.gradebook.no_enrollment',
      message: 'Student has no enrollment for this gradebook context',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export function assertAssessmentAcceptsGradeItems(
  assessment: GradeItemAssessmentLike,
  term: GradeTermWritableLike,
): void {
  assertScoreOnlyDeliveryMode(assessment.deliveryMode);
  assertAssessmentNotLockedForGradeEntry(assessment);
  assertAssessmentPublishedOrApprovedForGradeEntry(assessment);
  assertTermWritable(term);
}

export function assertAssessmentNotLockedForGradeEntry(
  assessment: Pick<GradeItemAssessmentLike, 'lockedAt' | 'isLocked'>,
): void {
  if (isAssessmentLocked(assessment)) {
    throw new GradeAssessmentLockedException();
  }
}

export function assertAssessmentPublishedOrApprovedForGradeEntry(
  assessment: Pick<GradeItemAssessmentLike, 'approvalStatus'>,
): void {
  const approvalStatus = normalizeAssessmentApprovalStatus(
    assessment.approvalStatus,
  );

  if (
    approvalStatus === GradeAssessmentApprovalStatus.PUBLISHED ||
    approvalStatus === GradeAssessmentApprovalStatus.APPROVED
  ) {
    return;
  }

  throw new GradeAssessmentNotPublishedException({ approvalStatus });
}

export function normalizeGradeItemEntryPayload(
  command: GradeItemEntryCommand,
  maxScore: GradeNumericValue,
): NormalizedGradeItemEntryPayload {
  const status = normalizeGradeItemStatus(command.status);
  const comment = normalizeNullableComment(command.comment);

  if (status !== GradeItemStatus.ENTERED) {
    return {
      status,
      score: null,
      comment,
    };
  }

  validateGradeItemStatusAndScore(status, command.score, maxScore);

  return {
    status,
    score: Number(command.score),
    comment,
  };
}

export function validateBulkGradeItemPayload(
  items: GradeItemEntryCommand[],
  maxScore: GradeNumericValue,
): NormalizedBulkGradeItemEntryPayload[] {
  assertNoDuplicateStudentIds(items);

  return items.map((item) => {
    if (!item.studentId) {
      throw new ValidationDomainException('Student id is required', {
        field: 'studentId',
      });
    }

    return {
      ...normalizeGradeItemEntryPayload(item, maxScore),
      studentId: item.studentId,
    };
  });
}

export function assertNoDuplicateStudentIds(
  items: GradeItemEntryCommand[],
): void {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const item of items) {
    if (!item.studentId) continue;
    if (seen.has(item.studentId)) {
      duplicates.add(item.studentId);
      continue;
    }

    seen.add(item.studentId);
  }

  if (duplicates.size > 0) {
    throw new ValidationDomainException(
      'Duplicate student ids are not allowed in bulk grade entry',
      { field: 'items.studentId', duplicateStudentIds: [...duplicates] },
    );
  }
}

export function buildGradeItemUpsertPayload(params: {
  assessment: GradeItemAssessmentLike;
  studentId: string;
  enrollmentId: string | null;
  normalized: NormalizedGradeItemEntryPayload;
  enteredById: string | null;
  enteredAt: Date;
}): GradeItemUpsertPayload {
  return {
    schoolId: params.assessment.schoolId,
    termId: params.assessment.termId,
    assessmentId: params.assessment.id,
    studentId: params.studentId,
    enrollmentId: params.enrollmentId,
    status: params.normalized.status,
    score: params.normalized.score,
    comment: params.normalized.comment,
    enteredById: params.enteredById,
    enteredAt: params.enteredAt,
  };
}

export function validateStudentWithinAssessmentScope(params: {
  assessment: GradeItemAssessmentLike;
  enrollment: GradeItemEnrollmentLike;
}): void {
  if (
    params.enrollment.academicYearId !== params.assessment.academicYearId ||
    (params.enrollment.termId &&
      params.enrollment.termId !== params.assessment.termId)
  ) {
    throwNoEnrollment(params);
  }

  if (!isEnrollmentInsideAssessmentScope(params)) {
    throwNoEnrollment(params);
  }
}

function isEnrollmentInsideAssessmentScope(params: {
  assessment: GradeItemAssessmentLike;
  enrollment: GradeItemEnrollmentLike;
}): boolean {
  const classroom = params.enrollment.classroom;
  const section = classroom?.section;
  const grade = section?.grade;

  switch (params.assessment.scopeType) {
    case GradeScopeType.SCHOOL:
      return true;
    case GradeScopeType.STAGE:
      return grade?.stageId === params.assessment.stageId;
    case GradeScopeType.GRADE:
      return section?.gradeId === params.assessment.gradeId;
    case GradeScopeType.SECTION:
      return classroom?.sectionId === params.assessment.sectionId;
    case GradeScopeType.CLASSROOM:
      return params.enrollment.classroomId === params.assessment.classroomId;
    default:
      return false;
  }
}

function throwNoEnrollment(params: {
  assessment: GradeItemAssessmentLike;
  enrollment: GradeItemEnrollmentLike;
}): never {
  throw new GradebookNoEnrollmentException({
    assessmentId: params.assessment.id,
    studentId: params.enrollment.studentId,
  });
}

function normalizeNullableComment(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) return null;

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}
