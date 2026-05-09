import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export const PARENT_GRADE_ASSESSMENT_TYPES = [
  'quiz',
  'month_exam',
  'midterm',
  'term_exam',
  'assignment',
  'final',
  'practical',
] as const;

export const PARENT_GRADE_ASSESSMENT_STATUSES = [
  'published',
  'approved',
  'locked',
] as const;

export type ParentGradeAssessmentType =
  (typeof PARENT_GRADE_ASSESSMENT_TYPES)[number];

export type ParentGradeAssessmentStatus =
  (typeof PARENT_GRADE_ASSESSMENT_STATUSES)[number];

function toLowerOptionalString(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class ParentGradesQueryDto {
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(PARENT_GRADE_ASSESSMENT_TYPES)
  type?: ParentGradeAssessmentType;

  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(PARENT_GRADE_ASSESSMENT_STATUSES)
  status?: ParentGradeAssessmentStatus;

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

export class ParentGradesChildDto {
  studentId!: string;
  enrollmentId!: string;
  student_id!: string;
  enrollment_id!: string;
}

export class ParentGradeAcademicYearDto {
  id!: string;
  name!: string;
}

export class ParentGradeTermDto {
  id!: string;
  name!: string;
}

export class ParentGradesSummaryDto {
  totalEarned!: number;
  totalMax!: number;
  percentage!: number | null;
  rating!: string | null;
  motivationalMessage!: string | null;
  total_earned!: number;
  total_max!: number;
  motivational_message!: string | null;
}

export class ParentGradeBreakdownItemDto {
  assessmentId!: string;
  title!: string | null;
  type!: string;
  earned!: number | null;
  total!: number;
  status!: string;
  date!: string;
}

export class ParentGradeSubjectDto {
  id!: string;
  subjectId!: string;
  subjectName!: string;
  subject_name!: string;
  totalMarks!: number;
  total_marks!: number;
  earnedMarks!: number;
  earned_marks!: number;
  percentage!: number | null;
  rating!: string | null;
  breakdown!: ParentGradeBreakdownItemDto[];
}

export class ParentGradeAssessmentItemDto {
  assessmentId!: string;
  subjectId!: string;
  subjectName!: string;
  title!: string | null;
  type!: string;
  status!: ParentGradeAssessmentStatus;
  date!: string;
  score!: number | null;
  maxScore!: number;
  percent!: number | null;
  gradeItemId!: string | null;
  itemStatus!: string;
  isVirtualMissing!: boolean;
}

export class ParentGradesVisibilityDto {
  statuses!: ParentGradeAssessmentStatus[];
  reason!: 'published_or_approved_assessments_only';
}

export class ParentGradesPaginationDto {
  page!: number;
  limit!: number;
  total!: number;
}

export class ParentGradesListResponseDto {
  child!: ParentGradesChildDto;
  academicYears!: ParentGradeAcademicYearDto[];
  academic_years!: ParentGradeAcademicYearDto[];
  terms!: ParentGradeTermDto[];
  summary!: ParentGradesSummaryDto;
  subjects!: ParentGradeSubjectDto[];
  assessments!: ParentGradeAssessmentItemDto[];
  pagination!: ParentGradesPaginationDto;
  visibility!: ParentGradesVisibilityDto;
}

export class ParentGradesSummaryResponseDto {
  child!: ParentGradesChildDto;
  academicYear!: ParentGradeAcademicYearDto | null;
  term!: ParentGradeTermDto | null;
  summary!: ParentGradesSummaryDto;
  subjects!: ParentGradeSubjectDto[];
  visibility!: ParentGradesVisibilityDto;
}

export class ParentAssessmentGradeSubjectDto {
  subjectId!: string;
  name!: string;
  code!: string | null;
}

export class ParentAssessmentGradeAssessmentDto {
  assessmentId!: string;
  title!: string | null;
  subject!: ParentAssessmentGradeSubjectDto;
  type!: string;
  status!: ParentGradeAssessmentStatus;
  deliveryMode!: string;
  date!: string;
  maxScore!: number;
  weight!: number;
  expectedTimeMinutes!: number | null;
}

export class ParentAssessmentGradeItemDto {
  gradeItemId!: string | null;
  status!: string;
  score!: number | null;
  maxScore!: number;
  percent!: number | null;
  comment!: string | null;
  enteredAt!: string | null;
  isVirtualMissing!: boolean;
}

export class ParentAssessmentGradeSubmissionDto {
  submissionId!: string;
  status!: string;
  totalScore!: number | null;
  maxScore!: number | null;
  submittedAt!: string | null;
  correctedAt!: string | null;
}

export class ParentAssessmentGradeDetailResponseDto {
  child!: ParentGradesChildDto;
  assessment!: ParentAssessmentGradeAssessmentDto;
  grade!: ParentAssessmentGradeItemDto;
  submission!: ParentAssessmentGradeSubmissionDto | null;
  visibility!: ParentGradesVisibilityDto;
}
