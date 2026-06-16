import { Injectable } from '@nestjs/common';
import { TimetableEntryStatus } from '@prisma/client';
import { requireAcademicsScope } from '../../academics-context';
import { TimetableDashboardQueryDto } from '../dto/timetable.dto';
import {
  TimetableValidationIssueDto,
  TimetableValidationItemDto,
  TimetableValidationResponseDto,
} from '../dto/timetable-response.dto';
import {
  TimetableClassroomRecord,
  TimetableEntryRecord,
  TimetableGradeRecord,
  TimetableRepository,
  TimetableSubjectAllocationRecord,
  TimetableTeacherAllocationRecord,
} from '../infrastructure/timetable.repository';
import {
  groupBy,
  resolveReadableTimetableContext,
  unique,
} from './timetable-dashboard.helpers';

@Injectable()
export class ValidateTimetableUseCase {
  constructor(private readonly timetableRepository: TimetableRepository) {}

  async execute(
    query: TimetableDashboardQueryDto,
  ): Promise<TimetableValidationResponseDto> {
    requireAcademicsScope();

    const { term, classroom } = await resolveReadableTimetableContext(
      this.timetableRepository,
      query,
    );
    const matrixRows =
      await this.timetableRepository.listSubjectAllocationsForTerm({
        termId: term.id,
        gradeId: classroom?.section.gradeId ?? query.gradeId,
      });
    const selectedGradeIds = unique([
      ...matrixRows.map((row) => row.gradeId),
      ...(classroom ? [classroom.section.gradeId] : []),
      ...(query.gradeId ? [query.gradeId] : []),
    ]);
    const [classrooms, grades, teacherAllocations, entries] = await Promise.all([
      classroom
        ? Promise.resolve([classroom])
        : this.timetableRepository.listClassroomsByGradeIds(selectedGradeIds),
      this.timetableRepository.listGradesByIds(selectedGradeIds),
      this.timetableRepository.listTeacherAllocationsByTerm({
        termId: term.id,
        gradeId: query.gradeId,
        classroomId: query.classroomId,
      }),
      this.timetableRepository.listEntriesByTerm({
        termId: term.id,
        gradeId: query.gradeId,
        classroomId: query.classroomId,
      }),
    ]);

    const items = buildValidationItems({
      classrooms,
      grades,
      matrixRows,
      teacherAllocations,
      entries,
    });
    const conflictCounts = countExistingConflicts(entries);

    return {
      termId: term.id,
      academicYearId: term.academicYearId,
      summary: {
        classroomsChecked: classrooms.length,
        expectedWeeklySlots: items.reduce(
          (sum, item) => sum + (item.expectedWeeklyHours ?? 0),
          0,
        ),
        actualScheduledSlots: entries.filter(isSchedulableEntry).length,
        missingTeacherAllocations: items.filter((item) =>
          item.issues.some((issue) => issue.code === 'missing_teacher_allocation'),
        ).length,
        underScheduledSubjects: items.filter((item) =>
          item.issues.some((issue) => issue.code === 'under_scheduled_subject'),
        ).length,
        overScheduledSubjects: items.filter((item) =>
          item.issues.some((issue) => issue.code === 'over_scheduled_subject'),
        ).length,
        teacherConflicts: conflictCounts.teacher,
        classroomConflicts: conflictCounts.classroom,
        roomConflicts: conflictCounts.room,
        missingSubjectAllocationRows: items.filter(
          (item) => item.status === 'missing_subject_allocation',
        ).length,
      },
      items,
    };
  }
}

function buildValidationItems(input: {
  classrooms: TimetableClassroomRecord[];
  grades: TimetableGradeRecord[];
  matrixRows: TimetableSubjectAllocationRecord[];
  teacherAllocations: TimetableTeacherAllocationRecord[];
  entries: TimetableEntryRecord[];
}): TimetableValidationItemDto[] {
  const gradesById = new Map(input.grades.map((grade) => [grade.id, grade]));
  const matrixRowsByGrade = groupBy(input.matrixRows, (row) => row.gradeId);
  const teacherAllocationsByClassSubject = groupBy(
    input.teacherAllocations,
    (allocation) => `${allocation.classroomId}:${allocation.subjectId}`,
  );
  const entriesByClassSubject = groupBy(
    input.entries.filter(isSchedulableEntry),
    (entry) => `${entry.classroomId}:${entry.subjectId}`,
  );
  const items: TimetableValidationItemDto[] = [];

  for (const classroom of input.classrooms) {
    const gradeId = classroom.section.gradeId;
    const grade = gradesById.get(gradeId);
    const rows = matrixRowsByGrade.get(gradeId) ?? [];

    if (rows.length === 0) {
      items.push({
        classroomId: classroom.id,
        classroom: {
          id: classroom.id,
          nameAr: classroom.nameAr,
          nameEn: classroom.nameEn,
        },
        gradeId,
        grade: {
          id: gradeId,
          nameAr: grade?.nameAr ?? '',
          nameEn: grade?.nameEn ?? '',
        },
        subjectId: null,
        subject: null,
        expectedWeeklyHours: null,
        scheduledWeeklyHours: 0,
        status: 'missing_subject_allocation',
        issues: [
          {
            code: 'missing_subject_allocation_row',
            message:
              'No subject allocation weekly-hours rows exist for this classroom grade.',
            details: { gradeId },
          },
        ],
      });
      continue;
    }

    for (const row of rows) {
      const key = `${classroom.id}:${row.subjectId}`;
      const scheduledWeeklyHours = (entriesByClassSubject.get(key) ?? []).length;
      const hasTeacherAllocation =
        (teacherAllocationsByClassSubject.get(key) ?? []).length > 0;
      const issues = buildSubjectIssues({
        row,
        hasTeacherAllocation,
        scheduledWeeklyHours,
      });

      items.push({
        classroomId: classroom.id,
        classroom: {
          id: classroom.id,
          nameAr: classroom.nameAr,
          nameEn: classroom.nameEn,
        },
        gradeId,
        grade: {
          id: gradeId,
          nameAr: grade?.nameAr ?? row.grade.nameAr,
          nameEn: grade?.nameEn ?? row.grade.nameEn,
        },
        subjectId: row.subjectId,
        subject: {
          id: row.subject.id,
          nameAr: row.subject.nameAr,
          nameEn: row.subject.nameEn,
          code: row.subject.code ?? null,
          color: row.subject.color ?? null,
        },
        expectedWeeklyHours: row.weeklyHours,
        scheduledWeeklyHours,
        status: statusForIssues(issues),
        issues,
      });
    }
  }

  return items;
}

function buildSubjectIssues(input: {
  row: TimetableSubjectAllocationRecord;
  hasTeacherAllocation: boolean;
  scheduledWeeklyHours: number;
}): TimetableValidationIssueDto[] {
  const issues: TimetableValidationIssueDto[] = [];

  if (input.row.weeklyHours > 0 && !input.hasTeacherAllocation) {
    issues.push({
      code: 'missing_teacher_allocation',
      message:
        'Subject is missing a teacher allocation for this classroom and term.',
      details: {
        subjectId: input.row.subjectId,
        gradeId: input.row.gradeId,
      },
    });
  }
  if (input.scheduledWeeklyHours < input.row.weeklyHours) {
    issues.push({
      code: 'under_scheduled_subject',
      message: 'Scheduled periods are below weekly hours.',
      details: {
        expectedWeeklyHours: input.row.weeklyHours,
        scheduledWeeklyHours: input.scheduledWeeklyHours,
      },
    });
  }
  if (input.scheduledWeeklyHours > input.row.weeklyHours) {
    issues.push({
      code: 'over_scheduled_subject',
      message: 'Scheduled periods exceed weekly hours.',
      details: {
        expectedWeeklyHours: input.row.weeklyHours,
        scheduledWeeklyHours: input.scheduledWeeklyHours,
      },
    });
  }

  return issues;
}

function statusForIssues(
  issues: TimetableValidationIssueDto[],
): TimetableValidationItemDto['status'] {
  if (issues.some((issue) => issue.code === 'missing_teacher_allocation')) {
    return 'missing_teacher_allocation';
  }
  if (issues.some((issue) => issue.code === 'under_scheduled_subject')) {
    return 'under_scheduled';
  }
  if (issues.some((issue) => issue.code === 'over_scheduled_subject')) {
    return 'over_scheduled';
  }
  return 'complete';
}

function countExistingConflicts(entries: TimetableEntryRecord[]): {
  classroom: number;
  teacher: number;
  room: number;
} {
  const schedulableEntries = entries.filter(isSchedulableEntry);

  return {
    classroom: countGroupedConflicts(
      schedulableEntries,
      (entry) => entry.classroomId,
    ),
    teacher: countGroupedConflicts(
      schedulableEntries,
      (entry) => entry.teacherUserId,
    ),
    room: countGroupedConflicts(
      schedulableEntries,
      (entry) => entry.roomId ?? null,
    ),
  };
}

function countGroupedConflicts(
  entries: TimetableEntryRecord[],
  getResourceId: (entry: TimetableEntryRecord) => string | null,
): number {
  const groups = groupBy(
    entries.filter((entry) => Boolean(getResourceId(entry))),
    (entry) =>
      `${entry.dayOfWeek}:${entry.period.startTime}-${entry.period.endTime}:${getResourceId(
        entry,
      )}`,
  );

  return Array.from(groups.values()).filter((group) => group.length > 1).length;
}

function isSchedulableEntry(entry: TimetableEntryRecord): boolean {
  return entry.status !== TimetableEntryStatus.CANCELLED;
}
