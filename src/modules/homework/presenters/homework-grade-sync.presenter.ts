import { GradeItemStatus } from '@prisma/client';
import { GradeAssessmentResponseDto } from '../../grades/assessments/dto/grade-assessment.dto';
import { GradeAssessmentItemResponseDto } from '../../grades/assessments/dto/grade-assessment-items.dto';
import {
  HomeworkGradeSyncAssessmentSummaryDto,
  HomeworkGradeSyncResponseDto,
  HomeworkGradeSyncStatusResponseDto,
  HomeworkGradeSyncSubmissionResultDto,
} from '../dto/homework-grade-sync.dto';
import {
  HomeworkReviewSubmissionRecord,
  HomeworkAssignmentWithCounters,
} from '../infrastructure/homework.repository';

export interface HomeworkGradeSyncPresentationInput {
  assignment: Pick<HomeworkAssignmentWithCounters, 'id'>;
  gradeAssessment: GradeAssessmentResponseDto | null;
  reviewedSubmissions: HomeworkReviewSubmissionRecord[];
  gradeItems: GradeAssessmentItemResponseDto[];
}

export function presentHomeworkGradeSyncStatus(
  input: HomeworkGradeSyncPresentationInput,
): HomeworkGradeSyncStatusResponseDto {
  const summary = summarizeSync(input.reviewedSubmissions, input.gradeItems);

  return {
    homeworkId: input.assignment.id,
    linked: Boolean(input.gradeAssessment),
    gradeAssessment: input.gradeAssessment
      ? presentAssessmentSummary(input.gradeAssessment)
      : null,
    syncSummary: summary,
    warnings: buildWarnings(input.gradeAssessment, summary),
  };
}

export function presentHomeworkGradeSyncResponse(input: {
  status: HomeworkGradeSyncStatusResponseDto;
  submissionSync?: HomeworkGradeSyncSubmissionResultDto;
}): HomeworkGradeSyncResponseDto {
  return {
    ...input.status,
    ...(input.submissionSync ? { submissionSync: input.submissionSync } : {}),
  };
}

export function presentHomeworkGradeSyncSubmissionResult(input: {
  submission: HomeworkReviewSubmissionRecord;
  gradeItem: GradeAssessmentItemResponseDto;
  existingGradeItem: GradeAssessmentItemResponseDto | null;
}): HomeworkGradeSyncSubmissionResultDto {
  const score = presentNumber(input.submission.awardedMarks) ?? 0;

  return {
    submissionId: input.submission.id,
    studentId: input.submission.studentId,
    enrollmentId: input.submission.enrollmentId,
    score,
    gradeItemId: input.gradeItem.id,
    synced: true,
    idempotent: isExistingItemAlreadySynced({
      submission: input.submission,
      gradeItem: input.existingGradeItem,
    }),
  };
}

function presentAssessmentSummary(
  assessment: GradeAssessmentResponseDto,
): HomeworkGradeSyncAssessmentSummaryDto {
  return {
    gradeAssessmentId: assessment.id,
    title: assessment.title,
    type: assessment.type,
    deliveryMode: assessment.deliveryMode,
    status: assessment.approvalStatus,
    maxMarks: assessment.maxScore,
    isLocked: assessment.isLocked,
  };
}

function summarizeSync(
  submissions: HomeworkReviewSubmissionRecord[],
  gradeItems: GradeAssessmentItemResponseDto[],
) {
  const gradeItemByStudentId = new Map(
    gradeItems.map((item) => [item.studentId, item]),
  );
  let syncedSubmissions = 0;
  let lastSyncedAt: string | null = null;

  for (const submission of submissions) {
    const gradeItem = gradeItemByStudentId.get(submission.studentId) ?? null;
    if (isExistingItemAlreadySynced({ submission, gradeItem })) {
      syncedSubmissions += 1;
      if (
        gradeItem?.enteredAt &&
        (!lastSyncedAt || gradeItem.enteredAt > lastSyncedAt)
      ) {
        lastSyncedAt = gradeItem.enteredAt;
      }
    }
  }

  return {
    totalReviewedSubmissions: submissions.length,
    syncedSubmissions,
    pendingSyncSubmissions: submissions.length - syncedSubmissions,
    failedSyncSubmissions: 0,
    lastSyncedAt,
  };
}

function buildWarnings(
  assessment: GradeAssessmentResponseDto | null,
  summary: ReturnType<typeof summarizeSync>,
): string[] {
  const warnings: string[] = [];

  if (!assessment) {
    warnings.push('notLinked');
  } else if (assessment.isLocked) {
    warnings.push('assessmentLocked');
  }

  if (summary.totalReviewedSubmissions === 0) {
    warnings.push('noReviewedSubmissions');
  }

  return warnings;
}

function isExistingItemAlreadySynced(input: {
  submission: HomeworkReviewSubmissionRecord;
  gradeItem: GradeAssessmentItemResponseDto | null;
}): boolean {
  const expectedScore = presentNumber(input.submission.awardedMarks);
  if (expectedScore === null || !input.gradeItem) return false;

  return (
    input.gradeItem.status === GradeItemStatus.ENTERED.toLowerCase() &&
    input.gradeItem.score === expectedScore
  );
}

function presentNumber(
  value: { toNumber(): number } | number | string | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return value.toNumber();

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
