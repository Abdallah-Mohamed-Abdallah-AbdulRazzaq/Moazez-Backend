import {
  HomeworkAssignmentStatus,
  HomeworkTargetStatus,
  Prisma,
} from '@prisma/client';
import {
  ParentHomeworkDetailDto,
  ParentHomeworkListItemDto,
  ParentHomeworkMode,
  ParentHomeworkResponseDto,
  ParentHomeworksListResponseDto,
  ParentHomeworkStatus,
} from '../dto/parent-homeworks.dto';
import type {
  ParentHomeworksListReadModel,
  ParentHomeworkTargetReadModel,
} from '../infrastructure/parent-homeworks-read.adapter';

export class ParentHomeworksPresenter {
  static presentList(
    result: ParentHomeworksListReadModel,
  ): ParentHomeworksListResponseDto {
    return {
      homeworks: result.items.map((target) => presentListItem(target)),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
      },
    };
  }

  static presentDetail(
    target: ParentHomeworkTargetReadModel,
  ): ParentHomeworkResponseDto {
    return {
      homework: presentDetail(target),
    };
  }
}

export function deriveParentHomeworkStatus(
  target: Pick<ParentHomeworkTargetReadModel, 'status'> & {
    homeworkAssignment: Pick<
      ParentHomeworkTargetReadModel['homeworkAssignment'],
      'status' | 'dueAt'
    >;
  },
  now: Date,
): ParentHomeworkStatus {
  if (
    target.status === HomeworkTargetStatus.SUBMITTED ||
    target.status === HomeworkTargetStatus.REVIEWED
  ) {
    return 'completed';
  }

  if (target.homeworkAssignment.status === HomeworkAssignmentStatus.CLOSED) {
    return 'not_completed';
  }

  if (
    target.status === HomeworkTargetStatus.MISSING ||
    target.status === HomeworkTargetStatus.LATE
  ) {
    return 'not_completed';
  }

  if (target.homeworkAssignment.dueAt.getTime() < now.getTime()) {
    return 'not_completed';
  }

  return 'waiting';
}

function presentListItem(
  target: ParentHomeworkTargetReadModel,
): ParentHomeworkListItemDto {
  const assignment = target.homeworkAssignment;

  return {
    homeworkId: assignment.id,
    title: assignment.title,
    description: assignment.description ?? null,
    mode: assignment.mode.toLowerCase() as ParentHomeworkMode,
    status: deriveParentHomeworkStatus(target, new Date()),
    assignmentStatus: assignment.status.toLowerCase(),
    targetStatus: target.status.toLowerCase(),
    child: {
      studentId: target.student.id,
      displayName: fullName(target.student),
    },
    subject: {
      id: assignment.subject.id,
      name: localizedName(assignment.subject),
      nameAr: assignment.subject.nameAr,
      nameEn: assignment.subject.nameEn,
      code: assignment.subject.code ?? null,
      color: assignment.subject.color ?? null,
    },
    teacher: {
      userId: assignment.teacherUser.id,
      fullName: fullName(assignment.teacherUser),
    },
    classroom: {
      id: assignment.classroom.id,
      name: localizedName(assignment.classroom),
      nameAr: assignment.classroom.nameAr,
      nameEn: assignment.classroom.nameEn,
      section: assignment.classroom.section
        ? presentNamedReference(assignment.classroom.section)
        : null,
      grade: assignment.classroom.section?.grade
        ? presentNamedReference(assignment.classroom.section.grade)
        : null,
    },
    term: presentNamedReference(assignment.term),
    academicYear: presentNamedReference(assignment.academicYear),
    timetableEntryId: assignment.timetableEntryId ?? null,
    scheduleDate: presentDateOnly(assignment.scheduleDate),
    dueAt: assignment.dueAt.toISOString(),
    publishedAt: presentDateTime(assignment.publishedAt),
    estimatedMinutes: assignment.estimatedMinutes ?? null,
    totalMarks: presentDecimal(assignment.totalMarks),
    isGraded: assignment.isGraded,
    questionCount: 0,
    attachmentsCount: 0,
    submittedAt: presentDateTime(target.submittedAt),
    reviewedAt: presentDateTime(target.reviewedAt),
    createdAt: assignment.createdAt.toISOString(),
    updatedAt: assignment.updatedAt.toISOString(),
  };
}

function presentDetail(
  target: ParentHomeworkTargetReadModel,
): ParentHomeworkDetailDto {
  const assignment = target.homeworkAssignment;

  return {
    ...presentListItem(target),
    publishAt: presentDateTime(assignment.publishAt),
    closedAt: presentDateTime(assignment.closedAt),
    questions: [],
    attachments: [],
    submission: null,
  };
}

function presentNamedReference(entity: {
  id: string;
  nameAr: string | null;
  nameEn: string | null;
}) {
  return {
    id: entity.id,
    name: localizedName(entity),
    nameAr: entity.nameAr,
    nameEn: entity.nameEn,
  };
}

function localizedName(entity: {
  nameAr?: string | null;
  nameEn?: string | null;
}): string {
  return entity.nameEn?.trim() || entity.nameAr?.trim() || '';
}

function fullName(user: {
  firstName?: string | null;
  lastName?: string | null;
}): string {
  return [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
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
