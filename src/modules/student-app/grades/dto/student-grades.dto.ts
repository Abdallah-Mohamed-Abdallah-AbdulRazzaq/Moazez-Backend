import { ApiPropertyOptional } from '@nestjs/swagger';
import type { QuestionGroupContext } from '../../../../common/question-groups/question-group.projection';
import type { RichContent } from '../../../../common/rich-content/rich-content.types';
import { ApiProperty } from '@nestjs/swagger';
import { GradeAssetDto } from '../../../grades/assessments/dto/grade-asset.dto';
import {
  GradeQuestionContractDto,
  GradeQuestionInteractionDto,
} from '../../../grades/shared/presenters/grade-question-contract';
import { GradeQuestionType } from '@prisma/client';
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
  nameAr!: string | null;
  nameEn!: string | null;
  name_ar!: string | null;
  name_en!: string | null;
}

export class StudentGradeTermDto {
  id!: string;
  academicYearId!: string;
  academic_year_id!: string;
  name!: string;
  nameAr!: string | null;
  nameEn!: string | null;
  name_ar!: string | null;
  name_en!: string | null;
}

export class StudentGradesSummaryDto {
  totalEarned!: number;
  totalMax!: number;
  percentage!: number | null;
  completedWeight!: number;
  assessmentCount!: number;
  enteredCount!: number;
  missingCount!: number;
  absentCount!: number;
  rating!: string | null;
  total_earned!: number;
  total_max!: number;
  completed_weight!: number;
  assessment_count!: number;
  entered_count!: number;
  missing_count!: number;
  absent_count!: number;
}

export class StudentGradeBreakdownItemDto {
  assessmentId!: string;
  title!: string | null;
  type!: string;
  earned!: number | null;
  total!: number;
  score!: number | null;
  maxScore!: number;
  percentage!: number | null;
  weight!: number;
  comment!: string | null;
  status!: string;
  date!: string;
}

export class StudentGradeSubjectDto {
  id!: string;
  subjectId!: string;
  subjectName!: string;
  subjectNameAr!: string | null;
  subjectNameEn!: string | null;
  subject_name!: string;
  subject_name_ar!: string | null;
  subject_name_en!: string | null;
  totalEarned!: number;
  totalMax!: number;
  percentage!: number | null;
  completedWeight!: number;
  assessmentCount!: number;
  enteredCount!: number;
  missingCount!: number;
  absentCount!: number;
  rating!: string | null;
  totalMarks!: number;
  total_marks!: number;
  earnedMarks!: number;
  earned_marks!: number;
  total_earned!: number;
  total_max!: number;
  completed_weight!: number;
  assessment_count!: number;
  entered_count!: number;
  missing_count!: number;
  absent_count!: number;
  breakdown!: StudentGradeBreakdownItemDto[];
}

export class StudentGradeAssessmentItemDto {
  deliveryMode!: string;
  supportsQuestionSubmission!: boolean;
  assessmentId!: string;
  subjectId!: string;
  subjectName!: string;
  title!: string | null;
  type!: string;
  status!: StudentGradeAssessmentStatus;
  date!: string;
  score!: number | null;
  maxScore!: number;
  weight!: number;
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
  selectedAcademicYear!: StudentGradeAcademicYearDto | null;
  selectedTerm!: StudentGradeTermDto | null;
  selected_academic_year!: StudentGradeAcademicYearDto | null;
  selected_term!: StudentGradeTermDto | null;
  summary!: StudentGradesSummaryDto;
  subjects!: StudentGradeSubjectDto[];
  assessments!: StudentGradeAssessmentItemDto[];
  pagination!: StudentGradesPaginationDto;
  emptyState!: StudentGradesEmptyStateDto | null;
  empty_state!: StudentGradesEmptyStateDto | null;
}

export class StudentGradesSummaryResponseDto {
  academicYear!: StudentGradeAcademicYearDto | null;
  term!: StudentGradeTermDto | null;
  selectedAcademicYear!: StudentGradeAcademicYearDto | null;
  selectedTerm!: StudentGradeTermDto | null;
  selected_academic_year!: StudentGradeAcademicYearDto | null;
  selected_term!: StudentGradeTermDto | null;
  summary!: StudentGradesSummaryDto;
  subjects!: StudentGradeSubjectDto[];
  emptyState!: StudentGradesEmptyStateDto | null;
  empty_state!: StudentGradesEmptyStateDto | null;
}

export class StudentGradesEmptyStateDto {
  reason!: string;
  message!: string;
}

export class StudentAssessmentGradeSubjectDto {
  subjectId!: string;
  name!: string;
  code!: string | null;
}

export class StudentAssessmentGradeAssessmentDto {
  @ApiProperty({ type: () => [GradeAssetDto] }) assets!: GradeAssetDto[];
  assessmentId!: string;
  title!: string | null;
  subject!: StudentAssessmentGradeSubjectDto;
  type!: string;
  status!: StudentGradeAssessmentStatus;
  deliveryMode!: string;
  supportsQuestionSubmission!: boolean;
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

export class StudentAssessmentGradeSelectedOptionDto {
  richContent?: RichContent;
  optionId!: string;
  label!: string;
  labelAr!: string | null;
  value!: string | null;
}

export class StudentAssessmentGradeSubmissionAnswerDto {
  canonicalType!: GradeQuestionType | null;
  interaction!: GradeQuestionInteractionDto;
  answerId!: string;
  questionId!: string;
  answerText!: string | null;
  answerJson!: unknown;
  selectedOptions!: StudentAssessmentGradeSelectedOptionDto[];
  correctionStatus!: string;
  awardedPoints!: number | null;
  maxPoints!: number | null;
  reviewerComment!: string | null;
  reviewerCommentAr!: string | null;
  reviewedAt!: string | null;
}

export class StudentAssessmentGradeSubmissionDto {
  submissionId!: string;
  status!: string;
  totalScore!: number | null;
  maxScore!: number | null;
  submittedAt!: string | null;
  correctedAt!: string | null;
  answers!: StudentAssessmentGradeSubmissionAnswerDto[];
}

export class StudentAssessmentGradeQuestionOptionDto {
  richContent?: RichContent;
  id!: string;
  optionId!: string;
  text!: string;
  textAr!: string | null;
  label!: string;
  labelAr!: string | null;
  value!: string | null;
  sortOrder!: number;
}

export class StudentAssessmentGradeQuestionDto extends GradeQuestionContractDto {
  @ApiProperty({ type: () => [GradeAssetDto] }) assets!: GradeAssetDto[];
  id!: string;
  questionId!: string;
  title!: string;
  body!: string;
  points!: number;
  required!: boolean;
  sortOrder!: number;
  options!: StudentAssessmentGradeQuestionOptionDto[];
}

export class StudentAssessmentGradeDetailResponseDto {
  @ApiPropertyOptional({
    type: [Object],
    description:
      'Authorized multipart groups with derived child points; omitted for legacy flat content.',
  })
  groups?: QuestionGroupContext['groups'];
  @ApiPropertyOptional({ type: [Object] })
  displayItems?: QuestionGroupContext['displayItems'];
  assessment!: StudentAssessmentGradeAssessmentDto;
  grade!: StudentAssessmentGradeItemDto;
  gradeItem!: StudentAssessmentGradeItemDto;
  submission!: StudentAssessmentGradeSubmissionDto | null;
  questions!: StudentAssessmentGradeQuestionDto[];
}
