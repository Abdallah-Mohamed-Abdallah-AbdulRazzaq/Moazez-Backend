import {
  DismissalClassroomScopeRecord,
  DismissalGradeScopeRecord,
  DismissalSectionScopeRecord,
  DismissalStageScopeRecord,
} from '../infrastructure/dismissal-staff-assignments.repository';
import {
  DismissalStaffAssignmentInvalidTimeWindowException,
  DismissalStaffAssignmentScopeMismatchException,
  DismissalStaffAssignmentScopeRequiredException,
} from '../../shared/dismissal.errors';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';

export interface AssignmentScopeIds {
  gateId: string | null;
  stageId: string | null;
  gradeId: string | null;
  sectionId: string | null;
  classroomId: string | null;
}

export interface AssignmentScopeRecords {
  stage: DismissalStageScopeRecord | null;
  grade: DismissalGradeScopeRecord | null;
  section: DismissalSectionScopeRecord | null;
  classroom: DismissalClassroomScopeRecord | null;
}

export function normalizeOptionalText(
  value: unknown,
  maxLength: number,
): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw new ValidationDomainException();
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed.slice(0, maxLength);
}

export function parseOptionalDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') {
    throw new DismissalStaffAssignmentInvalidTimeWindowException();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new DismissalStaffAssignmentInvalidTimeWindowException();
  }

  return parsed;
}

export function validateTimeWindow(params: {
  startsAt: Date | null;
  endsAt: Date | null;
}): void {
  if (params.startsAt && params.endsAt && params.startsAt >= params.endsAt) {
    throw new DismissalStaffAssignmentInvalidTimeWindowException();
  }
}

export function validateScopeRequired(scope: AssignmentScopeIds): void {
  if (
    !scope.gateId &&
    !scope.stageId &&
    !scope.gradeId &&
    !scope.sectionId &&
    !scope.classroomId
  ) {
    throw new DismissalStaffAssignmentScopeRequiredException();
  }
}

export function validateAcademicScopeConsistency(params: {
  scope: AssignmentScopeIds;
  records: AssignmentScopeRecords;
}): void {
  const { scope, records } = params;

  if (scope.gradeId && scope.stageId && records.grade?.stageId !== scope.stageId) {
    throw new DismissalStaffAssignmentScopeMismatchException();
  }

  if (scope.sectionId && scope.gradeId && records.section?.gradeId !== scope.gradeId) {
    throw new DismissalStaffAssignmentScopeMismatchException();
  }

  if (
    scope.sectionId &&
    scope.stageId &&
    records.section?.grade.stageId !== scope.stageId
  ) {
    throw new DismissalStaffAssignmentScopeMismatchException();
  }

  if (
    scope.classroomId &&
    scope.sectionId &&
    records.classroom?.sectionId !== scope.sectionId
  ) {
    throw new DismissalStaffAssignmentScopeMismatchException();
  }

  if (
    scope.classroomId &&
    scope.gradeId &&
    records.classroom?.section.gradeId !== scope.gradeId
  ) {
    throw new DismissalStaffAssignmentScopeMismatchException();
  }

  if (
    scope.classroomId &&
    scope.stageId &&
    records.classroom?.section.grade.stageId !== scope.stageId
  ) {
    throw new DismissalStaffAssignmentScopeMismatchException();
  }
}

export function hasOwn<T extends object>(object: T, key: keyof T): boolean {
  return (
    Object.prototype.hasOwnProperty.call(object, key) &&
    (object as Record<string, unknown>)[key as string] !== undefined
  );
}
