import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export const STUDENT_GRADE_ASSESSMENT_TYPES = [
  'quiz',
  'month_exam',
  'midterm',
  'term_exam',
  'assignment',
  'final',
  'practical',
] as const;

export const STUDENT_GRADE_ASSESSMENT_STATUSES = [
  'published',
  'approved',
  'locked',
] as const;

export type StudentGradeAssessmentType =
  (typeof STUDENT_GRADE_ASSESSMENT_TYPES)[number];

export type StudentGradeAssessmentStatus =
  (typeof STUDENT_GRADE_ASSESSMENT_STATUSES)[number];

function toLowerOptionalString(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class StudentGradesQueryDto {
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(STUDENT_GRADE_ASSESSMENT_TYPES)
  type?: StudentGradeAssessmentType;

  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(STUDENT_GRADE_ASSESSMENT_STATUSES)
  status?: StudentGradeAssessmentStatus;

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

export class StudentGradeAcademicYearDto {
  id!: string;
  name!: string;
}

export class StudentGradeTermDto {
  id!: string;
  name!: string;
}

export class StudentGradesSummaryDto {
  totalEarned!: number;
  totalMax!: number;
  percentage!: number | null;
  total_earned!: number;
  total_max!: number;
}

export class StudentGradeBreakdownItemDto {
  assessmentId!: string;
  title!: string | null;
  type!: string;
  earned!: number | null;
  total!: number;
  status!: string;
  date!: string;
}

export class StudentGradeSubjectDto {
  id!: string;
  subjectId!: string;
  subjectName!: string;
  subject_name!: string;
  totalMarks!: number;
  total_marks!: number;
  earnedMarks!: number;
  earned_marks!: number;
  breakdown!: StudentGradeBreakdownItemDto[];
}

export class StudentGradeAssessmentItemDto {
  assessmentId!: string;
  subjectId!: string;
  subjectName!: string;
  title!: string | null;
  type!: string;
  status!: StudentGradeAssessmentStatus;
  date!: string;
  score!: number | null;
  maxScore!: number;
  percent!: number | null;
  gradeItemId!: string | null;
  itemStatus!: string;
  isVirtualMissing!: boolean;
}

export class StudentGradesPaginationDto {
  page!: number;
  limit!: number;
  total!: number;
}

export class StudentGradesListResponseDto {
  academicYears!: StudentGradeAcademicYearDto[];
  academic_years!: StudentGradeAcademicYearDto[];
  terms!: StudentGradeTermDto[];
  summary!: StudentGradesSummaryDto;
  subjects!: StudentGradeSubjectDto[];
  assessments!: StudentGradeAssessmentItemDto[];
  pagination!: StudentGradesPaginationDto;
}

export class StudentGradesSummaryResponseDto {
  academicYear!: StudentGradeAcademicYearDto | null;
  term!: StudentGradeTermDto | null;
  summary!: StudentGradesSummaryDto;
  subjects!: StudentGradeSubjectDto[];
}

export class StudentAssessmentGradeSubjectDto {
  subjectId!: string;
  name!: string;
  code!: string | null;
}

export class StudentAssessmentGradeAssessmentDto {
  assessmentId!: string;
  title!: string | null;
  subject!: StudentAssessmentGradeSubjectDto;
  type!: string;
  status!: StudentGradeAssessmentStatus;
  deliveryMode!: string;
  date!: string;
  maxScore!: number;
  weight!: number;
  expectedTimeMinutes!: number | null;
}

export class StudentAssessmentGradeItemDto {
  gradeItemId!: string | null;
  status!: string;
  score!: number | null;
  maxScore!: number;
  percent!: number | null;
  comment!: string | null;
  enteredAt!: string | null;
  isVirtualMissing!: boolean;
}

export class StudentAssessmentGradeSubmissionDto {
  submissionId!: string;
  status!: string;
  totalScore!: number | null;
  maxScore!: number | null;
  submittedAt!: string | null;
  correctedAt!: string | null;
}

export class StudentAssessmentGradeDetailResponseDto {
  assessment!: StudentAssessmentGradeAssessmentDto;
  grade!: StudentAssessmentGradeItemDto;
  submission!: StudentAssessmentGradeSubmissionDto | null;
}
