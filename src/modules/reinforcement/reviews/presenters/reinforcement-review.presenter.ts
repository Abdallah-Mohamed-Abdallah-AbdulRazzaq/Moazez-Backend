import { ReinforcementReviewOutcome } from '@prisma/client';
import {
  ReinforcementReviewItemResponseDto,
  ReinforcementReviewQueueListResponseDto,
} from '../dto/reinforcement-review.dto';
import { ReinforcementReviewItemRecord } from '../infrastructure/reinforcement-reviews.repository';

export function presentReinforcementReviewQueue(params: {
  items: ReinforcementReviewItemRecord[];
  total: number;
  limit?: number | null;
  offset?: number | null;
}): ReinforcementReviewQueueListResponseDto {
  return {
    items: params.items.map((item) => presentReinforcementReviewItem(item)),
    total: params.total,
    limit: params.limit ?? null,
    offset: params.offset ?? null,
  };
}

export function presentReinforcementReviewItem(
  item: ReinforcementReviewItemRecord,
): ReinforcementReviewItemResponseDto {
  return {
    id: item.id,
    assignmentId: item.assignmentId,
    taskId: item.taskId,
    stageId: item.stageId,
    studentId: item.studentId,
    enrollmentId: item.enrollmentId,
    status: presentEnum(item.status),
    submittedAt: presentNullableDate(item.submittedAt),
    reviewedAt: presentNullableDate(item.reviewedAt),
    task: {
      id: item.task.id,
      titleEn: item.task.titleEn,
      titleAr: item.task.titleAr,
      source: presentEnum(item.task.source),
      status: presentEnum(item.task.status),
      dueDate: presentNullableDate(item.task.dueDate),
      reward: {
        type: item.task.rewardType ? presentEnum(item.task.rewardType) : null,
        value: presentDecimal(item.task.rewardValue),
        labelEn: item.task.rewardLabelEn,
        labelAr: item.task.rewardLabelAr,
      },
    },
    stage: {
      id: item.stage.id,
      sortOrder: item.stage.sortOrder,
      titleEn: item.stage.titleEn,
      titleAr: item.stage.titleAr,
      descriptionEn: item.stage.descriptionEn,
      descriptionAr: item.stage.descriptionAr,
      proofType: presentEnum(item.stage.proofType),
      requiresApproval: item.stage.requiresApproval,
    },
    student: {
      id: item.student.id,
      firstName: item.student.firstName,
      lastName: item.student.lastName,
      nameAr: null,
      code: null,
      admissionNo: null,
    },
    assignment: {
      id: item.assignment.id,
      status: presentEnum(item.assignment.status),
      progress: item.assignment.progress,
      assignedAt: presentDate(item.assignment.assignedAt),
      startedAt: presentNullableDate(item.assignment.startedAt),
      completedAt: presentNullableDate(item.assignment.completedAt),
      cancelledAt: presentNullableDate(item.assignment.cancelledAt),
    },
    proof: {
      proofText: item.proofText,
      proofFileId: item.proofFileId,
      file: item.proofFile ? presentProofFile(item.proofFile) : null,
    },
    createdAt: presentDate(item.createdAt),
    updatedAt: presentDate(item.updatedAt),
  };
}

export function presentReinforcementReviewItemDetail(
  item: ReinforcementReviewItemRecord,
): ReinforcementReviewItemResponseDto {
  return {
    ...presentReinforcementReviewItem(item),
    currentReview: item.currentReview
      ? presentReview(item.currentReview)
      : null,
    reviewHistory: item.reviews.map((review) => presentReview(review)),
  };
}

function presentReview(
  review: ReinforcementReviewItemRecord['reviews'][number],
) {
  return {
    id: review.id,
    outcome: presentReviewOutcome(review.outcome),
    note: review.note,
    noteAr: review.noteAr,
    reviewedById: review.reviewedById,
    reviewedAt: presentDate(review.reviewedAt),
    createdAt: presentDate(review.createdAt),
    updatedAt: presentDate(review.updatedAt),
  };
}

function presentReviewOutcome(outcome: ReinforcementReviewOutcome): string {
  return presentEnum(outcome);
}

function presentProofFile(
  file: NonNullable<ReinforcementReviewItemRecord['proofFile']>,
) {
  return {
    id: file.id,
    originalName: file.originalName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes.toString(),
    visibility: presentEnum(file.visibility),
    createdAt: presentDate(file.createdAt),
  };
}

function presentEnum(value: string): string {
  return value.toLowerCase();
}

function presentDecimal(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numberValue =
    typeof value === 'object' && 'toNumber' in value
      ? (value as { toNumber: () => number }).toNumber()
      : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function presentDate(date: Date): string {
  return date.toISOString();
}

function presentNullableDate(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}
