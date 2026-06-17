import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { GradeAssessmentApprovalStatus } from '@prisma/client';

function toOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;

  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;
  return Boolean(value);
}

function toUpperEnumValue(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

export class GetGradesOverviewQueryDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  yearId?: string;

  @IsUUID()
  termId!: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  scopeType?: string;

  @IsOptional()
  @IsUUID()
  scopeId?: string;

  @IsOptional()
  @IsUUID()
  stageId?: string;

  @IsOptional()
  @IsUUID()
  gradeId?: string;

  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsOptional()
  @IsUUID()
  classroomId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @Transform(({ value }) => toUpperEnumValue(value))
  @IsEnum(GradeAssessmentApprovalStatus)
  assessmentStatus?: GradeAssessmentApprovalStatus;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  includeVirtualMissing?: boolean;
}

export class GradesOverviewScopeResponseDto {
  scopeType!: 'school' | 'stage' | 'grade' | 'section' | 'classroom';
  scopeId!: string;
  label!: string;
}

export class GradesOverviewTotalsResponseDto {
  studentCount!: number;
  assessmentCount!: number;
  completedAssessmentCount!: number;
  publishedAssessmentCount!: number;
  approvedAssessmentCount!: number;
  lockedAssessmentCount!: number;
}

export class GradesOverviewPerformanceResponseDto {
  averagePercent!: number | null;
  highestPercent!: number | null;
  lowestPercent!: number | null;
  passingCount!: number;
  failingCount!: number;
  incompleteCount!: number;
}

export class GradesOverviewCompletionResponseDto {
  enteredCount!: number;
  missingCount!: number;
  absentCount!: number;
  completedWeightAverage!: number | null;
}

export class GradesOverviewAssessmentResponseDto {
  assessmentId!: string;
  title!: string | null;
  subjectId!: string;
  subjectName!: string | null;
  type!: string;
  deliveryMode!: string;
  approvalStatus!: string;
  date!: string;
  weight!: number;
  maxScore!: number;
  averagePercent!: number | null;
  enteredCount!: number;
  missingCount!: number;
  absentCount!: number;
}

export class GradesOverviewRuleResponseDto {
  source!: string;
  passMark!: number;
  rounding!: string;
}

export class GradesOverviewEmptyStateResponseDto {
  reason!: string;
  message!: string;
}

export class GradesOverviewResponseDto {
  academicYearId!: string;
  yearId!: string;
  termId!: string;
  subjectId!: string | null;
  scope!: GradesOverviewScopeResponseDto;
  totals!: GradesOverviewTotalsResponseDto;
  performance!: GradesOverviewPerformanceResponseDto;
  completion!: GradesOverviewCompletionResponseDto;
  assessments!: GradesOverviewAssessmentResponseDto[];
  rule!: GradesOverviewRuleResponseDto | null;
  emptyState!: GradesOverviewEmptyStateResponseDto | null;
}
