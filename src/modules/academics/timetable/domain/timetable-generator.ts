import { TimetableEntryStatus } from '@prisma/client';
import {
  ReconciledTimetableDemand,
  canonicalTimetableDemandKey,
} from './canonical-timetable-demand';
import {
  findTimetableIntervalConflicts,
  timetableEntryToConflictSource,
  TimetableIntervalConflictSource,
} from './timetable-conflicts';
import { validateTimetableTimeRange } from './timetable-time';
import {
  TimetableEntryRecord,
  TimetablePeriodRecord,
  TimetableTeacherAllocationRecord,
} from '../infrastructure/timetable.repository';

export const MAX_TIMETABLE_GENERATION_SEARCH_NODES = 50_000;

export type TimetableGenerationUnresolvedCode =
  | 'missing_teacher_allocation'
  | 'no_feasible_slot'
  | 'existing_over_scheduled'
  | 'search_budget_exhausted';

export interface TimetableGenerationUnresolved {
  code: TimetableGenerationUnresolvedCode;
  classroomId: string | null;
  subjectId: string | null;
  requiredWeeklySlots: number | null;
  scheduledWeeklySlots: number | null;
  remainingWeeklySlots: number;
}

export interface TimetableGenerationProposal {
  proposedIndex: number;
  schoolId: string;
  academicYearId: string;
  termId: string;
  timetableConfigId: string;
  periodId: string;
  dayOfWeek: number;
  gradeId: string;
  sectionId: string;
  classroomId: string;
  subjectId: string;
  teacherUserId: string;
  teacherSubjectAllocationId: string;
  roomId: null;
  period: TimetablePeriodRecord;
}

export interface TimetableGenerationPlan {
  proposals: TimetableGenerationProposal[];
  unresolved: TimetableGenerationUnresolved[];
  searchNodesVisited: number;
  searchBudgetExhausted: boolean;
}

interface GenerationTask {
  demand: ReconciledTimetableDemand;
  unitIndex: number;
  candidates: TimetableGenerationProposal[];
}

export function buildTimetableGenerationPlan(input: {
  timetableConfigId: string;
  activeDays: number[];
  demand: ReconciledTimetableDemand[];
  periods: TimetablePeriodRecord[];
  teacherAllocations: TimetableTeacherAllocationRecord[];
  existingTermEntries: TimetableEntryRecord[];
  searchNodeBudget?: number;
}): TimetableGenerationPlan {
  const searchNodeBudget =
    input.searchNodeBudget ?? MAX_TIMETABLE_GENERATION_SEARCH_NODES;
  const periods = input.periods
    .filter(
      (period) =>
        period.timetableConfigId === input.timetableConfigId &&
        period.isInstructional,
    )
    .map((period) => {
      validateTimetableTimeRange(period);
      return period;
    })
    .sort(
      (left, right) =>
        left.periodIndex - right.periodIndex || left.id.localeCompare(right.id),
    );
  const activeDays = [...new Set(input.activeDays)].sort(
    (left, right) => left - right,
  );
  const allocationsById = new Map(
    input.teacherAllocations.map((allocation) => [allocation.id, allocation]),
  );
  const existingSources = input.existingTermEntries
    .filter((entry) => entry.status !== TimetableEntryStatus.CANCELLED)
    .map(timetableEntryToConflictSource);
  const existingTeacherWorkload = countBy(
    existingSources,
    (source) => source.teacherUserId,
  );
  const unresolved: TimetableGenerationUnresolved[] = [];
  const tasks: GenerationTask[] = [];

  for (const demand of [...input.demand].sort(compareDemandIdentity)) {
    if (demand.scheduledWeeklySlots > demand.requiredWeeklySlots) {
      unresolved.push(unresolvedFor(demand, 'existing_over_scheduled', 0));
      continue;
    }
    if (demand.teacherSubjectAllocationIds.length === 0) {
      unresolved.push(
        unresolvedFor(
          demand,
          'missing_teacher_allocation',
          demand.remainingWeeklySlots,
        ),
      );
      continue;
    }
    if (demand.remainingWeeklySlots === 0) continue;

    const candidates = buildDemandCandidates({
      timetableConfigId: input.timetableConfigId,
      activeDays,
      demand,
      periods,
      allocationsById,
      existingSources,
      existingTeacherWorkload,
    });
    for (
      let unitIndex = 0;
      unitIndex < demand.remainingWeeklySlots;
      unitIndex += 1
    ) {
      tasks.push({ demand, unitIndex, candidates });
    }
  }

  tasks.sort(compareGenerationTasks);
  if (tasks.length > searchNodeBudget) {
    return budgetExhaustedPlan(searchNodeBudget);
  }

  let searchNodesVisited = 0;
  let searchBudgetExhausted = false;
  let bestProposals: TimetableGenerationProposal[] = [];

  const search = (
    taskIndex: number,
    proposals: TimetableGenerationProposal[],
    proposalSources: TimetableIntervalConflictSource[],
  ): void => {
    if (bestProposals.length === tasks.length || searchBudgetExhausted) return;
    if (searchNodesVisited >= searchNodeBudget) {
      searchBudgetExhausted = true;
      return;
    }
    searchNodesVisited += 1;

    if (taskIndex === tasks.length) {
      if (proposals.length > bestProposals.length) {
        bestProposals = proposals;
      }
      return;
    }
    if (proposals.length + (tasks.length - taskIndex) <= bestProposals.length) {
      return;
    }

    const task = tasks[taskIndex];
    const proposalWorkload = countBy(
      proposalSources,
      (source) => source.teacherUserId,
    );
    const candidates = task.candidates
      .filter(
        (candidate) =>
          !candidateConflicts(proposalToConflictSource(candidate), [
            ...existingSources,
            ...proposalSources,
          ]),
      )
      .sort((left, right) =>
        compareCandidates(
          left,
          right,
          existingTeacherWorkload,
          proposalWorkload,
        ),
      );

    for (const candidate of candidates) {
      const proposal: TimetableGenerationProposal = {
        ...candidate,
        proposedIndex: proposals.length,
      };
      search(
        taskIndex + 1,
        [...proposals, proposal],
        [...proposalSources, proposalToConflictSource(proposal)],
      );
      if (bestProposals.length === tasks.length || searchBudgetExhausted)
        return;
    }

    search(taskIndex + 1, proposals, proposalSources);
  };

  search(0, [], []);
  if (searchBudgetExhausted && bestProposals.length !== tasks.length) {
    return budgetExhaustedPlan(searchNodesVisited);
  }

  const plannedByDemand = countBy(bestProposals, (proposal) =>
    canonicalTimetableDemandKey(proposal),
  );
  for (const taskGroup of uniqueDemandTasks(tasks)) {
    const planned =
      plannedByDemand.get(canonicalTimetableDemandKey(taskGroup.demand)) ?? 0;
    if (planned < taskGroup.demand.remainingWeeklySlots) {
      unresolved.push(
        unresolvedFor(
          taskGroup.demand,
          'no_feasible_slot',
          taskGroup.demand.remainingWeeklySlots - planned,
        ),
      );
    }
  }

  return {
    proposals: bestProposals.map((proposal, proposedIndex) => ({
      ...proposal,
      proposedIndex,
    })),
    unresolved: unresolved.sort(compareUnresolved),
    searchNodesVisited,
    searchBudgetExhausted: false,
  };
}

function buildDemandCandidates(input: {
  timetableConfigId: string;
  activeDays: number[];
  demand: ReconciledTimetableDemand;
  periods: TimetablePeriodRecord[];
  allocationsById: Map<string, TimetableTeacherAllocationRecord>;
  existingSources: TimetableIntervalConflictSource[];
  existingTeacherWorkload: Map<string, number>;
}): TimetableGenerationProposal[] {
  const candidates: TimetableGenerationProposal[] = [];
  for (const allocationId of [
    ...input.demand.teacherSubjectAllocationIds,
  ].sort()) {
    const allocation = input.allocationsById.get(allocationId);
    if (
      !allocation ||
      allocation.schoolId !== input.demand.schoolId ||
      allocation.termId !== input.demand.termId ||
      allocation.classroomId !== input.demand.classroomId ||
      allocation.subjectId !== input.demand.subjectId
    ) {
      continue;
    }
    for (const dayOfWeek of input.activeDays) {
      for (const period of input.periods) {
        const candidate: TimetableGenerationProposal = {
          proposedIndex: 0,
          schoolId: input.demand.schoolId,
          academicYearId: input.demand.academicYearId,
          termId: input.demand.termId,
          timetableConfigId: input.timetableConfigId,
          periodId: period.id,
          dayOfWeek,
          gradeId: input.demand.gradeId,
          sectionId: input.demand.classroom.sectionId,
          classroomId: input.demand.classroomId,
          subjectId: input.demand.subjectId,
          teacherUserId: allocation.teacherUserId,
          teacherSubjectAllocationId: allocation.id,
          roomId: null,
          period,
        };
        if (
          !candidateConflicts(
            proposalToConflictSource(candidate),
            input.existingSources,
          )
        ) {
          candidates.push(candidate);
        }
      }
    }
  }

  return candidates.sort((left, right) =>
    compareCandidates(left, right, input.existingTeacherWorkload, new Map()),
  );
}

function candidateConflicts(
  candidate: TimetableIntervalConflictSource,
  fixedSources: TimetableIntervalConflictSource[],
): boolean {
  const relevantSources = fixedSources.filter(
    (source) =>
      source.schoolId === candidate.schoolId &&
      source.termId === candidate.termId &&
      source.dayOfWeek === candidate.dayOfWeek &&
      (source.classroomId === candidate.classroomId ||
        source.teacherUserId === candidate.teacherUserId ||
        (candidate.roomId !== null && source.roomId === candidate.roomId)),
  );
  return findTimetableIntervalConflicts([candidate, ...relevantSources]).some(
    (conflict) =>
      conflict.first.identity === candidate.identity ||
      conflict.second.identity === candidate.identity,
  );
}

function proposalToConflictSource(
  proposal: TimetableGenerationProposal,
): TimetableIntervalConflictSource {
  return {
    identity: [
      'proposed',
      proposal.classroomId,
      proposal.subjectId,
      proposal.dayOfWeek,
      proposal.periodId,
      proposal.teacherSubjectAllocationId,
      proposal.proposedIndex,
    ].join(':'),
    schoolId: proposal.schoolId,
    termId: proposal.termId,
    timetableConfigId: proposal.timetableConfigId,
    entryId: null,
    proposedIndex: proposal.proposedIndex,
    classroomId: proposal.classroomId,
    teacherUserId: proposal.teacherUserId,
    roomId: null,
    dayOfWeek: proposal.dayOfWeek,
    periodId: proposal.periodId,
    startTime: proposal.period.startTime,
    endTime: proposal.period.endTime,
  };
}

function compareGenerationTasks(
  left: GenerationTask,
  right: GenerationTask,
): number {
  return (
    left.demand.teacherSubjectAllocationIds.length -
      right.demand.teacherSubjectAllocationIds.length ||
    left.candidates.length - right.candidates.length ||
    right.demand.remainingWeeklySlots - left.demand.remainingWeeklySlots ||
    left.demand.classroomId.localeCompare(right.demand.classroomId) ||
    left.demand.subjectId.localeCompare(right.demand.subjectId) ||
    left.unitIndex - right.unitIndex
  );
}

function compareCandidates(
  left: TimetableGenerationProposal,
  right: TimetableGenerationProposal,
  existingWorkload: Map<string, number>,
  proposalWorkload: Map<string, number>,
): number {
  const leftWorkload =
    (existingWorkload.get(left.teacherUserId) ?? 0) +
    (proposalWorkload.get(left.teacherUserId) ?? 0);
  const rightWorkload =
    (existingWorkload.get(right.teacherUserId) ?? 0) +
    (proposalWorkload.get(right.teacherUserId) ?? 0);
  return (
    leftWorkload - rightWorkload ||
    left.teacherUserId.localeCompare(right.teacherUserId) ||
    left.teacherSubjectAllocationId.localeCompare(
      right.teacherSubjectAllocationId,
    ) ||
    left.dayOfWeek - right.dayOfWeek ||
    left.period.periodIndex - right.period.periodIndex ||
    left.periodId.localeCompare(right.periodId)
  );
}

function compareDemandIdentity(
  left: ReconciledTimetableDemand,
  right: ReconciledTimetableDemand,
): number {
  return (
    left.classroomId.localeCompare(right.classroomId) ||
    left.subjectId.localeCompare(right.subjectId)
  );
}

function unresolvedFor(
  demand: ReconciledTimetableDemand,
  code: Exclude<TimetableGenerationUnresolvedCode, 'search_budget_exhausted'>,
  remainingWeeklySlots: number,
): TimetableGenerationUnresolved {
  return {
    code,
    classroomId: demand.classroomId,
    subjectId: demand.subjectId,
    requiredWeeklySlots: demand.requiredWeeklySlots,
    scheduledWeeklySlots: demand.scheduledWeeklySlots,
    remainingWeeklySlots,
  };
}

function budgetExhaustedPlan(
  searchNodesVisited: number,
): TimetableGenerationPlan {
  return {
    proposals: [],
    unresolved: [
      {
        code: 'search_budget_exhausted',
        classroomId: null,
        subjectId: null,
        requiredWeeklySlots: null,
        scheduledWeeklySlots: null,
        remainingWeeklySlots: 0,
      },
    ],
    searchNodesVisited,
    searchBudgetExhausted: true,
  };
}

function compareUnresolved(
  left: TimetableGenerationUnresolved,
  right: TimetableGenerationUnresolved,
): number {
  return (
    left.code.localeCompare(right.code) ||
    (left.classroomId ?? '').localeCompare(right.classroomId ?? '') ||
    (left.subjectId ?? '').localeCompare(right.subjectId ?? '')
  );
}

function uniqueDemandTasks(tasks: GenerationTask[]): GenerationTask[] {
  const result = new Map<string, GenerationTask>();
  for (const task of tasks) {
    result.set(canonicalTimetableDemandKey(task.demand), task);
  }
  return [...result.values()].sort((left, right) =>
    compareDemandIdentity(left.demand, right.demand),
  );
}

function countBy<T>(
  items: T[],
  keyFor: (item: T) => string,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyFor(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
