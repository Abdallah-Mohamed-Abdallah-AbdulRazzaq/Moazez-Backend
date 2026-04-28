import { HttpStatus } from '@nestjs/common';
import {
  ReinforcementProofType,
  ReinforcementReviewOutcome,
  ReinforcementSubmissionStatus,
  ReinforcementTaskStatus,
} from '@prisma/client';
import {
  DomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';

export class ReinforcementSubmissionAlreadySubmittedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'reinforcement.submission.already_submitted',
      message: 'Submission is already submitted',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class ReinforcementReviewNotSubmittedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'reinforcement.review.not_submitted',
      message: 'Submission must be submitted before review',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class ReinforcementTaskCancelledException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'reinforcement.task.cancelled',
      message: 'Reinforcement task is cancelled',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export interface AssignmentReviewStateLike {
  id: string;
  status: ReinforcementTaskStatus | string;
  progress?: number | null;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
  task?: {
    id: string;
    status: ReinforcementTaskStatus | string;
    deletedAt?: Date | string | null;
  } | null;
}

export interface StageReviewStateLike {
  id: string;
  taskId: string;
  proofType: ReinforcementProofType | string;
  deletedAt?: Date | string | null;
}

export interface SubmissionReviewStateLike {
  id: string;
  assignmentId: string;
  taskId: string;
  stageId: string;
  status: ReinforcementSubmissionStatus | string;
}

const SUBMISSION_STATUS_ALIASES: Record<string, ReinforcementSubmissionStatus> = {
  pending: ReinforcementSubmissionStatus.PENDING,
  submitted: ReinforcementSubmissionStatus.SUBMITTED,
  approved: ReinforcementSubmissionStatus.APPROVED,
  rejected: ReinforcementSubmissionStatus.REJECTED,
};

const REVIEW_OUTCOME_ALIASES: Record<string, ReinforcementReviewOutcome> = {
  approved: ReinforcementReviewOutcome.APPROVED,
  approve: ReinforcementReviewOutcome.APPROVED,
  rejected: ReinforcementReviewOutcome.REJECTED,
  reject: ReinforcementReviewOutcome.REJECTED,
};

export function assertAssignmentCanSubmit(
  assignment: AssignmentReviewStateLike,
): void {
  assertTaskActive(assignment.task, { assignmentId: assignment.id });

  if (normalizeTaskStatus(assignment.status) === ReinforcementTaskStatus.CANCELLED) {
    throw new ReinforcementTaskCancelledException({
      assignmentId: assignment.id,
    });
  }
}

export function assertSubmissionCanBeSubmitted(
  submission: SubmissionReviewStateLike | null,
): void {
  if (!submission) return;

  const status = normalizeSubmissionStatus(submission.status);
  if (
    status === ReinforcementSubmissionStatus.PENDING ||
    status === ReinforcementSubmissionStatus.REJECTED
  ) {
    return;
  }

  throw new ReinforcementSubmissionAlreadySubmittedException({
    submissionId: submission.id,
    status,
  });
}

export function assertSubmissionReviewable(
  submission: SubmissionReviewStateLike & {
    assignment?: AssignmentReviewStateLike | null;
    task?: AssignmentReviewStateLike['task'];
    stage?: StageReviewStateLike | null;
  },
): void {
  const status = normalizeSubmissionStatus(submission.status);
  if (status !== ReinforcementSubmissionStatus.SUBMITTED) {
    throw new ReinforcementReviewNotSubmittedException({
      submissionId: submission.id,
      status,
    });
  }

  const task = submission.task ?? submission.assignment?.task ?? null;
  assertTaskActive(task, { submissionId: submission.id });

  if (
    submission.assignment &&
    normalizeTaskStatus(submission.assignment.status) ===
      ReinforcementTaskStatus.CANCELLED
  ) {
    throw new ReinforcementTaskCancelledException({
      assignmentId: submission.assignment.id,
    });
  }

  if (submission.stage) {
    assertStageBelongsToTask({
      stage: submission.stage,
      taskId: submission.taskId,
    });
  }
}

export function assertReviewNoteForRejection(command: {
  note?: string | null;
  noteAr?: string | null;
}): void {
  if (normalizeNullableText(command.note) || normalizeNullableText(command.noteAr)) {
    return;
  }

  throw new ValidationDomainException('Rejecting a submission requires a note', {
    field: 'note',
    aliases: ['noteAr'],
  });
}

export function assertStageBelongsToTask(params: {
  stage: StageReviewStateLike;
  taskId: string;
}): void {
  if (params.stage.deletedAt || params.stage.taskId !== params.taskId) {
    throw new ValidationDomainException('Stage does not belong to the task', {
      stageId: params.stage.id,
      taskId: params.taskId,
    });
  }
}

export function assertProofPayloadMatchesProofType(params: {
  proofType: ReinforcementProofType | string;
  proofFileId?: string | null;
}): void {
  const proofType = normalizeProofType(params.proofType);
  if (proofType === ReinforcementProofType.NONE) return;

  if (!normalizeNullableText(params.proofFileId)) {
    throw new ValidationDomainException('Proof file is required for this stage', {
      field: 'proofFileId',
      proofType,
    });
  }
}

export function calculateAssignmentProgress(params: {
  activeStageIds: string[];
  approvedStageIds: string[];
}): number {
  const activeStageIds = [...new Set(params.activeStageIds)];
  if (activeStageIds.length === 0) return 0;

  const activeStageIdSet = new Set(activeStageIds);
  const approvedCount = new Set(
    params.approvedStageIds.filter((stageId) => activeStageIdSet.has(stageId)),
  ).size;

  return Math.round((approvedCount / activeStageIds.length) * 100);
}

export function deriveAssignmentStatusAfterSubmit(
  assignment: AssignmentReviewStateLike,
): ReinforcementTaskStatus {
  const status = normalizeTaskStatus(assignment.status);
  if (status === ReinforcementTaskStatus.CANCELLED) {
    return ReinforcementTaskStatus.CANCELLED;
  }
  if (status === ReinforcementTaskStatus.COMPLETED) {
    return ReinforcementTaskStatus.COMPLETED;
  }
  return ReinforcementTaskStatus.UNDER_REVIEW;
}

export function deriveAssignmentStatusAfterApprove(params: {
  assignment: AssignmentReviewStateLike;
  progress: number;
  activeStageCount: number;
}): ReinforcementTaskStatus {
  const status = normalizeTaskStatus(params.assignment.status);
  if (status === ReinforcementTaskStatus.CANCELLED) {
    return ReinforcementTaskStatus.CANCELLED;
  }
  if (status === ReinforcementTaskStatus.COMPLETED) {
    return ReinforcementTaskStatus.COMPLETED;
  }
  if (params.activeStageCount > 0 && params.progress >= 100) {
    return ReinforcementTaskStatus.COMPLETED;
  }
  return ReinforcementTaskStatus.IN_PROGRESS;
}

export function deriveAssignmentStatusAfterReject(
  assignment: AssignmentReviewStateLike,
): ReinforcementTaskStatus {
  const status = normalizeTaskStatus(assignment.status);
  if (status === ReinforcementTaskStatus.CANCELLED) {
    return ReinforcementTaskStatus.CANCELLED;
  }
  if (status === ReinforcementTaskStatus.COMPLETED) {
    return ReinforcementTaskStatus.COMPLETED;
  }
  return ReinforcementTaskStatus.IN_PROGRESS;
}

export function normalizeSubmissionStatus(
  input: ReinforcementSubmissionStatus | string | null | undefined,
): ReinforcementSubmissionStatus {
  return normalizeEnumValue({
    input,
    aliases: SUBMISSION_STATUS_ALIASES,
    values: Object.values(ReinforcementSubmissionStatus),
    field: 'status',
  });
}

export function normalizeReviewOutcome(
  input: ReinforcementReviewOutcome | string | null | undefined,
): ReinforcementReviewOutcome {
  return normalizeEnumValue({
    input,
    aliases: REVIEW_OUTCOME_ALIASES,
    values: Object.values(ReinforcementReviewOutcome),
    field: 'outcome',
  });
}

export function normalizeNullableText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function assertTaskActive(
  task: AssignmentReviewStateLike['task'] | null | undefined,
  details?: Record<string, unknown>,
): void {
  if (!task) return;
  if (
    task.deletedAt ||
    normalizeTaskStatus(task.status) === ReinforcementTaskStatus.CANCELLED
  ) {
    throw new ReinforcementTaskCancelledException({
      taskId: task.id,
      ...(details ?? {}),
    });
  }
}

function normalizeTaskStatus(
  input: ReinforcementTaskStatus | string | null | undefined,
): ReinforcementTaskStatus {
  return normalizeEnumValue({
    input,
    aliases: {
      pending: ReinforcementTaskStatus.NOT_COMPLETED,
      not_completed: ReinforcementTaskStatus.NOT_COMPLETED,
      notcompleted: ReinforcementTaskStatus.NOT_COMPLETED,
      in_progress: ReinforcementTaskStatus.IN_PROGRESS,
      inprogress: ReinforcementTaskStatus.IN_PROGRESS,
      under_review: ReinforcementTaskStatus.UNDER_REVIEW,
      underreview: ReinforcementTaskStatus.UNDER_REVIEW,
      completed: ReinforcementTaskStatus.COMPLETED,
      cancel: ReinforcementTaskStatus.CANCELLED,
      cancelled: ReinforcementTaskStatus.CANCELLED,
    },
    values: Object.values(ReinforcementTaskStatus),
    field: 'assignment.status',
  });
}

function normalizeProofType(
  input: ReinforcementProofType | string | null | undefined,
): ReinforcementProofType {
  return normalizeEnumValue({
    input,
    aliases: {
      image: ReinforcementProofType.IMAGE,
      video: ReinforcementProofType.VIDEO,
      document: ReinforcementProofType.DOCUMENT,
      none: ReinforcementProofType.NONE,
    },
    values: Object.values(ReinforcementProofType),
    field: 'proofType',
  });
}

function normalizeEnumValue<TEnum extends string>(params: {
  input: TEnum | string | null | undefined;
  aliases: Record<string, TEnum>;
  values: TEnum[];
  field: string;
}): TEnum {
  const normalized = normalizeNullableText(params.input);
  if (!normalized) {
    throw new ValidationDomainException('Enum value is required', {
      field: params.field,
    });
  }

  const aliasKey = normalized.replace(/[-\s]/g, '_').toLowerCase();
  const alias = params.aliases[aliasKey] ?? params.aliases[aliasKey.replace(/_/g, '')];
  if (alias) return alias;

  const enumValue = normalized.toUpperCase() as TEnum;
  if (params.values.includes(enumValue)) return enumValue;

  throw new ValidationDomainException('Enum value is invalid', {
    field: params.field,
    value: params.input,
  });
}
