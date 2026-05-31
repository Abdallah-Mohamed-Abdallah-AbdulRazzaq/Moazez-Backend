import {
  HomeworkAssignmentStatus,
  HomeworkSubmissionStatus,
  HomeworkTargetStatus,
  Prisma,
} from '@prisma/client';
import {
  StudentHomeworkDetailDto,
  StudentHomeworkAttachmentDto,
  StudentHomeworkListItemDto,
  StudentHomeworkMode,
  StudentHomeworkQuestionDto,
  StudentHomeworkResponseDto,
  StudentHomeworkSubmissionDto,
  StudentHomeworksListResponseDto,
  StudentHomeworkStatus,
} from '../dto/student-homeworks.dto';
import type {
  StudentHomeworksListReadModel,
  StudentHomeworkTargetReadModel,
} from '../infrastructure/student-homeworks-read.adapter';
import {
  HomeworkAnswerPresenterModel,
  presentHomeworkAnswerStudent,
} from '../../../homework/presenters/homework-answer.presenter';
import {
  HomeworkSubmissionAttachmentPresenterModel,
  presentHomeworkSubmissionAttachment,
} from '../../../homework/presenters/homework-submission-attachment.presenter';

interface StudentHomeworkSubmissionPresenterModel {
  id: string;
  homeworkAssignmentId: string;
  status: string;
  bodyText: string | null;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  awardedMarks: Prisma.Decimal | number | string | null;
  updatedAt: Date;
  answers?: HomeworkAnswerPresenterModel[];
  attachments?: HomeworkSubmissionAttachmentPresenterModel[];
}

export class StudentHomeworksPresenter {
  static presentList(
    result: StudentHomeworksListReadModel,
  ): StudentHomeworksListResponseDto {
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
    target: StudentHomeworkTargetReadModel,
  ): StudentHomeworkResponseDto {
    return {
      homework: presentDetail(target),
    };
  }
}

export function deriveStudentHomeworkStatus(
  target: Pick<StudentHomeworkTargetReadModel, 'status'> & {
    homeworkAssignment: Pick<
      StudentHomeworkTargetReadModel['homeworkAssignment'],
      'status' | 'dueAt'
    >;
  },
  now: Date,
): StudentHomeworkStatus {
  if (
    target.status === HomeworkTargetStatus.SUBMITTED ||
    target.status === HomeworkTargetStatus.LATE ||
    target.status === HomeworkTargetStatus.REVIEWED
  ) {
    return 'completed';
  }

  if (target.homeworkAssignment.status === HomeworkAssignmentStatus.CLOSED) {
    return 'not_completed';
  }

  if (target.status === HomeworkTargetStatus.MISSING) {
    return 'not_completed';
  }

  if (target.homeworkAssignment.dueAt.getTime() < now.getTime()) {
    return 'not_completed';
  }

  return 'waiting';
}

function presentListItem(
  target: StudentHomeworkTargetReadModel,
): StudentHomeworkListItemDto {
  const assignment = target.homeworkAssignment;

  return {
    homeworkId: assignment.id,
    title: assignment.title,
    description: assignment.description ?? null,
    mode: assignment.mode.toLowerCase() as StudentHomeworkMode,
    status: deriveStudentHomeworkStatus(target, new Date()),
    assignmentStatus: assignment.status.toLowerCase(),
    targetStatus: target.status.toLowerCase(),
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
    questionCount: assignment.questions.length,
    attachmentsCount: assignment.attachments.length,
    submittedAt: presentDateTime(target.submittedAt),
    reviewedAt: presentDateTime(target.reviewedAt),
    createdAt: assignment.createdAt.toISOString(),
    updatedAt: assignment.updatedAt.toISOString(),
  };
}

function presentDetail(
  target: StudentHomeworkTargetReadModel,
): StudentHomeworkDetailDto {
  const assignment = target.homeworkAssignment;

  return {
    ...presentListItem(target),
    publishAt: presentDateTime(assignment.publishAt),
    closedAt: presentDateTime(assignment.closedAt),
    questions: assignment.questions.map((question) =>
      presentSafeQuestion(question),
    ),
    attachments: assignment.attachments.map((attachment) =>
      presentSafeAttachment(attachment),
    ),
    submission: target.submissions[0]
      ? presentStudentHomeworkSubmission(target.submissions[0])
      : null,
  };
}

function presentSafeQuestion(
  question: StudentHomeworkTargetReadModel['homeworkAssignment']['questions'][number],
): StudentHomeworkQuestionDto {
  return {
    questionId: question.id,
    homeworkId: question.homeworkAssignmentId,
    type: question.type.toLowerCase(),
    prompt: question.prompt,
    instructions: question.instructions ?? null,
    points: presentDecimal(question.points) ?? 0,
    sortOrder: question.sortOrder,
    isRequired: question.isRequired,
    options: question.options.map((option) => ({
      optionId: option.id,
      questionId: option.homeworkQuestionId,
      text: option.text,
      sortOrder: option.sortOrder,
    })),
  };
}

function presentSafeAttachment(
  attachment: StudentHomeworkTargetReadModel['homeworkAssignment']['attachments'][number],
): StudentHomeworkAttachmentDto {
  return {
    attachmentId: attachment.id,
    homeworkId: attachment.homeworkAssignmentId,
    fileId: attachment.fileId,
    title: attachment.title ?? attachment.file.originalName,
    description: attachment.description ?? null,
    sortOrder: attachment.sortOrder,
    file: {
      filename: attachment.file.originalName,
      mimeType: attachment.file.mimeType,
      sizeBytes: attachment.file.sizeBytes.toString(),
    },
  };
}

export function presentStudentHomeworkSubmission(
  submission: StudentHomeworkSubmissionPresenterModel,
): StudentHomeworkSubmissionDto {
  const isReviewed = submission.status === HomeworkSubmissionStatus.REVIEWED;

  return {
    id: submission.id,
    homeworkId: submission.homeworkAssignmentId,
    status:
      submission.status.toLowerCase() as StudentHomeworkSubmissionDto['status'],
    bodyText: submission.bodyText,
    answers: (submission.answers ?? []).map((answer) =>
      presentHomeworkAnswerStudent(answer, { includeReviewFields: isReviewed }),
    ),
    attachments: (submission.attachments ?? []).map((attachment) =>
      presentHomeworkSubmissionAttachment(attachment),
    ),
    submittedAt: presentDateTime(submission.submittedAt),
    reviewedAt: isReviewed ? presentDateTime(submission.reviewedAt) : null,
    reviewNote: isReviewed ? submission.reviewNote : null,
    awardedMarks: isReviewed ? presentDecimal(submission.awardedMarks) : null,
    updatedAt: submission.updatedAt.toISOString(),
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
