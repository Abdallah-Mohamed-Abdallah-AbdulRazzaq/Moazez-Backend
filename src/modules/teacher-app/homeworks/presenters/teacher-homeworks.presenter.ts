import { HomeworkAssignmentStatus, HomeworkTargetStatus } from '@prisma/client';
import {
  HomeworkAssignmentResponseDto,
  HomeworkAssignmentsListResponseDto,
  HomeworkTargetsListResponseDto,
} from '../../../homework/dto/homework-assignment-response.dto';
import type { TeacherAppAllocationRecord } from '../../shared/teacher-app.types';
import {
  TeacherHomeworkAssignmentDto,
  TeacherHomeworkAssignmentsListResponseDto,
  TeacherHomeworkClassCountersDto,
  TeacherHomeworkDashboardClassDto,
  TeacherHomeworkDashboardResponseDto,
  TeacherHomeworkDashboardTotalsDto,
  TeacherHomeworkNamedReferenceDto,
  TeacherHomeworkTargetsListResponseDto,
} from '../dto/teacher-homeworks.dto';
import {
  createEmptyTeacherHomeworkAssignmentCounters,
  createEmptyTeacherHomeworkTargetCounters,
  TeacherHomeworkAcademicYearReferenceRecord,
  TeacherHomeworkDashboardAssignmentRecord,
} from '../infrastructure/teacher-homeworks-read.adapter';

interface DashboardInput {
  allocations: TeacherAppAllocationRecord[];
  assignments: TeacherHomeworkDashboardAssignmentRecord[];
  academicYears: TeacherHomeworkAcademicYearReferenceRecord[];
  now: Date;
}

const DUE_SOON_DAYS = 7;

export class TeacherHomeworksPresenter {
  static presentAssignment(
    assignment: HomeworkAssignmentResponseDto,
  ): TeacherHomeworkAssignmentDto {
    return {
      id: assignment.id,
      title: assignment.title,
      description: assignment.description,
      mode: assignment.mode,
      status: assignment.status,
      targetMode: assignment.targetMode,
      classId: assignment.teacherSubjectAllocationId,
      academicYear: assignment.academicYear,
      term: assignment.term,
      classroom: assignment.classroom,
      subject: assignment.subject,
      timetableEntryId: assignment.timetableEntryId,
      scheduleDate: assignment.scheduleDate,
      publishAt: assignment.publishAt,
      publishedAt: assignment.publishedAt,
      dueAt: assignment.dueAt,
      closedAt: assignment.closedAt,
      estimatedMinutes: assignment.estimatedMinutes,
      totalMarks: assignment.totalMarks,
      isGraded: assignment.isGraded,
      counters: assignment.counters,
      createdAt: assignment.createdAt,
      updatedAt: assignment.updatedAt,
    };
  }

  static presentAssignmentsList(
    result: HomeworkAssignmentsListResponseDto,
  ): TeacherHomeworkAssignmentsListResponseDto {
    return {
      items: result.items.map((assignment) =>
        this.presentAssignment(assignment),
      ),
      meta: result.meta,
    };
  }

  static presentTargetsList(
    result: HomeworkTargetsListResponseDto,
  ): TeacherHomeworkTargetsListResponseDto {
    return {
      items: result.items.map((target) => ({
        targetId: target.targetId,
        studentId: target.studentId,
        enrollmentId: target.enrollmentId,
        student: {
          id: target.student.id,
          displayName: target.student.displayName,
        },
        status: target.status,
        assignedAt: target.assignedAt,
        viewedAt: target.viewedAt,
        submittedAt: target.submittedAt,
        reviewedAt: target.reviewedAt,
        excusedAt: target.excusedAt,
      })),
    };
  }

  static presentDashboard(
    input: DashboardInput,
  ): TeacherHomeworkDashboardResponseDto {
    const assignmentsByClass = groupAssignmentsByClass(input.assignments);
    const academicYearById = new Map(
      input.academicYears.map((year) => [year.id, year]),
    );

    const classes = input.allocations.map((allocation) =>
      presentDashboardClass({
        allocation,
        assignments: assignmentsByClass.get(allocation.id) ?? [],
        academicYear:
          academicYearById.get(allocation.term?.academicYearId ?? '') ?? null,
        now: input.now,
      }),
    );

    return {
      totals: totalize(classes),
      classes,
    };
  }
}

function presentDashboardClass(input: {
  allocation: TeacherAppAllocationRecord;
  assignments: TeacherHomeworkDashboardAssignmentRecord[];
  academicYear: TeacherHomeworkAcademicYearReferenceRecord | null;
  now: Date;
}): TeacherHomeworkDashboardClassDto {
  const counters = buildClassCounters({
    assignments: input.assignments,
    now: input.now,
  });

  return {
    classId: input.allocation.id,
    classroom: {
      id: input.allocation.classroomId,
      name: localizedName(input.allocation.classroom),
      nameAr: input.allocation.classroom?.nameAr ?? null,
      nameEn: input.allocation.classroom?.nameEn ?? null,
      section: input.allocation.classroom?.section
        ? presentNamedReference(input.allocation.classroom.section)
        : null,
      grade: input.allocation.classroom?.section?.grade
        ? presentNamedReference(input.allocation.classroom.section.grade)
        : null,
    },
    subject: {
      id: input.allocation.subjectId,
      name: localizedName(input.allocation.subject),
      nameAr: input.allocation.subject?.nameAr ?? null,
      nameEn: input.allocation.subject?.nameEn ?? null,
      code: input.allocation.subject?.code ?? null,
      color: null,
    },
    term: {
      id: input.allocation.termId,
      name: localizedName(input.allocation.term),
      nameAr: input.allocation.term?.nameAr ?? null,
      nameEn: input.allocation.term?.nameEn ?? null,
    },
    academicYear: input.academicYear
      ? presentNamedReference(input.academicYear)
      : {
          id: input.allocation.term?.academicYearId ?? '',
          name: '',
          nameAr: null,
          nameEn: null,
        },
    nextScheduleItem: null,
    nextDueAt: nextDueAt(input.assignments, input.now),
    counters,
    latestAssignments: [],
  };
}

function buildClassCounters(input: {
  assignments: TeacherHomeworkDashboardAssignmentRecord[];
  now: Date;
}): TeacherHomeworkClassCountersDto {
  const assignmentCounters = createEmptyTeacherHomeworkAssignmentCounters();
  const targetCounters = createEmptyTeacherHomeworkTargetCounters();
  const dueSoonCutoff = new Date(input.now);
  dueSoonCutoff.setUTCDate(dueSoonCutoff.getUTCDate() + DUE_SOON_DAYS);
  let dueSoon = 0;
  let totalTargets = 0;

  for (const assignment of input.assignments) {
    if (assignment.status !== HomeworkAssignmentStatus.ARCHIVED) {
      assignmentCounters[assignment.status] += 1;
    }

    if (
      assignment.status === HomeworkAssignmentStatus.PUBLISHED &&
      assignment.dueAt.getTime() >= input.now.getTime() &&
      assignment.dueAt.getTime() <= dueSoonCutoff.getTime()
    ) {
      dueSoon += 1;
    }

    for (const target of assignment.targets) {
      targetCounters[target.status] += 1;
      totalTargets += 1;
    }
  }

  return {
    totalAssignments: input.assignments.length,
    draft: assignmentCounters[HomeworkAssignmentStatus.DRAFT],
    published: assignmentCounters[HomeworkAssignmentStatus.PUBLISHED],
    closed: assignmentCounters[HomeworkAssignmentStatus.CLOSED],
    cancelled: assignmentCounters[HomeworkAssignmentStatus.CANCELLED],
    waitingReview:
      targetCounters[HomeworkTargetStatus.SUBMITTED] +
      targetCounters[HomeworkTargetStatus.LATE],
    dueSoon,
    totalTargets,
    assigned: targetCounters[HomeworkTargetStatus.ASSIGNED],
    viewed: targetCounters[HomeworkTargetStatus.VIEWED],
    submitted: targetCounters[HomeworkTargetStatus.SUBMITTED],
    late: targetCounters[HomeworkTargetStatus.LATE],
    missing: targetCounters[HomeworkTargetStatus.MISSING],
    reviewed: targetCounters[HomeworkTargetStatus.REVIEWED],
    excused: targetCounters[HomeworkTargetStatus.EXCUSED],
  };
}

function totalize(
  classes: TeacherHomeworkDashboardClassDto[],
): TeacherHomeworkDashboardTotalsDto {
  return classes.reduce<TeacherHomeworkDashboardTotalsDto>(
    (totals, classCard) => ({
      totalAssignments:
        totals.totalAssignments + classCard.counters.totalAssignments,
      draft: totals.draft + classCard.counters.draft,
      published: totals.published + classCard.counters.published,
      closed: totals.closed + classCard.counters.closed,
      cancelled: totals.cancelled + classCard.counters.cancelled,
      waitingReview: totals.waitingReview + classCard.counters.waitingReview,
      dueSoon: totals.dueSoon + classCard.counters.dueSoon,
    }),
    {
      totalAssignments: 0,
      draft: 0,
      published: 0,
      closed: 0,
      cancelled: 0,
      waitingReview: 0,
      dueSoon: 0,
    },
  );
}

function groupAssignmentsByClass(
  assignments: TeacherHomeworkDashboardAssignmentRecord[],
): Map<string, TeacherHomeworkDashboardAssignmentRecord[]> {
  const grouped = new Map<string, TeacherHomeworkDashboardAssignmentRecord[]>();

  for (const assignment of assignments) {
    const existing = grouped.get(assignment.teacherSubjectAllocationId) ?? [];
    existing.push(assignment);
    grouped.set(assignment.teacherSubjectAllocationId, existing);
  }

  return grouped;
}

function nextDueAt(
  assignments: TeacherHomeworkDashboardAssignmentRecord[],
  now: Date,
): string | null {
  const next = assignments.find(
    (assignment) =>
      assignment.dueAt.getTime() >= now.getTime() &&
      assignment.status !== HomeworkAssignmentStatus.CANCELLED &&
      assignment.status !== HomeworkAssignmentStatus.CLOSED &&
      assignment.status !== HomeworkAssignmentStatus.ARCHIVED,
  );

  return next?.dueAt.toISOString() ?? null;
}

function presentNamedReference(entity: {
  id: string;
  nameAr?: string | null;
  nameEn?: string | null;
}): TeacherHomeworkNamedReferenceDto {
  return {
    id: entity.id,
    name: localizedName(entity),
    nameAr: entity.nameAr ?? null,
    nameEn: entity.nameEn ?? null,
  };
}

function localizedName(
  value: { nameEn?: string | null; nameAr?: string | null } | null | undefined,
): string {
  return value?.nameEn ?? value?.nameAr ?? '';
}
