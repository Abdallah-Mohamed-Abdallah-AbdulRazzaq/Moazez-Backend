import { Injectable } from '@nestjs/common';
import {
  CommunicationAnnouncementStatus,
  HomeworkAssignmentStatus,
  LessonPlanStatus,
  ReinforcementTaskStatus,
  TimetableEntryStatus,
} from '@prisma/client';
import { parseTeacherAnnouncementMetadata } from '../../../communication/domain/teacher-app-announcement-metadata';
import { isTeacherAuthoredReinforcementTaskInAllocationScope } from '../../../reinforcement/tasks/domain/reinforcement-task-allocation-scope';
import {
  findTimetableIntervalConflicts,
  type TimetableIntervalConflictSource,
} from '../../timetable/domain/timetable-conflicts';
import type {
  TeacherAllocationReassignmentAction,
  TeacherAllocationReassignmentAnalysis,
  TeacherAllocationReassignmentBlocker,
  TeacherAllocationReassignmentHistoricalRecord,
  TeacherAllocationReassignmentImpact,
} from '../domain/teacher-allocation-reassignment.types';
import type {
  ReassignmentAnnouncementRecord,
  ReassignmentTimetableRecord,
  TeacherAllocationReassignmentSnapshot,
} from '../infrastructure/teacher-allocation-reassignment-read.repository';

@Injectable()
export class TeacherAllocationReassignmentImpactService {
  analyze(
    snapshot: TeacherAllocationReassignmentSnapshot,
  ): TeacherAllocationReassignmentAnalysis {
    const { allocation, target } = snapshot;
    if (!target) {
      throw new Error('Reassignment impact analysis requires a target teacher');
    }

    const affectedTimetable = snapshot.timetableEntries.filter(
      (entry) => entry.teacherSubjectAllocationId === allocation.id,
    );
    const timetableConflicts = this.findTargetTeacherConflicts(
      snapshot.timetableEntries,
      allocation.id,
      target.id,
    );
    const reinforcementTasks = snapshot.reinforcementTasks.filter((task) =>
      isTeacherAuthoredReinforcementTaskInAllocationScope({
        task,
        teacherUserId: allocation.teacherUserId,
        scope: {
          academicYearId: allocation.term.academicYearId,
          termId: allocation.termId,
          subjectId: allocation.subjectId,
          classroomId: allocation.classroomId,
        },
      }),
    );
    const announcements = snapshot.announcements.filter((announcement) =>
      isAnnouncementForAllocation(
        announcement,
        allocation.id,
        allocation.classroomId,
      ),
    );

    const timetableStatuses = countStatuses(affectedTimetable);
    const lessonPlanStatuses = countStatuses(snapshot.lessonPlans);
    const homeworkStatuses = countStatuses(snapshot.homeworkAssignments);
    const reinforcementStatuses = countStatuses(reinforcementTasks);
    const announcementStatuses = countStatuses(announcements);

    const impact: TeacherAllocationReassignmentImpact = {
      timetable: {
        draft: count(timetableStatuses, TimetableEntryStatus.DRAFT),
        active: count(timetableStatuses, TimetableEntryStatus.ACTIVE),
        cancelled: count(timetableStatuses, TimetableEntryStatus.CANCELLED),
        targetTeacherConflicts: timetableConflicts.length,
      },
      lessonPlans: {
        draft: count(lessonPlanStatuses, LessonPlanStatus.DRAFT),
        active: count(lessonPlanStatuses, LessonPlanStatus.ACTIVE),
        archived: count(lessonPlanStatuses, LessonPlanStatus.ARCHIVED),
      },
      homework: {
        draft: count(homeworkStatuses, HomeworkAssignmentStatus.DRAFT),
        published: count(homeworkStatuses, HomeworkAssignmentStatus.PUBLISHED),
        closed: count(homeworkStatuses, HomeworkAssignmentStatus.CLOSED),
        cancelled: count(homeworkStatuses, HomeworkAssignmentStatus.CANCELLED),
        archived: count(homeworkStatuses, HomeworkAssignmentStatus.ARCHIVED),
      },
      reinforcement: {
        notCompleted: count(
          reinforcementStatuses,
          ReinforcementTaskStatus.NOT_COMPLETED,
        ),
        inProgress: count(
          reinforcementStatuses,
          ReinforcementTaskStatus.IN_PROGRESS,
        ),
        underReview: count(
          reinforcementStatuses,
          ReinforcementTaskStatus.UNDER_REVIEW,
        ),
        completed: count(
          reinforcementStatuses,
          ReinforcementTaskStatus.COMPLETED,
        ),
        cancelled: count(
          reinforcementStatuses,
          ReinforcementTaskStatus.CANCELLED,
        ),
      },
      announcements: {
        draft: count(
          announcementStatuses,
          CommunicationAnnouncementStatus.DRAFT,
        ),
        scheduled: count(
          announcementStatuses,
          CommunicationAnnouncementStatus.SCHEDULED,
        ),
        published: count(
          announcementStatuses,
          CommunicationAnnouncementStatus.PUBLISHED,
        ),
        archived: count(
          announcementStatuses,
          CommunicationAnnouncementStatus.ARCHIVED,
        ),
        cancelled: count(
          announcementStatuses,
          CommunicationAnnouncementStatus.CANCELLED,
        ),
      },
      assessments: { policy: 'contextual_access_no_rewrite' },
      curriculum: { policy: 'no_mutation' },
      attendance: { policy: 'historical_preserve' },
      messages: { policy: 'no_history_rewrite' },
    };

    const blockers = this.buildBlockers({
      snapshot,
      impact,
      reinforcementStatuses,
      announcementStatuses,
    });
    const automaticActions = buildAutomaticActions(impact);
    const historicalRecords = buildHistoricalRecords(impact);

    return {
      decision: blockers.length === 0 ? 'ready' : 'blocked',
      canReassign: blockers.length === 0,
      impact,
      blockers,
      automaticActions,
      historicalRecords,
      fingerprintMaterial: {
        allocation,
        target,
        duplicateTargetAllocationId: snapshot.duplicateTargetAllocationId,
        timetableEntries: snapshot.timetableEntries,
        timetableConflicts,
        lessonPlans: snapshot.lessonPlans,
        homeworkAssignments: snapshot.homeworkAssignments,
        reinforcementTasks,
        announcements,
        impact,
        blockers,
      },
    };
  }

  private buildBlockers(params: {
    snapshot: TeacherAllocationReassignmentSnapshot;
    impact: TeacherAllocationReassignmentImpact;
    reinforcementStatuses: Map<string, number>;
    announcementStatuses: Map<string, number>;
  }): TeacherAllocationReassignmentBlocker[] {
    const { snapshot, impact } = params;
    const blockers: TeacherAllocationReassignmentBlocker[] = [];

    if (snapshot.allocation.teacherUserId === snapshot.target?.id) {
      blockers.push({
        domain: 'allocation',
        code: 'target_is_current_teacher',
        count: 1,
      });
    }
    if (snapshot.duplicateTargetAllocationId) {
      blockers.push({
        domain: 'allocation',
        code: 'target_already_allocated',
        count: 1,
      });
    }
    if (impact.timetable.targetTeacherConflicts > 0) {
      blockers.push({
        domain: 'timetable',
        code: 'target_teacher_conflict',
        count: impact.timetable.targetTeacherConflicts,
      });
    }

    const activeReinforcementStatuses = pickStatuses(
      params.reinforcementStatuses,
      [
        ReinforcementTaskStatus.NOT_COMPLETED,
        ReinforcementTaskStatus.IN_PROGRESS,
        ReinforcementTaskStatus.UNDER_REVIEW,
      ],
    );
    const activeReinforcementCount = totalStatuses(activeReinforcementStatuses);
    if (activeReinforcementCount > 0) {
      blockers.push({
        domain: 'reinforcement',
        code: 'active_reinforcement_tasks',
        count: activeReinforcementCount,
        statuses: activeReinforcementStatuses,
      });
    }

    const mutableAnnouncementStatuses = pickStatuses(
      params.announcementStatuses,
      [
        CommunicationAnnouncementStatus.DRAFT,
        CommunicationAnnouncementStatus.SCHEDULED,
      ],
    );
    const mutableAnnouncementCount = totalStatuses(mutableAnnouncementStatuses);
    if (mutableAnnouncementCount > 0) {
      blockers.push({
        domain: 'announcements',
        code: 'mutable_teacher_announcements',
        count: mutableAnnouncementCount,
        statuses: mutableAnnouncementStatuses,
      });
    }

    return blockers;
  }

  private findTargetTeacherConflicts(
    entries: ReassignmentTimetableRecord[],
    allocationId: string,
    targetTeacherUserId: string,
  ) {
    const affectedIds = new Set(
      entries
        .filter(
          (entry) =>
            entry.teacherSubjectAllocationId === allocationId &&
            entry.status !== TimetableEntryStatus.CANCELLED,
        )
        .map((entry) => entry.id),
    );
    const sources = entries
      .filter((entry) => entry.status !== TimetableEntryStatus.CANCELLED)
      .map((entry) =>
        timetableConflictSource(
          entry,
          affectedIds.has(entry.id) ? targetTeacherUserId : entry.teacherUserId,
        ),
      );

    return findTimetableIntervalConflicts(sources).filter((conflict) => {
      if (conflict.kind !== 'teacher') return false;
      const firstAffected =
        conflict.first.entryId !== null &&
        affectedIds.has(conflict.first.entryId);
      const secondAffected =
        conflict.second.entryId !== null &&
        affectedIds.has(conflict.second.entryId);
      return firstAffected !== secondAffected;
    });
  }
}

function timetableConflictSource(
  entry: ReassignmentTimetableRecord,
  teacherUserId: string,
): TimetableIntervalConflictSource {
  return {
    identity: `entry:${entry.id}`,
    schoolId: entry.schoolId,
    termId: entry.termId,
    timetableConfigId: entry.timetableConfigId,
    entryId: entry.id,
    proposedIndex: null,
    classroomId: entry.classroomId,
    teacherUserId,
    roomId: entry.roomId,
    dayOfWeek: entry.dayOfWeek,
    periodId: entry.periodId,
    startTime: entry.period.startTime,
    endTime: entry.period.endTime,
  };
}

function isAnnouncementForAllocation(
  announcement: ReassignmentAnnouncementRecord,
  allocationId: string,
  classroomId: string,
): boolean {
  const metadata = parseTeacherAnnouncementMetadata(announcement.metadata);
  return (
    metadata?.teacherApp.classId === allocationId &&
    metadata.teacherApp.classroomId === classroomId
  );
}

function countStatuses(
  records: ReadonlyArray<{ status: string }>,
): Map<string, number> {
  const statuses = new Map<string, number>();
  for (const record of records) {
    statuses.set(record.status, (statuses.get(record.status) ?? 0) + 1);
  }
  return statuses;
}

function count(statuses: Map<string, number>, status: string): number {
  return statuses.get(status) ?? 0;
}

function pickStatuses(
  statuses: Map<string, number>,
  keys: readonly string[],
): Record<string, number> {
  return Object.fromEntries(
    keys
      .map((key) => [key, count(statuses, key)] as const)
      .filter(([, value]) => value > 0),
  );
}

function totalStatuses(statuses: Record<string, number>): number {
  return Object.values(statuses).reduce((total, value) => total + value, 0);
}

function buildAutomaticActions(
  impact: TeacherAllocationReassignmentImpact,
): TeacherAllocationReassignmentAction[] {
  return compactCounts<TeacherAllocationReassignmentAction>([
    {
      domain: 'timetable',
      action: 'handoff_current_responsibility',
      count: impact.timetable.draft + impact.timetable.active,
    },
    {
      domain: 'lesson_plans',
      action: 'handoff_current_responsibility',
      count: impact.lessonPlans.draft + impact.lessonPlans.active,
    },
    {
      domain: 'homework',
      action: 'handoff_current_responsibility',
      count:
        impact.homework.draft +
        impact.homework.published +
        impact.homework.closed,
    },
  ]);
}

function buildHistoricalRecords(
  impact: TeacherAllocationReassignmentImpact,
): TeacherAllocationReassignmentHistoricalRecord[] {
  return compactCounts<TeacherAllocationReassignmentHistoricalRecord>([
    {
      domain: 'timetable',
      action: 'preserve_historical_authorship',
      count: impact.timetable.cancelled,
    },
    {
      domain: 'lesson_plans',
      action: 'preserve_historical_authorship',
      count: impact.lessonPlans.archived,
    },
    {
      domain: 'homework',
      action: 'preserve_historical_authorship',
      count: impact.homework.cancelled + impact.homework.archived,
    },
    {
      domain: 'reinforcement',
      action: 'preserve_historical_authorship',
      count: impact.reinforcement.completed + impact.reinforcement.cancelled,
    },
    {
      domain: 'announcements',
      action: 'preserve_historical_authorship',
      count:
        impact.announcements.published +
        impact.announcements.archived +
        impact.announcements.cancelled,
    },
  ]);
}

function compactCounts<T extends { count: number }>(records: T[]): T[] {
  return records.filter((record) => record.count > 0);
}
