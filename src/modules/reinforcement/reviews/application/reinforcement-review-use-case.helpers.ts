import {
  AuditOutcome,
  ReinforcementReviewOutcome,
  ReinforcementSubmissionStatus,
  ReinforcementTaskStatus,
} from '@prisma/client';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { ReinforcementScope } from '../../reinforcement-context';
import {
  normalizeReinforcementSource,
  parseOptionalDate,
} from '../../tasks/domain/reinforcement-task-domain';
import {
  calculateAssignmentProgress,
  deriveAssignmentStatusAfterApprove,
  deriveAssignmentStatusAfterReject,
  normalizeNullableText,
  normalizeSubmissionStatus,
} from '../domain/reinforcement-review-domain';
import {
  ListReinforcementReviewQueueQueryDto,
  ReviewReinforcementSubmissionDto,
} from '../dto/reinforcement-review.dto';
import {
  ListReviewQueueFilters,
  ReinforcementReviewsRepository,
  ReinforcementReviewItemRecord,
} from '../infrastructure/reinforcement-reviews.repository';

export async function findReviewItemOrThrow(
  repository: ReinforcementReviewsRepository,
  submissionId: string,
): Promise<ReinforcementReviewItemRecord> {
  const submission = await repository.findSubmissionForReview(submissionId);
  if (!submission) {
    throw new NotFoundDomainException('Reinforcement submission not found', {
      submissionId,
    });
  }

  return submission;
}

export function normalizeReviewQueueFilters(
  query: ListReinforcementReviewQueueQueryDto,
): ListReviewQueueFilters {
  const submittedFrom = query.submittedFrom
    ? parseOptionalDate(query.submittedFrom, 'submittedFrom') ?? undefined
    : undefined;
  const submittedTo = query.submittedTo
    ? parseOptionalDate(query.submittedTo, 'submittedTo') ?? undefined
    : undefined;

  if (submittedFrom && submittedTo && submittedFrom > submittedTo) {
    throw new ValidationDomainException('Invalid submitted date range', {
      submittedFrom: query.submittedFrom,
      submittedTo: query.submittedTo,
    });
  }

  return {
    ...(query.academicYearId ?? query.yearId
      ? { academicYearId: query.academicYearId ?? query.yearId }
      : {}),
    ...(query.termId ? { termId: query.termId } : {}),
    ...(query.status ? { status: normalizeSubmissionStatus(query.status) } : {}),
    ...(query.source ? { source: normalizeReinforcementSource(query.source) } : {}),
    ...(query.taskId ? { taskId: query.taskId } : {}),
    ...(query.studentId ? { studentId: query.studentId } : {}),
    ...(query.classroomId ? { classroomId: query.classroomId } : {}),
    ...(query.sectionId ? { sectionId: query.sectionId } : {}),
    ...(query.gradeId ? { gradeId: query.gradeId } : {}),
    ...(query.stageId ? { stageId: query.stageId } : {}),
    ...(submittedFrom ? { submittedFrom } : {}),
    ...(submittedTo ? { submittedTo } : {}),
    ...(query.search ?? query.q ? { search: query.search ?? query.q } : {}),
    ...(query.limit ? { limit: query.limit } : {}),
    ...(query.offset ? { offset: query.offset } : {}),
  };
}

export async function buildApprovedAssignmentUpdate(params: {
  repository: ReinforcementReviewsRepository;
  submission: ReinforcementReviewItemRecord;
  now: Date;
}): Promise<{
  progress: number;
  status: ReinforcementTaskStatus;
  completedAt: Date | null;
  activeStageCount: number;
}> {
  const [activeStages, approvedStageIds] = await Promise.all([
    params.repository.listActiveStagesForTask(params.submission.taskId),
    params.repository.listApprovedStageIdsForAssignment(
      params.submission.assignmentId,
    ),
  ]);
  const activeStageIds = activeStages.map((stage) => stage.id);
  const progress = calculateAssignmentProgress({
    activeStageIds,
    approvedStageIds: [...approvedStageIds, params.submission.stageId],
  });
  const status = deriveAssignmentStatusAfterApprove({
    assignment: params.submission.assignment,
    progress,
    activeStageCount: activeStageIds.length,
  });

  return {
    progress:
      params.submission.assignment.status === ReinforcementTaskStatus.COMPLETED
        ? params.submission.assignment.progress
        : progress,
    status,
    completedAt:
      status === ReinforcementTaskStatus.COMPLETED
        ? params.submission.assignment.completedAt ?? params.now
        : null,
    activeStageCount: activeStageIds.length,
  };
}

export async function buildRejectedAssignmentUpdate(params: {
  repository: ReinforcementReviewsRepository;
  submission: ReinforcementReviewItemRecord;
}): Promise<{
  progress: number;
  status: ReinforcementTaskStatus;
}> {
  const [activeStages, approvedStageIds] = await Promise.all([
    params.repository.listActiveStagesForTask(params.submission.taskId),
    params.repository.listApprovedStageIdsForAssignment(
      params.submission.assignmentId,
    ),
  ]);
  const progress = calculateAssignmentProgress({
    activeStageIds: activeStages.map((stage) => stage.id),
    approvedStageIds,
  });
  const status = deriveAssignmentStatusAfterReject(
    params.submission.assignment,
  );

  return {
    progress:
      params.submission.assignment.status === ReinforcementTaskStatus.COMPLETED
        ? params.submission.assignment.progress
        : progress,
    status,
  };
}

export function normalizeReviewNotes(
  dto: ReviewReinforcementSubmissionDto,
): { note: string | null; noteAr: string | null } {
  return {
    note: normalizeNullableText(dto.note),
    noteAr: normalizeNullableText(dto.noteAr),
  };
}

export function buildSubmissionAuditEntry(params: {
  scope: ReinforcementScope;
  action: string;
  submission: ReinforcementReviewItemRecord;
  beforeStatus?: ReinforcementSubmissionStatus | string | null;
}) {
  return {
    actorId: params.scope.actorId,
    userType: params.scope.userType,
    organizationId: params.scope.organizationId,
    schoolId: params.scope.schoolId,
    module: 'reinforcement',
    action: params.action,
    resourceType: 'reinforcement_submission',
    resourceId: params.submission.id,
    outcome: AuditOutcome.SUCCESS,
    before: params.beforeStatus
      ? { status: params.beforeStatus }
      : undefined,
    after: {
      submissionId: params.submission.id,
      assignmentId: params.submission.assignmentId,
      taskId: params.submission.taskId,
      stageId: params.submission.stageId,
      studentId: params.submission.studentId,
      proofType: params.submission.stage.proofType,
      status: params.submission.status,
    },
  };
}

export function buildReviewAuditEntry(params: {
  scope: ReinforcementScope;
  action: string;
  outcome: ReinforcementReviewOutcome;
  before: ReinforcementReviewItemRecord;
  after: ReinforcementReviewItemRecord;
}) {
  const review = params.after.currentReview;

  return {
    actorId: params.scope.actorId,
    userType: params.scope.userType,
    organizationId: params.scope.organizationId,
    schoolId: params.scope.schoolId,
    module: 'reinforcement',
    action: params.action,
    resourceType: 'reinforcement_review',
    resourceId: review?.id ?? params.after.id,
    outcome: AuditOutcome.SUCCESS,
    before: {
      submissionId: params.before.id,
      submissionStatus: params.before.status,
      assignmentStatus: params.before.assignment.status,
      assignmentProgress: params.before.assignment.progress,
    },
    after: {
      reviewId: review?.id ?? null,
      reviewOutcome: params.outcome,
      submissionId: params.after.id,
      assignmentId: params.after.assignmentId,
      taskId: params.after.taskId,
      stageId: params.after.stageId,
      studentId: params.after.studentId,
      beforeSubmissionStatus: params.before.status,
      afterSubmissionStatus: params.after.status,
      beforeAssignmentStatus: params.before.assignment.status,
      afterAssignmentStatus: params.after.assignment.status,
      beforeAssignmentProgress: params.before.assignment.progress,
      afterAssignmentProgress: params.after.assignment.progress,
    },
  };
}
