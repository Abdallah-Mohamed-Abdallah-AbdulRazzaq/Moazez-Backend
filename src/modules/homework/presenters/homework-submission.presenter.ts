import { HomeworkSubmissionStatus, Prisma } from '@prisma/client';
import {
  HomeworkSubmissionDto,
  HomeworkSubmissionResponseDto,
  HomeworkSubmissionsListResponseDto,
} from '../dto/homework-submission-response.dto';
import {
  HomeworkReviewSubmissionRecord,
  ListHomeworkReviewSubmissionsResult,
} from '../infrastructure/homework.repository';

export class HomeworkSubmissionPresenter {
  static presentList(
    result: ListHomeworkReviewSubmissionsResult,
  ): HomeworkSubmissionsListResponseDto {
    return {
      submissions: result.items.map((submission) =>
        presentSubmission(submission),
      ),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
      },
    };
  }

  static presentDetail(
    submission: HomeworkReviewSubmissionRecord,
  ): HomeworkSubmissionResponseDto {
    return {
      submission: presentSubmission(submission),
    };
  }
}

function presentSubmission(
  submission: HomeworkReviewSubmissionRecord,
): HomeworkSubmissionDto {
  return {
    id: submission.id,
    homeworkId: submission.homeworkAssignmentId,
    targetId: submission.homeworkTargetId,
    student: {
      id: submission.student.id,
      displayName: fullName(submission.student),
      studentNumber: null,
    },
    status: submission.status.toLowerCase(),
    bodyText: submission.bodyText,
    submittedAt: presentDateTime(submission.submittedAt),
    reviewedAt: presentDateTime(submission.reviewedAt),
    reviewNote: submission.reviewNote,
    awardedMarks: presentDecimal(submission.awardedMarks),
    totalMarks: presentDecimal(submission.homeworkAssignment.totalMarks),
    isLate: isLateSubmission(submission),
    createdAt: submission.createdAt.toISOString(),
    updatedAt: submission.updatedAt.toISOString(),
  };
}

function fullName(user: {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
}): string {
  return [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.id;
}

function presentDateTime(date: Date | null): string | null {
  return date ? date.toISOString() : null;
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

function isLateSubmission(submission: HomeworkReviewSubmissionRecord): boolean {
  if (submission.status === HomeworkSubmissionStatus.LATE) return true;
  if (!submission.submittedAt) return false;

  return (
    submission.submittedAt.getTime() >
    submission.homeworkAssignment.dueAt.getTime()
  );
}
