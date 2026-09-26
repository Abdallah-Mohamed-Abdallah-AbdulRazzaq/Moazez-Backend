import { AcademicContentTargetScopeType } from '@prisma/client';

export type ResolvedAcademicScope = {
  scopeType: AcademicContentTargetScopeType;
  subjectId: string | null;
  stageId: string | null;
  gradeId: string | null;
  sectionId: string | null;
  classroomId: string | null;
};

/** Two hierarchy scopes intersect if every ancestor known to both agrees. */
export function academicScopesIntersect(
  left: ResolvedAcademicScope,
  right: ResolvedAcademicScope,
): boolean {
  for (const key of [
    'stageId',
    'gradeId',
    'sectionId',
    'classroomId',
  ] as const) {
    if (left[key] && right[key] && left[key] !== right[key]) return false;
  }
  return true;
}

export function academicReferenceMatchesTargets(
  targets: readonly ResolvedAcademicScope[],
  reference: ResolvedAcademicScope,
): boolean {
  return targets.some(
    (target) =>
      !!target.subjectId &&
      target.subjectId === reference.subjectId &&
      academicScopesIntersect(target, reference),
  );
}
