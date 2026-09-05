import {
  hasCurriculumDependencyConflict,
  SubjectAllocationMutationImpact,
} from '../domain/subject-allocation-mutation.policy';
import { SubjectAllocationDependencyConflictException } from '../domain/subject-allocation.exceptions';

export function assertCurriculumMutationAllowed(
  termId: string,
  changes: SubjectAllocationMutationImpact[],
): void {
  const conflict = changes.find(hasCurriculumDependencyConflict);
  if (!conflict) return;

  // One affected pair and aggregate counts keep the error bounded even for bulk requests.
  throw new SubjectAllocationDependencyConflictException({
    termId,
    gradeId: conflict.gradeId,
    subjectId: conflict.subjectId,
    mutation: conflict.type,
    previousWeeklyHours: conflict.previousWeeklyHours,
    proposedWeeklyHours: conflict.proposedWeeklyHours,
    ...conflict.dependencies,
  });
}
