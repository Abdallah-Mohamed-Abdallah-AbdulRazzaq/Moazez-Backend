import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { GradeAssessmentApprovalStatus } from '@prisma/client';

function toUpperEnumValue(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

export class GetGradesAnalyticsQueryDto {
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
  @Transform(({ value }) => toUpperEnumValue(value))
  @IsEnum(GradeAssessmentApprovalStatus)
  assessmentStatus?: GradeAssessmentApprovalStatus;
}

export class GetGradesDistributionQueryDto extends GetGradesAnalyticsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(50)
  bucketSize?: number = 10;
}

export class GradesAnalyticsSummaryResponseDto {
  studentCount!: number;
  assessmentCount!: number;
  enteredItemCount!: number;
  missingItemCount!: number;
  absentItemCount!: number;
  averagePercent!: number | null;
  highestPercent!: number | null;
  lowestPercent!: number | null;
  passingCount!: number;
  failingCount!: number;
  incompleteCount!: number;
  passRate!: number | null;
  completedWeightAverage!: number | null;
}

export class GradesDistributionBucketResponseDto {
  from!: number;
  to!: number;
  count!: number;
}

export class GradesDistributionResponseDto {
  buckets!: GradesDistributionBucketResponseDto[];
  incompleteCount!: number;
  totalStudents!: number;
}
