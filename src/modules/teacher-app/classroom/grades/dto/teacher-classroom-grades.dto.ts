import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const TEACHER_CLASSROOM_ASSESSMENT_STATUSES = [
  'draft',
  'published',
  'approved',
  'locked',
] as const;

export const TEACHER_CLASSROOM_ASSESSMENT_TYPES = [
  'quiz',
  'month_exam',
  'midterm',
  'term_exam',
  'assignment',
  'final',
  'practical',
] as const;

export type TeacherClassroomAssessmentStatus =
  (typeof TEACHER_CLASSROOM_ASSESSMENT_STATUSES)[number];

export type TeacherClassroomAssessmentType =
  (typeof TEACHER_CLASSROOM_ASSESSMENT_TYPES)[number];

export const TEACHER_CLASSROOM_ASSIGNMENT_SUBMISSION_STATUSES = [
  'in_progress',
  'submitted',
  'corrected',
] as const;

export type TeacherClassroomAssignmentSubmissionStatus =
  (typeof TEACHER_CLASSROOM_ASSIGNMENT_SUBMISSION_STATUSES)[number];

function toLowerOptionalString(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class TeacherClassroomGradesParamsDto {
  @IsUUID()
  classId!: string;
}

export class TeacherClassroomAssessmentParamsDto extends TeacherClassroomGradesParamsDto {
  @IsUUID()
  assessmentId!: string;
}

export class TeacherClassroomAssignmentParamsDto extends TeacherClassroomGradesParamsDto {
  @IsUUID()
  assignmentId!: string;
}

export class TeacherClassroomAssignmentSubmissionParamsDto extends TeacherClassroomAssignmentParamsDto {
  @IsUUID()
  submissionId!: string;
}

export class ListTeacherClassroomAssessmentsQueryDto {
  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(TEACHER_CLASSROOM_ASSESSMENT_STATUSES)
  status?: TeacherClassroomAssessmentStatus;

  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(TEACHER_CLASSROOM_ASSESSMENT_TYPES)
  type?: TeacherClassroomAssessmentType;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class GetTeacherClassroomGradebookQueryDto {
  @IsOptional()
  @IsUUID()
  assessmentId?: string;

  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class ListTeacherClassroomAssignmentsQueryDto {
  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(TEACHER_CLASSROOM_ASSESSMENT_STATUSES)
  status?: TeacherClassroomAssessmentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class ListTeacherClassroomAssignmentSubmissionsQueryDto {
  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(TEACHER_CLASSROOM_ASSIGNMENT_SUBMISSION_STATUSES)
  status?: TeacherClassroomAssignmentSubmissionStatus;

  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class TeacherClassroomGradesPaginationDto {
  page!: number;
  limit!: number;
  total!: number;
}

export class TeacherClassroomAssessmentCardDto {
  assessmentId!: string;
  title!: string | null;
  type!: string;
  status!: TeacherClassroomAssessmentStatus;
  deliveryMode!: string;
  date!: string;
  maxScore!: number;
  weight!: number;
  publishedAt!: string | null;
  approvedAt!: string | null;
  lockedAt!: string | null;
  itemsCount!: number;
  submissionsCount!: number;
}

export class TeacherClassroomAssessmentsListResponseDto {
  classId!: string;
  assessments!: TeacherClassroomAssessmentCardDto[];
  pagination!: TeacherClassroomGradesPaginationDto;
}

export class TeacherClassroomAssessmentQuestionSummaryDto {
  questionId!: string;
  type!: string;
  prompt!: string;
  points!: number;
  sortOrder!: number;
  required!: boolean;
  optionsCount!: number;
}

export class TeacherClassroomAssessmentItemsSummaryDto {
  itemsCount!: number;
  enteredCount!: number;
  missingCount!: number;
  absentCount!: number;
}

export class TeacherClassroomAssessmentSubmissionsSummaryDto {
  submissionsCount!: number;
  inProgressCount!: number;
  submittedCount!: number;
  correctedCount!: number;
}

export class TeacherClassroomAssessmentDetailDto extends TeacherClassroomAssessmentCardDto {
  titleEn!: string | null;
  titleAr!: string | null;
  expectedTimeMinutes!: number | null;
  isLocked!: boolean;
  createdAt!: string;
  updatedAt!: string;
}

export class TeacherClassroomAssessmentDetailResponseDto {
  classId!: string;
  assessment!: TeacherClassroomAssessmentDetailDto;
  itemsSummary!: TeacherClassroomAssessmentItemsSummaryDto;
  submissionsSummary!: TeacherClassroomAssessmentSubmissionsSummaryDto;
  questions!: TeacherClassroomAssessmentQuestionSummaryDto[];
}

export class TeacherClassroomGradebookItemDto {
  assessmentId!: string;
  assessmentTitle!: string | null;
  score!: number | null;
  maxScore!: number;
  status!: string;
  workflowState!: TeacherClassroomAssessmentStatus;
}

export class TeacherClassroomGradebookStudentDto {
  studentId!: string;
  displayName!: string;
  grades!: TeacherClassroomGradebookItemDto[];
}

export class TeacherClassroomGradebookSummaryDto {
  studentsCount!: number;
  assessmentsCount!: number;
}

export class TeacherClassroomGradebookResponseDto {
  classId!: string;
  students!: TeacherClassroomGradebookStudentDto[];
  summary!: TeacherClassroomGradebookSummaryDto;
  pagination!: TeacherClassroomGradesPaginationDto;
}

export class TeacherClassroomAssignmentCardDto {
  assignmentId!: string;
  source!: 'grades_assessment';
  title!: string | null;
  type!: string;
  status!: TeacherClassroomAssessmentStatus;
  maxScore!: number;
  dueAt!: null;
  submissionsCount!: number;
  gradedCount!: number;
}

export class TeacherClassroomAssignmentsListResponseDto {
  classId!: string;
  assignments!: TeacherClassroomAssignmentCardDto[];
  pagination!: TeacherClassroomGradesPaginationDto;
}

export class TeacherClassroomAssignmentQuestionSummaryDto {
  available!: boolean;
  questionsCount!: number;
  requiredQuestionsCount!: number;
  totalPoints!: number;
  types!: string[];
}

export class TeacherClassroomAssignmentDetailDto {
  assignmentId!: string;
  source!: 'grades_assessment';
  title!: string | null;
  description!: string | null;
  type!: string;
  status!: TeacherClassroomAssessmentStatus;
  maxScore!: number;
  weight!: number;
  dueAt!: null;
  publishedAt!: string | null;
  approvedAt!: string | null;
  lockedAt!: string | null;
  itemsCount!: number;
  submissionsCount!: number;
  gradedCount!: number;
  pendingReviewCount!: number;
  questionSummary!: TeacherClassroomAssignmentQuestionSummaryDto | null;
}

export class TeacherClassroomAssignmentDetailResponseDto {
  classId!: string;
  assignment!: TeacherClassroomAssignmentDetailDto;
}

export class TeacherClassroomAssignmentSubmissionStudentDto {
  studentId!: string;
  displayName!: string;
}

export class TeacherClassroomAssignmentSubmissionListItemDto {
  submissionId!: string;
  status!: TeacherClassroomAssignmentSubmissionStatus;
  student!: TeacherClassroomAssignmentSubmissionStudentDto;
  score!: number | null;
  maxScore!: number;
  submittedAt!: string | null;
  reviewedAt!: string | null;
  finalizedAt!: string | null;
  answersCount!: number;
  reviewedAnswersCount!: number;
}

export class TeacherClassroomAssignmentSubmissionsListResponseDto {
  classId!: string;
  assignmentId!: string;
  source!: 'grades_assessment';
  submissions!: TeacherClassroomAssignmentSubmissionListItemDto[];
  pagination!: TeacherClassroomGradesPaginationDto;
}

export class TeacherClassroomAssignmentSubmissionSelectedOptionDto {
  optionId!: string;
  label!: string;
  labelAr!: string | null;
  value!: string | null;
}

export class TeacherClassroomAssignmentSubmissionAnswerValueDto {
  text!: string | null;
  json!: unknown;
  selectedOptions!: TeacherClassroomAssignmentSubmissionSelectedOptionDto[];
}

export class TeacherClassroomAssignmentSubmissionAnswerDto {
  answerId!: string | null;
  questionId!: string;
  type!: string;
  prompt!: string;
  promptAr!: string | null;
  required!: boolean;
  sortOrder!: number;
  studentAnswer!: TeacherClassroomAssignmentSubmissionAnswerValueDto | null;
  correctionStatus!: string | null;
  score!: number | null;
  maxScore!: number;
  reviewedAt!: string | null;
  feedback!: string | null;
}

export class TeacherClassroomAssignmentSubmissionDetailDto extends TeacherClassroomAssignmentSubmissionListItemDto {
  startedAt!: string;
  answers!: TeacherClassroomAssignmentSubmissionAnswerDto[];
}

export class TeacherClassroomAssignmentSubmissionDetailResponseDto {
  classId!: string;
  assignmentId!: string;
  source!: 'grades_assessment';
  submission!: TeacherClassroomAssignmentSubmissionDetailDto;
}
