import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export const STUDENT_EXAM_TYPES = [
  'quiz',
  'month_exam',
  'midterm',
  'term_exam',
  'final',
] as const;

export const STUDENT_EXAM_STATUSES = [
  'not_started',
  'in_progress',
  'completed',
] as const;

export type StudentExamType = (typeof STUDENT_EXAM_TYPES)[number];
export type StudentExamStatus = (typeof STUDENT_EXAM_STATUSES)[number];

function toLowerOptionalString(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class StudentExamsQueryDto {
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(STUDENT_EXAM_TYPES)
  type?: StudentExamType;

  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(STUDENT_EXAM_STATUSES)
  status?: StudentExamStatus;

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

export class StudentExamCardDto {
  id!: string;
  assessmentId!: string;
  examName!: string | null;
  exam_name!: string | null;
  description!: string | null;
  skill_tag!: string | null;
  status!: StudentExamStatus;
  total_xp!: number;
  duration_minutes!: number | null;
  question_count!: number;
  type!: string;
  date!: string;
  maxScore!: number;
}

export class StudentExamSubjectGroupDto {
  subject_id!: string;
  subject_name!: string;
  subjectId!: string;
  subjectName!: string;
  exams_count!: number;
  exams!: StudentExamCardDto[];
}

export class StudentExamPaginationDto {
  page!: number;
  limit!: number;
  total!: number;
}

export class StudentExamMappingDto {
  source!: 'GradeAssessment.type';
  examTypes!: string[];
}

export class StudentExamsListResponseDto {
  subjects!: StudentExamSubjectGroupDto[];
  pagination!: StudentExamPaginationDto;
  mapping!: StudentExamMappingDto;
}

export class StudentExamOptionDto {
  optionId!: string;
  label!: string;
  labelAr!: string | null;
  value!: string | null;
}

export class StudentExamQuestionDto {
  id!: string;
  questionId!: string;
  type!: string;
  title!: string;
  body!: string;
  options!: StudentExamOptionDto[];
  answer!: null;
  points!: number;
  sortOrder!: number;
  required!: boolean;
}

export class StudentExamStageDto {
  id!: string;
  title!: string;
  subtitle!: string | null;
  type!: string;
  question_count!: number;
  questions!: StudentExamQuestionDto[];
}

export class StudentExamDetailResponseDto {
  id!: string;
  assessmentId!: string;
  subject_name!: string;
  subjectName!: string;
  exam_name!: string | null;
  examName!: string | null;
  description!: string | null;
  skill_tag!: string | null;
  status!: StudentExamStatus;
  total_xp!: number;
  duration_minutes!: number | null;
  question_count!: number;
  type!: string;
  date!: string;
  maxScore!: number;
  stages!: StudentExamStageDto[];
}

export class StudentExamSubmissionSelectedOptionDto {
  optionId!: string;
  label!: string;
  labelAr!: string | null;
  value!: string | null;
}

export class StudentExamSubmissionAnswerDto {
  answerId!: string;
  questionId!: string;
  type!: string;
  answerText!: string | null;
  answerJson!: unknown;
  selectedOptions!: StudentExamSubmissionSelectedOptionDto[];
  correctionStatus!: string;
  score!: number | null;
  maxScore!: number | null;
  reviewedAt!: string | null;
  feedback!: string | null;
}

export class StudentExamSubmissionDto {
  submissionId!: string;
  status!: string;
  startedAt!: string;
  submittedAt!: string | null;
  correctedAt!: string | null;
  totalScore!: number | null;
  maxScore!: number | null;
  answers!: StudentExamSubmissionAnswerDto[];
}

export class StudentExamSubmissionStateResponseDto {
  assessmentId!: string;
  status!: StudentExamStatus;
  submission!: StudentExamSubmissionDto | null;
}
