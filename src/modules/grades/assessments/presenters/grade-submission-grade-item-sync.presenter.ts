import { presentDecimal, presentGradeItemStatus } from '../../shared/presenters/grades.presenter';
import { GradeSubmissionGradeItemSyncResponseDto } from '../dto/grade-submission-grade-item-sync.dto';
import {
  GradeItemSyncRecord,
  GradeSubmissionForGradeItemSyncRecord,
} from '../infrastructure/grades-submission-grade-item-sync.repository';

export function presentGradeSubmissionGradeItemSync(params: {
  submission: GradeSubmissionForGradeItemSyncRecord;
  gradeItem: GradeItemSyncRecord;
  synced: boolean;
  idempotent: boolean;
}): GradeSubmissionGradeItemSyncResponseDto {
  return {
    submission: {
      id: params.submission.id,
      assessmentId: params.submission.assessmentId,
      studentId: params.submission.studentId,
      enrollmentId: params.submission.enrollmentId,
      status: String(params.submission.status).trim().toLowerCase(),
      totalScore: presentDecimal(params.submission.totalScore),
      maxScore: presentDecimal(params.submission.maxScore),
      correctedAt: presentNullableDate(params.submission.correctedAt),
    },
    gradeItem: {
      id: params.gradeItem.id,
      assessmentId: params.gradeItem.assessmentId,
      studentId: params.gradeItem.studentId,
      enrollmentId: params.gradeItem.enrollmentId,
      status: presentGradeItemStatus(params.gradeItem.status),
      score: presentDecimal(params.gradeItem.score),
      enteredAt: presentNullableDate(params.gradeItem.enteredAt),
      enteredById: params.gradeItem.enteredById,
    },
    synced: params.synced,
    idempotent: params.idempotent,
  };
}

function presentNullableDate(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}
