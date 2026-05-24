import { HomeworkTargetStatus, Prisma } from '@prisma/client';
import {
  HomeworkAssignmentResponseDto,
  HomeworkAssignmentsListResponseDto,
  HomeworkCountersDto,
  HomeworkTargetResponseDto,
  HomeworkTargetsListResponseDto,
} from '../dto/homework-assignment-response.dto';
import {
  HomeworkAssignmentWithCounters,
  HomeworkTargetRecord,
  HomeworkStatusCounters,
  ListHomeworkAssignmentsResult,
} from '../infrastructure/homework.repository';

function deriveName(entity: { nameAr: string; nameEn: string }): string {
  return entity.nameEn.trim().length > 0 ? entity.nameEn : entity.nameAr;
}

function fullName(user: { firstName: string; lastName: string }): string {
  return `${user.firstName} ${user.lastName}`.trim();
}

function presentDateTime(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

function presentDateOnly(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

function presentDecimal(
  value: Prisma.Decimal | number | string | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && 'toNumber' in value) {
    return value.toNumber();
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function presentCounters(
  counters: HomeworkStatusCounters,
): HomeworkCountersDto {
  return {
    totalTargets: counters.totalTargets,
    assigned: counters[HomeworkTargetStatus.ASSIGNED],
    viewed: counters[HomeworkTargetStatus.VIEWED],
    submitted: counters[HomeworkTargetStatus.SUBMITTED],
    late: counters[HomeworkTargetStatus.LATE],
    missing: counters[HomeworkTargetStatus.MISSING],
    reviewed: counters[HomeworkTargetStatus.REVIEWED],
    excused: counters[HomeworkTargetStatus.EXCUSED],
  };
}

export function presentHomeworkAssignment(
  assignment: HomeworkAssignmentWithCounters,
): HomeworkAssignmentResponseDto {
  return {
    id: assignment.id,
    title: assignment.title,
    description: assignment.description ?? null,
    mode: assignment.mode.toLowerCase(),
    status: assignment.status.toLowerCase(),
    targetMode: assignment.targetMode.toLowerCase(),
    academicYear: {
      id: assignment.academicYear.id,
      name: deriveName(assignment.academicYear),
      nameAr: assignment.academicYear.nameAr,
      nameEn: assignment.academicYear.nameEn,
    },
    term: {
      id: assignment.term.id,
      name: deriveName(assignment.term),
      nameAr: assignment.term.nameAr,
      nameEn: assignment.term.nameEn,
      startDate: presentDateOnly(assignment.term.startDate) ?? '',
      endDate: presentDateOnly(assignment.term.endDate) ?? '',
    },
    classroom: {
      id: assignment.classroom.id,
      name: deriveName(assignment.classroom),
      nameAr: assignment.classroom.nameAr,
      nameEn: assignment.classroom.nameEn,
      section: {
        id: assignment.classroom.section.id,
        name: deriveName(assignment.classroom.section),
        nameAr: assignment.classroom.section.nameAr,
        nameEn: assignment.classroom.section.nameEn,
      },
      grade: {
        id: assignment.classroom.section.grade.id,
        name: deriveName(assignment.classroom.section.grade),
        nameAr: assignment.classroom.section.grade.nameAr,
        nameEn: assignment.classroom.section.grade.nameEn,
      },
    },
    subject: {
      id: assignment.subject.id,
      name: deriveName(assignment.subject),
      nameAr: assignment.subject.nameAr,
      nameEn: assignment.subject.nameEn,
      code: assignment.subject.code ?? null,
      color: assignment.subject.color ?? null,
    },
    teacher: {
      userId: assignment.teacherUser.id,
      fullName: fullName(assignment.teacherUser),
    },
    teacherSubjectAllocationId: assignment.teacherSubjectAllocationId,
    timetableEntryId: assignment.timetableEntryId ?? null,
    scheduleDate: presentDateOnly(assignment.scheduleDate),
    publishAt: presentDateTime(assignment.publishAt),
    publishedAt: presentDateTime(assignment.publishedAt),
    dueAt: assignment.dueAt.toISOString(),
    closedAt: presentDateTime(assignment.closedAt),
    estimatedMinutes: assignment.estimatedMinutes ?? null,
    totalMarks: presentDecimal(assignment.totalMarks),
    isGraded: assignment.isGraded,
    counters: presentCounters(assignment.counters),
    createdAt: assignment.createdAt.toISOString(),
    updatedAt: assignment.updatedAt.toISOString(),
  };
}

export function presentHomeworkAssignments(
  result: ListHomeworkAssignmentsResult,
): HomeworkAssignmentsListResponseDto {
  return {
    items: result.items.map((assignment) =>
      presentHomeworkAssignment(assignment),
    ),
    meta: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: Math.ceil(result.total / result.limit),
    },
  };
}

export function presentHomeworkTarget(
  target: HomeworkTargetRecord,
): HomeworkTargetResponseDto {
  return {
    targetId: target.id,
    studentId: target.studentId,
    enrollmentId: target.enrollmentId,
    student: {
      id: target.student.id,
      displayName: fullName(target.student),
    },
    status: target.status.toLowerCase(),
    assignedAt: target.assignedAt.toISOString(),
    viewedAt: presentDateTime(target.viewedAt),
    submittedAt: presentDateTime(target.submittedAt),
    reviewedAt: presentDateTime(target.reviewedAt),
    excusedAt: presentDateTime(target.excusedAt),
  };
}

export function presentHomeworkTargets(
  targets: HomeworkTargetRecord[],
): HomeworkTargetsListResponseDto {
  return {
    items: targets.map((target) => presentHomeworkTarget(target)),
  };
}
