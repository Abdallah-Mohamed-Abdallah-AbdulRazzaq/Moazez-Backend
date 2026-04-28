export class GradeSubmissionGradeItemSyncSubmissionResponseDto {
  id!: string;
  assessmentId!: string;
  studentId!: string;
  enrollmentId!: string;
  status!: string;
  totalScore!: number | null;
  maxScore!: number | null;
  correctedAt!: string | null;
}

export class GradeSubmissionGradeItemSyncGradeItemResponseDto {
  id!: string;
  assessmentId!: string;
  studentId!: string;
  enrollmentId!: string | null;
  status!: string;
  score!: number | null;
  enteredAt!: string | null;
  enteredById!: string | null;
}

export class GradeSubmissionGradeItemSyncResponseDto {
  submission!: GradeSubmissionGradeItemSyncSubmissionResponseDto;
  gradeItem!: GradeSubmissionGradeItemSyncGradeItemResponseDto;
  synced!: boolean;
  idempotent!: boolean;
}
