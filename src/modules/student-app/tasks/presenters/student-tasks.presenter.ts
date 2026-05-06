import {
  ReinforcementProofType,
  ReinforcementSubmissionStatus,
  ReinforcementTaskStatus,
} from '@prisma/client';
import {
  StudentTaskCardDto,
  StudentTaskDetailDto,
  StudentTaskResponseDto,
  StudentTasksListResponseDto,
  StudentTasksSummaryDto,
  StudentTasksSummaryResponseDto,
  StudentTaskStageSubmissionDto,
  StudentTaskSubmissionsResponseDto,
  StudentTaskSubmissionResponseDto,
} from '../dto/student-tasks.dto';
import type {
  StudentTaskAssignmentReadModel,
  StudentTasksListReadModel,
  StudentTasksSummaryReadModel,
  StudentTaskSubmissionReadModel,
} from '../infrastructure/student-tasks-read.adapter';

export class StudentTasksPresenter {
  static presentList(
    result: StudentTasksListReadModel,
    summary: StudentTasksSummaryReadModel,
  ): StudentTasksListResponseDto {
    return {
      tasks: result.items.map((assignment) => presentTaskCard(assignment)),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
      },
      summary: presentSummary(summary),
    };
  }

  static presentSummary(
    summary: StudentTasksSummaryReadModel,
  ): StudentTasksSummaryResponseDto {
    return { summary: presentSummary(summary) };
  }

  static presentTask(
    assignment: StudentTaskAssignmentReadModel,
  ): StudentTaskResponseDto {
    return {
      task: presentTaskDetail(assignment),
    };
  }

  static presentSubmissions(params: {
    taskId: string;
    submissions: StudentTaskSubmissionReadModel[];
  }): StudentTaskSubmissionsResponseDto {
    return {
      taskId: params.taskId,
      task_id: params.taskId,
      submissions: params.submissions.map((submission) =>
        presentSubmission(submission),
      ),
    };
  }

  static presentSubmission(
    submission: StudentTaskSubmissionReadModel,
  ): StudentTaskSubmissionResponseDto {
    return {
      submission: presentSubmission(submission),
    };
  }
}

function presentTaskDetail(
  assignment: StudentTaskAssignmentReadModel,
): StudentTaskDetailDto {
  const submissionsByStageId = new Map(
    assignment.submissions.map((submission) => [submission.stageId, submission]),
  );

  return {
    ...presentTaskCard(assignment),
    stages: assignment.task.stages.map((stage) => {
      const submission = submissionsByStageId.get(stage.id) ?? null;
      const completed = submission?.status === ReinforcementSubmissionStatus.APPROVED;

      return {
        id: stage.id,
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
  assignment: StudentTaskAssignmentReadModel,
): StudentTaskCardDto {
  const task = assignment.task;
  const rewardLabel = task.rewardLabelEn ?? task.rewardLabelAr ?? null;
  const rewardValue = presentDecimal(task.rewardValue);
  const rewardValueLabel =
    rewardLabel ?? (rewardValue === null ? null : String(rewardValue));
  const subjectName = task.subject ? displayName(task.subject) : null;
  const dueDate = presentNullableDate(task.dueDate);
  const status = presentTaskStatus(assignment.status);

  return {
    id: task.id,
    taskId: task.id,
    task_id: task.id,
    assignmentId: assignment.id,
    assignment_id: assignment.id,
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
  };
}

function presentSubmission(
  submission: StudentTaskSubmissionReadModel,
): StudentTaskStageSubmissionDto {
  return {
    submissionId: submission.id,
    status: submission.status.toLowerCase(),
    submittedAt: presentNullableDate(submission.submittedAt),
    reviewedAt: presentNullableDate(submission.reviewedAt),
    proofText: submission.proofText,
    proofFile: submission.proofFile
      ? {
          fileId: submission.proofFile.id,
          filename: submission.proofFile.originalName,
          mimeType: submission.proofFile.mimeType,
          size: submission.proofFile.sizeBytes.toString(),
        }
      : null,
  };
}

function presentSummary(
  summary: StudentTasksSummaryReadModel,
): StudentTasksSummaryDto {
  return {
    total: summary.total,
    pending: summary.pending,
    inProgress: summary.inProgress,
    in_progress: summary.inProgress,
    underReview: summary.underReview,
    under_review: summary.underReview,
    completed: summary.completed,
    overdue: summary.overdue,
  };
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
