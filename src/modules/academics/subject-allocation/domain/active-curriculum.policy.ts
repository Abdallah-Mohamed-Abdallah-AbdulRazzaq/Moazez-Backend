/** SubjectAllocation is the curriculum authority; a persisted zero is not taught. */
export function isActiveCurriculumRequirement<
  T extends { weeklyHours: number },
>(allocation: T | null | undefined): boolean {
  return allocation != null && allocation.weeklyHours > 0;
}
