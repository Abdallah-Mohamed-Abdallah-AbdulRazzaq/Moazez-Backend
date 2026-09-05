import { isActiveCurriculumRequirement } from './active-curriculum.policy';

export type SubjectAllocationMutationType =
  | 'ADD'
  | 'UNCHANGED'
  | 'ACTIVATE'
  | 'DEACTIVATE'
  | 'POSITIVE_REQUIREMENT_CHANGE';

export interface SubjectAllocationDependencyCounts {
  teacherAllocationCount: number;
  draftTimetableEntryCount: number;
  publishedTimetableEntryCount: number;
  publishedTimetableConfigCount: number;
}

export interface SubjectAllocationMutation {
  gradeId: string;
  subjectId: string;
  previousWeeklyHours: number | null;
  proposedWeeklyHours: number;
  type: SubjectAllocationMutationType;
}

export interface SubjectAllocationMutationImpact extends SubjectAllocationMutation {
  dependencies: SubjectAllocationDependencyCounts;
}

export function classifySubjectAllocationMutation(
  current: { weeklyHours: number } | null,
  proposed: { gradeId: string; subjectId: string; weeklyHours: number },
): SubjectAllocationMutation {
  let type: SubjectAllocationMutationType;
  if (!current) {
    type = 'ADD';
  } else if (current.weeklyHours === proposed.weeklyHours) {
    type = 'UNCHANGED';
  } else if (!isActiveCurriculumRequirement(current)) {
    // Non-positive legacy values have the same untaught semantics as zero.
    type = isActiveCurriculumRequirement(proposed) ? 'ACTIVATE' : 'UNCHANGED';
  } else {
    type = isActiveCurriculumRequirement(proposed)
      ? 'POSITIVE_REQUIREMENT_CHANGE'
      : 'DEACTIVATE';
  }
  return {
    gradeId: proposed.gradeId,
    subjectId: proposed.subjectId,
    previousWeeklyHours: current?.weeklyHours ?? null,
    proposedWeeklyHours: proposed.weeklyHours,
    type,
  };
}

export function requiresCurriculumDependencyCheck(
  mutation: SubjectAllocationMutation,
): boolean {
  return (
    mutation.type === 'DEACTIVATE' ||
    mutation.type === 'POSITIVE_REQUIREMENT_CHANGE'
  );
}

export function hasCurriculumDependencyConflict(
  impact: SubjectAllocationMutationImpact,
): boolean {
  if (!requiresCurriculumDependencyCheck(impact)) return false;
  const counts = impact.dependencies;
  if (
    counts.publishedTimetableEntryCount > 0 ||
    counts.publishedTimetableConfigCount > 0
  ) {
    return true;
  }
  return (
    impact.type === 'DEACTIVATE' &&
    (counts.teacherAllocationCount > 0 || counts.draftTimetableEntryCount > 0)
  );
}
