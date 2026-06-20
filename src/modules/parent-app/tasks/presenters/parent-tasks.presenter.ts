import {
  ReinforcementProofType,
  ReinforcementSubmissionStatus,
  ReinforcementTaskStatus,
} from '@prisma/client';
import {
  ParentTaskCardDto,
  ParentTaskChildDto,
  ParentTaskDetailDto,
  ParentTaskResponseDto,
  ParentTasksListResponseDto,
  ParentTasksSummaryDto,
  ParentTasksSummaryResponseDto,
  ParentTaskStageSubmissionDto,
  ParentTaskSubmissionResponseDto,
  ParentTaskSubmissionsResponseDto,
} from '../dto/parent-tasks.dto';
import type {
  ParentTaskAssignmentReadModel,
  ParentTasksListReadModel,
  ParentTasksSummaryReadModel,
  ParentTaskSubmissionReadModel,
} from '../infrastructure/parent-tasks-read.adapter';

export class ParentTasksPresenter {
  static presentList(params: {
    result: ParentTasksListReadModel;
    summary: ParentTasksSummaryReadModel;
  }): ParentTasksListResponseDto {
    return {
      child: presentChild(params.result.child),
      tasks: params.result.items.map((assignment) =>
        presentTaskCard(assignment),
      ),
      pagination: {
        page: params.result.page,
        limit: params.result.limit,
        total: params.result.total,
      },
      summary: presentSummary(params.summary),
    };
  }

  static presentSummary(
    summary: ParentTasksSummaryReadModel,
  ): ParentTasksSummaryResponseDto {
    return {
      child: presentChild(summary.child),
      summary: presentSummary(summary),
    };
  }

  static presentTask(
    assignment: ParentTaskAssignmentReadModel,
  ): ParentTaskResponseDto {
    return {
      task: presentTaskDetail(assignment),
    };
  }

  static presentSubmissions(params: {
    child: ParentTasksSummaryReadModel['child'];
    taskId: string;
    submissions: ParentTaskSubmissionReadModel[];
  }): ParentTaskSubmissionsResponseDto {
    return {
      taskId: params.taskId,
      task_id: params.taskId,
      child: presentChild(params.child),
      submissions: params.submissions.map((submission) =>
        presentSubmission(submission),
      ),
    };
  }

  static presentSubmission(
    submission: ParentTaskSubmissionReadModel,
  ): ParentTaskSubmissionResponseDto {
    return {
      submission: presentSubmission(submission),
    };
  }
}

function presentChild(child: {
  studentId: string;
}): ParentTaskChildDto {
  return {
    studentId: child.studentId,
    student_id: child.studentId,
  };
}

function presentTaskDetail(
  assignment: ParentTaskAssignmentReadModel,
): ParentTaskDetailDto {
  const submissionsByStageId = new Map(
    assignment.submissions.map((submission) => [
      submission.stageId,
      submission,
    ]),
  );

  return {
    ...presentTaskCard(assignment),
    stages: assignment.task.stages.map((stage) => {
      const submission = submissionsByStageId.get(stage.id) ?? null;
      const completed =
        submission?.status === ReinforcementSubmissionStatus.APPROVED;

      return {
        id: stage.id,
        stageId: stage.id,
        stage_id: stage.id,
        title: stage.titleEn ?? stage.titleAr ?? null,
        description: stage.descriptionEn ?? stage.descriptionAr ?? null,
        sortOrder: stage.sortOrder,
        proofType: presentProofType(stage.proofType),
        proof_type: presentProofType(stage.proofType),
        requiresApproval: stage.requiresApproval,
        isCompleted: completed,
        is_completed: completed,
        proof_url: null,
        submission: submission ? presentSubmission(submission) : null,
      };
    }),
    submissions: assignment.submissions.map((submission) =>
      presentSubmission(submission),
    ),
  };
}

function presentTaskCard(
  assignment: ParentTaskAssignmentReadModel,
): ParentTaskCardDto {
  const task = assignment.task;
  const rewardLabel = task.rewardLabelEn ?? task.rewardLabelAr ?? null;
  const rewardValue = presentDecimal(task.rewardValue);
  const rewardValueLabel =
    rewardLabel ?? (rewardValue === null ? null : String(rewardValue));
  const subjectName = task.subject ? displayName(task.subject) : null;
  const dueDate = presentNullableDate(task.dueDate);
  const status = presentTaskStatus(assignment.status);
  const latestSubmission = assignment.submissions[0] ?? null;
  const progressPercent = normalizeProgressPercent(assignment.progress);
  const completedStageCount = countCompletedStages(assignment.submissions);
  const stageCount = task.stages.length;
  const latestActivityAt = presentNullableDate(
    latestActivityDate(assignment, latestSubmission),
  );

  return {
    id: task.id,
    taskId: task.id,
    task_id: task.id,
    child: presentChild(assignment),
    title: task.titleEn ?? task.titleAr ?? null,
    description: task.descriptionEn ?? task.descriptionAr ?? null,
    source: task.source.toLowerCase(),
    status,
    reinforcer_type: task.rewardType ? task.rewardType.toLowerCase() : null,
    reinforcer_value: rewardValueLabel,
    reward: {
      type: task.rewardType ? task.rewardType.toLowerCase() : null,
      value: rewardValue,
      label: rewardLabel,
    },
    progress: normalizeProgress(assignment.progress),
    progressPercent,
    progress_percent: progressPercent,
    stageCount,
    stage_count: stageCount,
    completedStageCount,
    completed_stage_count: completedStageCount,
    submissionStatus: latestSubmission
      ? latestSubmission.status.toLowerCase()
      : null,
    submission_status: latestSubmission
      ? latestSubmission.status.toLowerCase()
      : null,
    reviewStatus: presentReviewStatus(latestSubmission),
    review_status: presentReviewStatus(latestSubmission),
    dueDate,
    due_date: dueDate,
    subject: task.subject
      ? {
          subjectId: task.subject.id,
          name: subjectName ?? '',
          code: task.subject.code,
        }
      : null,
    subject_name: subjectName,
    assignedAt: assignment.assignedAt.toISOString(),
    assigned_at: assignment.assignedAt.toISOString(),
    latestActivityAt,
    latest_activity_at: latestActivityAt,
  };
}

function presentSubmission(
  submission: ParentTaskSubmissionReadModel,
): ParentTaskStageSubmissionDto {
  return {
    submissionId: submission.id,
    stageId: submission.stageId,
    stage_id: submission.stageId,
    status: submission.status.toLowerCase(),
    submittedAt: presentNullableDate(submission.submittedAt),
    reviewedAt: presentNullableDate(submission.reviewedAt),
    proofText: submission.proofText,
    proofFile: submission.proofFile
      ? {
          fileId: submission.proofFile.id,
          filename: submission.proofFile.originalName,
          originalName: submission.proofFile.originalName,
          mimeType: submission.proofFile.mimeType,
          size: submission.proofFile.sizeBytes.toString(),
          sizeBytes: submission.proofFile.sizeBytes.toString(),
          visibility: submission.proofFile.visibility.toLowerCase(),
          createdAt: submission.proofFile.createdAt.toISOString(),
          downloadPath: `/api/v1/parent/children/${submission.studentId}/files/${submission.proofFile.id}/download`,
        }
      : null,
  };
}

function presentSummary(
  summary: ParentTasksSummaryReadModel,
): ParentTasksSummaryDto {
  return {
    total: summary.total,
    activeCount: summary.pending + summary.inProgress + summary.underReview,
    active_count: summary.pending + summary.inProgress + summary.underReview,
    pending: summary.pending,
    inProgress: summary.inProgress,
    in_progress: summary.inProgress,
    underReview: summary.underReview,
    under_review: summary.underReview,
    completed: summary.completed,
    overdue: summary.overdue,
    completionRate:
      summary.total > 0 ? roundTwo(summary.completed / summary.total) : 0,
    completion_rate:
      summary.total > 0 ? roundTwo(summary.completed / summary.total) : 0,
  };
}

function countCompletedStages(
  submissions: ParentTaskAssignmentReadModel['submissions'],
): number {
  return new Set(
    submissions
      .filter(
        (submission) =>
          submission.status === ReinforcementSubmissionStatus.APPROVED,
      )
      .map((submission) => submission.stageId),
  ).size;
}

function presentReviewStatus(
  submission: ParentTaskSubmissionReadModel | null,
): string | null {
  if (!submission) return null;
  switch (submission.status) {
    case ReinforcementSubmissionStatus.APPROVED:
      return 'approved';
    case ReinforcementSubmissionStatus.REJECTED:
      return 'rejected';
    case ReinforcementSubmissionStatus.PENDING:
      return 'pending';
    case ReinforcementSubmissionStatus.SUBMITTED:
      return 'pending_review';
  }
}

function latestActivityDate(
  assignment: ParentTaskAssignmentReadModel,
  latestSubmission: ParentTaskSubmissionReadModel | null,
): Date | null {
  return (
    latestSubmission?.reviewedAt ??
    latestSubmission?.submittedAt ??
    assignment.completedAt ??
    assignment.startedAt ??
    assignment.assignedAt ??
    null
  );
}

function presentTaskStatus(
  status: ReinforcementTaskStatus,
): 'pending' | 'in_progress' | 'under_review' | 'completed' {
  switch (status) {
    case ReinforcementTaskStatus.IN_PROGRESS:
      return 'in_progress';
    case ReinforcementTaskStatus.UNDER_REVIEW:
      return 'under_review';
    case ReinforcementTaskStatus.COMPLETED:
      return 'completed';
    case ReinforcementTaskStatus.NOT_COMPLETED:
    case ReinforcementTaskStatus.CANCELLED:
      return 'pending';
  }
}

function presentProofType(type: ReinforcementProofType): string {
  if (type === ReinforcementProofType.NONE) return 'none';
  return type.toLowerCase();
}

function normalizeProgress(progress: number): number {
  return Math.min(Math.max(progress, 0), 100) / 100;
}

function normalizeProgressPercent(progress: number): number {
  return Math.round(Math.min(Math.max(progress, 0), 100));
}

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function displayName(node: { nameEn: string; nameAr: string }): string {
  return node.nameEn || node.nameAr;
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
