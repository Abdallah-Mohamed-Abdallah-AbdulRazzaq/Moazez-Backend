import { IsUUID } from 'class-validator';

export class LinkHomeworkGradeAssessmentDto {
  @IsUUID()
  gradeAssessmentId!: string;
}

export class HomeworkGradeSyncAssessmentSummaryDto {
  gradeAssessmentId!: string;
  title!: string | null;
  type!: string;
  deliveryMode!: string;
  status!: string;
  maxMarks!: number;
  isLocked!: boolean;
}

export class HomeworkGradeSyncSummaryDto {
  totalReviewedSubmissions!: number;
  syncedSubmissions!: number;
  pendingSyncSubmissions!: number;
  failedSyncSubmissions!: number;
  lastSyncedAt!: string | null;
}

export class HomeworkGradeSyncSubmissionResultDto {
  submissionId!: string;
  studentId!: string;
  enrollmentId!: string;
  score!: number;
  gradeItemId!: string | null;
  synced!: boolean;
  idempotent!: boolean;
}

export class HomeworkGradeSyncStatusResponseDto {
  homeworkId!: string;
  linked!: boolean;
  gradeAssessment!: HomeworkGradeSyncAssessmentSummaryDto | null;
  syncSummary!: HomeworkGradeSyncSummaryDto;
  warnings!: string[];
}

export class HomeworkGradeSyncResponseDto extends HomeworkGradeSyncStatusResponseDto {
  submissionSync?: HomeworkGradeSyncSubmissionResultDto;
}
