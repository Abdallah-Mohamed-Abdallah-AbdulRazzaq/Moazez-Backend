import {
  ReinforcementReviewOutcome,
  ReinforcementSubmissionStatus,
} from '@prisma/client';
import type { TeacherAppAllocationRecord } from '../../../shared/teacher-app.types';
import {
  TeacherTaskReviewCardDto,
  TeacherTaskReviewDetailDto,
  TeacherTaskReviewQueueResponseDto,
  TeacherTaskReviewSubmissionResponseDto,
} from '../dto/teacher-task-review-queue.dto';
import type { TeacherTaskReviewSubmissionRecord } from '../infrastructure/teacher-task-review-read.adapter';

export class TeacherTaskReviewPresenter {
  static presentQueue(params: {
    submissions: TeacherTaskReviewSubmissionRecord[];
    allocations: TeacherAppAllocationRecord[];
    pagination: {
      page: number;
      limit: number;
      total: number;
    };
  }): TeacherTaskReviewQueueResponseDto {
    return {
      items: params.submissions.map((submission) =>
        presentCard({ submission, allocations: params.allocations }),
      ),
      pagination: params.pagination,
    };
  }

  static presentDetail(params: {
    submission: TeacherTaskReviewSubmissionRecord;
    allocations: TeacherAppAllocationRecord[];
  }): TeacherTaskReviewSubmissionResponseDto {
    return {
      submission: presentDetail({
        submission: params.submission,
        allocations: params.allocations,
      }),
    };
  }
}

function presentDetail(params: {
  submission: TeacherTaskReviewSubmissionRecord;
  allocations: TeacherAppAllocationRecord[];
}): TeacherTaskReviewDetailDto {
  const card = presentCard(params);

  return {
    ...card,
    assignment: {
      assignmentId: params.submission.assignment.id,
      status: params.submission.assignment.status.toLowerCase(),
      progress: presentProgress(params.submission.assignment.progress),
      assignedAt: params.submission.assignment.assignedAt.toISOString(),
      completedAt: presentNullableDate(
        params.submission.assignment.completedAt,
      ),
    },
    reviewHistory: params.submission.reviews.map((review) => ({
      id: review.id,
      outcome: review.outcome.toLowerCase(),
      comment: review.note ?? review.noteAr,
      reviewedAt: review.reviewedAt.toISOString(),
    })),
  };
}

function presentCard(params: {
  submission: TeacherTaskReviewSubmissionRecord;
  allocations: TeacherAppAllocationRecord[];
}): TeacherTaskReviewCardDto {
  const { submission } = params;
  const allocation = findAllocationForSubmission(params);
  const review = submission.currentReview;

  return {
    submissionId: submission.id,
    taskId: submission.taskId,
    taskTitle: localizedTitle(submission.task),
    stage: {
      stageId: submission.stageId,
      title: localizedTitle(submission.stage),
      sortOrder: submission.stage.sortOrder,
      proofType: submission.stage.proofType.toLowerCase(),
      requiresApproval: submission.stage.requiresApproval,
    },
    student: {
      studentId: submission.studentId,
      displayName: fullName(submission.student),
    },
    class: {
      classId: allocation?.id ?? null,
      className: allocation ? localizedName(allocation.classroom) : null,
      subjectName: allocation?.subject
        ? localizedName(allocation.subject)
        : localizedName(submission.task.subject),
      gradeName: allocation
        ? localizedName(allocation.classroom?.section?.grade)
        : localizedName(submission.enrollment.classroom.section?.grade),
      sectionName: allocation
        ? localizedName(allocation.classroom?.section)
        : localizedName(submission.enrollment.classroom.section),
    },
    status: submission.status.toLowerCase(),
    submittedAt: presentNullableDate(submission.submittedAt),
    proof: {
      text: submission.proofText,
      file: submission.proofFile
        ? {
            id: submission.proofFile.id,
            originalName: submission.proofFile.originalName,
            mimeType: submission.proofFile.mimeType,
            sizeBytes: submission.proofFile.sizeBytes.toString(),
            visibility: submission.proofFile.visibility.toLowerCase(),
            createdAt: submission.proofFile.createdAt.toISOString(),
            downloadPath: `/api/v1/files/${submission.proofFile.id}/download`,
          }
        : null,
    },
    review: {
      status: presentReviewStatus(submission.status, review?.outcome ?? null),
      reviewedAt: review ? review.reviewedAt.toISOString() : null,
      comment: review ? (review.note ?? review.noteAr) : null,
    },
    reward: {
      type: submission.task.rewardType
        ? submission.task.rewardType.toLowerCase()
        : null,
      value: presentDecimal(submission.task.rewardValue),
      label: submission.task.rewardLabelEn ?? submission.task.rewardLabelAr,
    },
  };
}

function findAllocationForSubmission(params: {
  submission: TeacherTaskReviewSubmissionRecord;
  allocations: TeacherAppAllocationRecord[];
}): TeacherAppAllocationRecord | null {
  return (
    params.allocations.find(
      (allocation) =>
        allocation.classroomId === params.submission.enrollment.classroomId &&
        allocation.termId === params.submission.enrollment.termId &&
        (!params.submission.task.subjectId ||
          allocation.subjectId === params.submission.task.subjectId),
    ) ??
    params.allocations.find(
      (allocation) =>
        allocation.classroomId === params.submission.enrollment.classroomId &&
        allocation.termId === params.submission.enrollment.termId,
    ) ??
    null
  );
}

function presentReviewStatus(
  status: ReinforcementSubmissionStatus,
  outcome: ReinforcementReviewOutcome | null,
): string {
  if (outcome) return outcome.toLowerCase();
  if (status === ReinforcementSubmissionStatus.SUBMITTED) return 'pending';
  return status.toLowerCase();
}

function localizedTitle(value: {
  titleEn?: string | null;
  titleAr?: string | null;
}): string {
  return value.titleEn ?? value.titleAr ?? '';
}

function localizedName(
  value: { nameEn?: string | null; nameAr?: string | null } | null | undefined,
): string | null {
  if (!value) return null;
  return value.nameEn ?? value.nameAr ?? '';
}

function fullName(student: { firstName: string; lastName: string }): string {
  return `${student.firstName} ${student.lastName}`.trim();
}

function presentProgress(progress: number): number {
  return Math.min(Math.max(progress, 0), 100) / 100;
}

function presentDecimal(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numberValue =
    typeof value === 'object' && 'toNumber' in value
      ? (value as { toNumber: () => number }).toNumber()
      : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function presentNullableDate(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}
