import { Injectable } from '@nestjs/common';
import { TimetableEntryStatus } from '@prisma/client';
import { requireAcademicsScope } from '../../academics-context';
import {
  buildCanonicalTimetableDemand,
  canonicalTimetableDemandKey,
  reconcileCanonicalTimetableDemand,
} from '../domain/canonical-timetable-demand';
import {
  buildTimetableGenerationPlan,
  TimetableGenerationPlan,
  TimetableGenerationProposal,
} from '../domain/timetable-generator';
import {
  assertConfigMutable,
  assertTermWritable,
  classroomMatchesTimetableConfigScope,
} from '../domain/timetable-policy';
import {
  TimetableConfigNotFoundException,
  TimetableNoPeriodsException,
} from '../domain/timetable.exceptions';
import { GenerateTimetableDto } from '../dto/timetable.dto';
import { TimetableGenerationResponseDto } from '../dto/timetable-response.dto';
import {
  BulkTimetableEntryInput,
  TimetableEntryRecord,
  TimetableGenerationSnapshot,
  TimetableRepository,
} from '../infrastructure/timetable.repository';
import {
  buildTimetablePublishReadiness,
  TimetablePublicationDataset,
} from './timetable-publication-readiness';
import {
  AuthoritativeTimetableValidation,
  buildAuthoritativeTimetableValidation,
} from './timetable-validation';

@Injectable()
export class GenerateTimetableUseCase {
  constructor(private readonly timetableRepository: TimetableRepository) {}

  async execute(
    command: GenerateTimetableDto,
  ): Promise<TimetableGenerationResponseDto> {
    requireAcademicsScope();

    const transaction =
      await this.timetableRepository.generateEntriesAtomically(
        command.timetableConfigId,
        (snapshot) => {
          assertGenerationContext(snapshot);
          const demand = buildReconciledGenerationDemand(snapshot);
          const plan = buildTimetableGenerationPlan({
            timetableConfigId: snapshot.config.id,
            activeDays: snapshot.config.activeDays,
            demand,
            periods: snapshot.periods,
            teacherAllocations: snapshot.teacherAllocations,
            existingTermEntries: snapshot.termEntries,
          });
          const projected = projectGeneration(snapshot, plan.proposals);
          assertAuthoritativeGenerationPlan(snapshot, projected, plan);

          return {
            entries: plan.proposals.map(proposalToEntryInput),
            value: plan,
          };
        },
      );
    if (transaction.status === 'not_found') {
      throw new TimetableConfigNotFoundException({
        timetableConfigId: command.timetableConfigId,
      });
    }

    assertPersistedGeneration(
      transaction.after,
      transaction.value,
      transaction.createdEntryIds,
    );
    const postCommit = await this.timetableRepository.loadGenerationSnapshot(
      command.timetableConfigId,
    );
    if (!postCommit) {
      throw new TimetableConfigNotFoundException({
        timetableConfigId: command.timetableConfigId,
      });
    }
    assertPersistedGeneration(
      postCommit,
      transaction.value,
      transaction.createdEntryIds,
    );

    const authoritative = buildGenerationPublicationDataset(postCommit);
    const readiness = buildTimetablePublishReadiness(authoritative.dataset);
    const remainingDemandCount = buildReconciledGenerationDemand(
      postCommit,
    ).reduce((sum, demand) => sum + demand.remainingWeeklySlots, 0);

    return {
      timetableConfigId: postCommit.config.id,
      createdCount: transaction.createdEntryIds.length,
      existingCount: transaction.before.candidateEntries.filter(
        (entry) => entry.status !== TimetableEntryStatus.CANCELLED,
      ).length,
      remainingDemandCount,
      complete:
        remainingDemandCount === 0 && transaction.value.unresolved.length === 0,
      createdEntryIds: transaction.createdEntryIds,
      unresolved: transaction.value.unresolved,
      searchNodesVisited: transaction.value.searchNodesVisited,
      searchBudgetExhausted: transaction.value.searchBudgetExhausted,
      validation: authoritative.validation.response,
      publishReadiness: readiness,
    };
  }
}

function assertGenerationContext(snapshot: TimetableGenerationSnapshot): void {
  assertConfigMutable(snapshot.config);
  if (
    !snapshot.academicYear ||
    !snapshot.term ||
    snapshot.term.academicYearId !== snapshot.config.academicYearId ||
    snapshot.term.id !== snapshot.config.termId
  ) {
    throw new TimetableConfigNotFoundException({
      timetableConfigId: snapshot.config.id,
    });
  }
  assertTermWritable(snapshot.term);

  if (!snapshot.periods.some((period) => period.isInstructional)) {
    throw new TimetableNoPeriodsException({
      timetableConfigId: snapshot.config.id,
    });
  }
}

function buildReconciledGenerationDemand(
  snapshot: TimetableGenerationSnapshot,
) {
  const scopeClassrooms = snapshot.classrooms.filter((classroom) =>
    classroomMatchesTimetableConfigScope(snapshot.config, classroom),
  );
  const demand = buildCanonicalTimetableDemand({
    subjectAllocations: snapshot.subjectAllocations,
    classrooms: scopeClassrooms,
    teacherAllocations: snapshot.teacherAllocations,
  });
  return reconcileCanonicalTimetableDemand(demand, snapshot.candidateEntries);
}

function projectGeneration(
  snapshot: TimetableGenerationSnapshot,
  proposals: TimetableGenerationProposal[],
): TimetableGenerationSnapshot {
  const projectedEntries = proposals.map((proposal) =>
    proposalToEntryRecord(snapshot, proposal),
  );
  return {
    ...snapshot,
    candidateEntries: [...snapshot.candidateEntries, ...projectedEntries],
    termEntries: [...snapshot.termEntries, ...projectedEntries],
  };
}

function proposalToEntryRecord(
  snapshot: TimetableGenerationSnapshot,
  proposal: TimetableGenerationProposal,
): TimetableEntryRecord {
  const classroom = snapshot.classrooms.find(
    (item) => item.id === proposal.classroomId,
  );
  const subjectAllocation = snapshot.subjectAllocations.find(
    (item) =>
      item.gradeId === proposal.gradeId &&
      item.subjectId === proposal.subjectId,
  );
  if (!classroom || !subjectAllocation) {
    throw new Error('Timetable generation proposal lost authoritative context');
  }
  const timestamp = new Date(0);
  return {
    id: `generated:${proposal.proposedIndex.toString().padStart(6, '0')}`,
    schoolId: proposal.schoolId,
    academicYearId: proposal.academicYearId,
    termId: proposal.termId,
    timetableConfigId: proposal.timetableConfigId,
    periodId: proposal.periodId,
    dayOfWeek: proposal.dayOfWeek,
    gradeId: proposal.gradeId,
    sectionId: proposal.sectionId,
    classroomId: proposal.classroomId,
    subjectId: proposal.subjectId,
    teacherUserId: proposal.teacherUserId,
    teacherSubjectAllocationId: proposal.teacherSubjectAllocationId,
    roomId: null,
    notes: null,
    status: TimetableEntryStatus.DRAFT,
    period: {
      id: proposal.period.id,
      periodIndex: proposal.period.periodIndex,
      label: proposal.period.label,
      startTime: proposal.period.startTime,
      endTime: proposal.period.endTime,
    },
    classroom: {
      id: classroom.id,
      nameAr: classroom.nameAr,
      nameEn: classroom.nameEn,
      capacity: classroom.capacity,
    },
    subject: {
      id: subjectAllocation.subject.id,
      nameAr: subjectAllocation.subject.nameAr,
      nameEn: subjectAllocation.subject.nameEn,
      code: subjectAllocation.subject.code,
    },
    teacherUser: {
      id: proposal.teacherUserId,
      firstName: '',
      lastName: '',
    },
    room: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function assertAuthoritativeGenerationPlan(
  before: TimetableGenerationSnapshot,
  projected: TimetableGenerationSnapshot,
  plan: TimetableGenerationPlan,
): void {
  if (plan.searchBudgetExhausted && plan.proposals.length > 0) {
    throw new Error('Search-budget exhaustion cannot persist a partial plan');
  }
  const generatedIds = new Set(
    plan.proposals.map(
      (proposal) =>
        `generated:${proposal.proposedIndex.toString().padStart(6, '0')}`,
    ),
  );
  const authoritative = buildGenerationPublicationDataset(projected);
  const readiness = buildTimetablePublishReadiness(authoritative.dataset);
  if (
    authoritative.validation.conflicts.some((conflict) =>
      conflict.entryIds.some((entryId) => generatedIds.has(entryId)),
    ) ||
    readiness.blockingReasons.some(
      (reason) =>
        typeof reason.details?.entryId === 'string' &&
        generatedIds.has(reason.details.entryId),
    )
  ) {
    throw new Error(
      'Timetable generation proposal failed authoritative validation',
    );
  }

  const beforeDemand = new Map(
    buildReconciledGenerationDemand(before).map((demand) => [
      canonicalTimetableDemandKey(demand),
      demand,
    ]),
  );
  const afterDemand = buildReconciledGenerationDemand(projected);
  if (
    afterDemand.some((demand) => {
      const previous = beforeDemand.get(canonicalTimetableDemandKey(demand));
      return (
        !previous ||
        (demand.scheduledWeeklySlots > demand.requiredWeeklySlots &&
          demand.scheduledWeeklySlots > previous.scheduledWeeklySlots) ||
        demand.scheduledWeeklySlots < previous.scheduledWeeklySlots
      );
    })
  ) {
    throw new Error('Timetable generation proposal exceeds canonical demand');
  }
}

function assertPersistedGeneration(
  snapshot: TimetableGenerationSnapshot,
  plan: TimetableGenerationPlan,
  createdEntryIds: string[],
): void {
  if (createdEntryIds.length !== plan.proposals.length) {
    throw new Error('Persisted timetable generation count does not match plan');
  }
  const persistedById = new Map(
    snapshot.candidateEntries.map((entry) => [entry.id, entry]),
  );
  const persisted = createdEntryIds.map((entryId) =>
    persistedById.get(entryId),
  );
  if (
    persisted.some((entry) => !entry) ||
    persisted.some(
      (entry) =>
        entry!.status !== TimetableEntryStatus.DRAFT ||
        entry!.roomId !== null ||
        entry!.timetableConfigId !== snapshot.config.id,
    )
  ) {
    throw new Error('Persisted timetable generation does not match plan');
  }
  const plannedKeys = plan.proposals.map(proposalKey).sort();
  const persistedKeys = persisted.map((entry) => entryKey(entry!)).sort();
  if (JSON.stringify(plannedKeys) !== JSON.stringify(persistedKeys)) {
    throw new Error('Persisted timetable generation rows do not match plan');
  }
}

function proposalToEntryInput(
  proposal: TimetableGenerationProposal,
): BulkTimetableEntryInput {
  return {
    schoolId: proposal.schoolId,
    academicYearId: proposal.academicYearId,
    termId: proposal.termId,
    timetableConfigId: proposal.timetableConfigId,
    periodId: proposal.periodId,
    dayOfWeek: proposal.dayOfWeek,
    gradeId: proposal.gradeId,
    sectionId: proposal.sectionId,
    classroomId: proposal.classroomId,
    subjectId: proposal.subjectId,
    teacherUserId: proposal.teacherUserId,
    teacherSubjectAllocationId: proposal.teacherSubjectAllocationId,
    roomId: null,
  };
}

function buildGenerationPublicationDataset(
  snapshot: TimetableGenerationSnapshot,
): {
  dataset: TimetablePublicationDataset;
  validation: AuthoritativeTimetableValidation;
} {
  const scopeClassrooms = snapshot.classrooms.filter((classroom) =>
    classroomMatchesTimetableConfigScope(snapshot.config, classroom),
  );
  const validation = buildAuthoritativeTimetableValidation({
    termId: snapshot.config.termId,
    academicYearId: snapshot.config.academicYearId,
    classrooms: scopeClassrooms,
    grades: snapshot.grades,
    subjectAllocations: snapshot.subjectAllocations,
    teacherAllocations: snapshot.teacherAllocations,
    entries: snapshot.candidateEntries,
    conflictEntries: snapshot.termEntries,
    rooms: snapshot.rooms,
  });
  return {
    validation,
    dataset: {
      config: snapshot.config,
      academicYear: snapshot.academicYear,
      term: snapshot.term,
      periods: snapshot.periods,
      entries: snapshot.candidateEntries,
      allClassrooms: snapshot.classrooms,
      scopeClassrooms,
      subjectAllocations: snapshot.subjectAllocations,
      teacherAllocations: snapshot.teacherAllocations,
      rooms: snapshot.rooms,
      termEntries: snapshot.termEntries,
      validation,
      conflicts: validation.conflicts,
    },
  };
}

function proposalKey(proposal: TimetableGenerationProposal): string {
  return [
    proposal.timetableConfigId,
    proposal.classroomId,
    proposal.subjectId,
    proposal.teacherSubjectAllocationId,
    proposal.teacherUserId,
    proposal.dayOfWeek,
    proposal.periodId,
  ].join(':');
}

function entryKey(entry: TimetableEntryRecord): string {
  return [
    entry.timetableConfigId,
    entry.classroomId,
    entry.subjectId,
    entry.teacherSubjectAllocationId,
    entry.teacherUserId,
    entry.dayOfWeek,
    entry.periodId,
  ].join(':');
}
