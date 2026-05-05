import { IsUUID } from 'class-validator';
import { TeacherClassroomAssignmentSubmissionDetailResponseDto } from './teacher-classroom-grades.dto';

export class TeacherClassroomSubmissionReviewParamsDto {
  @IsUUID()
  classId!: string;

  @IsUUID()
  assignmentId!: string;

  @IsUUID()
  submissionId!: string;
}

export class TeacherClassroomSubmissionAnswerReviewParamsDto extends TeacherClassroomSubmissionReviewParamsDto {
  @IsUUID()
  answerId!: string;
}

export class TeacherClassroomReviewedAnswerSelectedOptionDto {
  optionId!: string;
  label!: string;
  labelAr!: string | null;
  value!: string | null;
}

export class TeacherClassroomReviewedAnswerValueDto {
  text!: string | null;
  json!: unknown;
  selectedOptions!: TeacherClassroomReviewedAnswerSelectedOptionDto[];
}

export class TeacherClassroomReviewedAnswerDto {
  answerId!: string;
  questionId!: string;
  type!: string;
  studentAnswer!: TeacherClassroomReviewedAnswerValueDto;
  correctionStatus!: string;
  score!: number | null;
  maxScore!: number | null;
  reviewedAt!: string | null;
  feedback!: string | null;
}

export class TeacherClassroomSubmissionAnswerReviewResponseDto {
  classId!: string;
  assignmentId!: string;
  submissionId!: string;
  source!: 'grades_assessment';
  answer!: TeacherClassroomReviewedAnswerDto;
}

export class TeacherClassroomBulkSubmissionAnswerReviewResponseDto {
  classId!: string;
  assignmentId!: string;
  submissionId!: string;
  source!: 'grades_assessment';
  reviewedCount!: number;
  answers!: TeacherClassroomReviewedAnswerDto[];
}

export class TeacherClassroomSubmissionReviewFinalizeResponseDto extends TeacherClassroomAssignmentSubmissionDetailResponseDto {}

export class TeacherClassroomSubmissionGradeItemSyncSubmissionDto {
  submissionId!: string;
  assignmentId!: string;
  studentId!: string;
  enrollmentId!: string;
  status!: string;
  totalScore!: number | null;
  maxScore!: number | null;
  correctedAt!: string | null;
}

export class TeacherClassroomSubmissionGradeItemSyncItemDto {
  gradeItemId!: string;
  assignmentId!: string;
  studentId!: string;
  enrollmentId!: string | null;
  status!: string;
  score!: number | null;
  enteredAt!: string | null;
}

export class TeacherClassroomSubmissionGradeItemSyncResponseDto {
  classId!: string;
  assignmentId!: string;
  submissionId!: string;
  source!: 'grades_assessment';
  synced!: boolean;
  idempotent!: boolean;
  submission!: TeacherClassroomSubmissionGradeItemSyncSubmissionDto;
  gradeItem!: TeacherClassroomSubmissionGradeItemSyncItemDto;
}
