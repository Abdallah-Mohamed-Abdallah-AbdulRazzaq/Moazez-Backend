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

export class GetGradebookQueryDto {
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

export class GradebookRuleResponseDto {
  source!: string;
  ruleId!: string | null;
  passMark!: number;
  rounding!: string;
  gradingScale!: string;
}

export class GradebookScopeResponseDto {
  scopeType!: string;
  scopeKey!: string;
  scopeId!: string;
  stageId!: string | null;
  gradeId!: string | null;
  sectionId!: string | null;
  classroomId!: string | null;
}

export class GradebookColumnResponseDto {
  assessmentId!: string;
  subjectId!: string;
  title!: string | null;
  titleEn!: string | null;
  titleAr!: string | null;
  type!: string;
  date!: string;
  weight!: number;
  maxScore!: number;
  approvalStatus!: string;
  isLocked!: boolean;
}

export class GradebookStudentResponseDto {
  id!: string;
  firstName!: string;
  lastName!: string;
  nameAr!: string | null;
  nameEn!: string;
  code!: string | null;
  admissionNo!: string | null;
}

export class GradebookCellResponseDto {
  assessmentId!: string;
  itemId!: string | null;
  score!: number | null;
  status!: string;
  percent!: number | null;
  weightedContribution!: number | null;
  comment!: string | null;
  isVirtualMissing!: boolean;
}

export class GradebookRowResponseDto {
  studentId!: string;
  enrollmentId!: string;
  student!: GradebookStudentResponseDto;
  finalPercent!: number | null;
  completedWeight!: number;
  status!: string;
  totalEnteredCount!: number;
  missingCount!: number;
  absentCount!: number;
  cells!: GradebookCellResponseDto[];
}

export class GradebookSummaryResponseDto {
  studentCount!: number;
  assessmentCount!: number;
  averagePercent!: number | null;
  passingCount!: number;
  failingCount!: number;
  incompleteCount!: number;
}

export class GradebookResponseDto {
  academicYearId!: string;
  yearId!: string;
  termId!: string;
  subjectId!: string | null;
  scope!: GradebookScopeResponseDto;
  rule!: GradebookRuleResponseDto;
  columns!: GradebookColumnResponseDto[];
  rows!: GradebookRowResponseDto[];
  summary!: GradebookSummaryResponseDto;
}
