export const TEACHER_ALLOCATION_LIFECYCLE_STATES = [
  'future',
  'historical',
  'current_active',
  'current_inactive',
  'inconsistent',
  'invalid',
] as const;

export type TeacherAllocationLifecycleState =
  (typeof TEACHER_ALLOCATION_LIFECYCLE_STATES)[number];

export interface TeacherAllocationLifecycleTermInput {
  startDate: Date | null;
  endDate: Date | null;
  isActive: boolean;
  deletedAt: Date | null;
  academicYear: {
    isActive: boolean;
    deletedAt: Date | null;
  } | null;
}

export interface TeacherAllocationLifecycleCounts {
  future: number;
  historical: number;
  current_active: number;
  current_inactive: number;
  inconsistent: number;
  invalid: number;
}

export interface TeacherAllocationDependencyCounts {
  timetableEntries: number;
  lessonPlans: number;
  homeworkAssignments: number;
}

export type TeacherAllocationLifecycleIntegrityReason =
  | 'none'
  | 'active_or_future_allocations'
  | 'current_inactive_allocations'
  | 'inconsistent_term_state'
  | 'invalid_term_state';

export interface TeacherAllocationLifecycleSummary {
  counts: TeacherAllocationLifecycleCounts;
  currentActiveCount: number;
  futureCount: number;
  currentInactiveCount: number;
  inconsistentCount: number;
  invalidCount: number;
  historicalCount: number;
  blockingCount: number;
  integrityRiskCount: number;
  reassignmentRequired: boolean;
  integrityReason: TeacherAllocationLifecycleIntegrityReason;
  dependencyCounts: TeacherAllocationDependencyCounts;
}

export type TeacherAllocationLifecycleOperation =
  | 'account_disable'
  | 'membership_suspend'
  | 'employment_inactive'
  | 'employment_terminated'
  | 'role_demotion'
  | 'profile_archive';

export interface TeacherAllocationLifecycleGate {
  blocked: boolean;
  reassignmentRequired: boolean;
  reason: 'none' | 'active_or_future_allocations' | 'allocation_integrity_risk';
}

export function classifyTeacherAllocationTermState(
  term: TeacherAllocationLifecycleTermInput | null,
  asOf: Date,
): TeacherAllocationLifecycleState {
  const asOfTime = dateToTime(asOf);
  if (asOfTime === null || term === null || term.academicYear === null) {
    return 'invalid';
  }
  const startTime = dateToTime(term.startDate);
  const endTime = dateToTime(term.endDate);
  if (startTime === null || endTime === null) return 'invalid';
  if (startTime > endTime) return 'inconsistent';

  const academicYearIsActive =
    term.academicYear.isActive && term.academicYear.deletedAt === null;
  if (startTime > asOfTime) {
    return term.isActive ? 'inconsistent' : 'future';
  }
  if (endTime < asOfTime) {
    return term.isActive ? 'inconsistent' : 'historical';
  }
  if (term.isActive && (term.deletedAt !== null || !academicYearIsActive)) {
    return 'inconsistent';
  }
  return term.isActive && academicYearIsActive
    ? 'current_active'
    : 'current_inactive';
}

export function summarizeTeacherAllocationLifecycleStates(
  states: readonly TeacherAllocationLifecycleState[],
  dependencyCounts: TeacherAllocationDependencyCounts = {
    timetableEntries: 0,
    lessonPlans: 0,
    homeworkAssignments: 0,
  },
): TeacherAllocationLifecycleSummary {
  const counts: TeacherAllocationLifecycleCounts = {
    future: 0,
    historical: 0,
    current_active: 0,
    current_inactive: 0,
    inconsistent: 0,
    invalid: 0,
  };
  for (const state of states) counts[state] += 1;

  const blockingCount = counts.current_active + counts.future;
  const integrityRiskCount =
    counts.current_inactive + counts.inconsistent + counts.invalid;
  return {
    counts,
    currentActiveCount: counts.current_active,
    futureCount: counts.future,
    currentInactiveCount: counts.current_inactive,
    inconsistentCount: counts.inconsistent,
    invalidCount: counts.invalid,
    historicalCount: counts.historical,
    blockingCount,
    integrityRiskCount,
    reassignmentRequired: blockingCount > 0,
    integrityReason: resolveIntegrityReason(counts),
    dependencyCounts: { ...dependencyCounts },
  };
}

export function evaluateTeacherAllocationLifecycleGate(
  summary: TeacherAllocationLifecycleSummary,
  operation: TeacherAllocationLifecycleOperation,
): TeacherAllocationLifecycleGate {
  if (
    operation === 'account_disable' ||
    operation === 'membership_suspend' ||
    operation === 'employment_inactive' ||
    operation === 'employment_terminated'
  ) {
    return {
      blocked: false,
      reassignmentRequired:
        operation === 'employment_inactive' ||
        operation === 'employment_terminated'
          ? summary.reassignmentRequired
          : false,
      reason: 'none',
    };
  }

  if (summary.integrityRiskCount > 0) {
    return {
      blocked: true,
      reassignmentRequired: summary.reassignmentRequired,
      reason: 'allocation_integrity_risk',
    };
  }
  if (summary.blockingCount > 0) {
    return {
      blocked: true,
      reassignmentRequired: true,
      reason: 'active_or_future_allocations',
    };
  }
  return { blocked: false, reassignmentRequired: false, reason: 'none' };
}

function resolveIntegrityReason(
  counts: TeacherAllocationLifecycleCounts,
): TeacherAllocationLifecycleIntegrityReason {
  if (counts.invalid > 0) return 'invalid_term_state';
  if (counts.inconsistent > 0) return 'inconsistent_term_state';
  if (counts.current_inactive > 0) return 'current_inactive_allocations';
  if (counts.current_active + counts.future > 0) {
    return 'active_or_future_allocations';
  }
  return 'none';
}

function dateToTime(value: Date | null): number | null {
  if (!(value instanceof Date)) return null;
  const timestamp = value.getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}
