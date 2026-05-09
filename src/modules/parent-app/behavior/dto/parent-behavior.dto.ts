import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export const PARENT_BEHAVIOR_RECORD_TYPES = ['positive', 'negative'] as const;
export const PARENT_BEHAVIOR_VISIBLE_STATUSES = ['approved'] as const;

export type ParentBehaviorRecordType =
  (typeof PARENT_BEHAVIOR_RECORD_TYPES)[number];
export type ParentBehaviorVisibleStatus =
  (typeof PARENT_BEHAVIOR_VISIBLE_STATUSES)[number];

function toLowerOptionalString(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class ParentBehaviorQueryDto {
  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(PARENT_BEHAVIOR_RECORD_TYPES)
  type?: ParentBehaviorRecordType;

  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(PARENT_BEHAVIOR_VISIBLE_STATUSES)
  status?: ParentBehaviorVisibleStatus;

  @IsOptional()
  @IsDateString()
  occurredFrom?: string;

  @IsOptional()
  @IsDateString()
  occurredTo?: string;

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

export class ParentBehaviorChildDto {
  studentId!: string;
  enrollmentId!: string;
  student_id!: string;
  enrollment_id!: string;
}

export class ParentBehaviorAttendanceSummaryDto {
  attendanceCount!: number;
  absenceCount!: number;
  latenessCount!: number;
  attendance_count!: number;
  absence_count!: number;
  lateness_count!: number;
  dateText!: string;
  date_text!: string;
}

export class ParentBehaviorPointSummaryDto {
  positiveCount!: number;
  negativeCount!: number;
  positivePoints!: number;
  negativePoints!: number;
  totalBehaviorPoints!: number;
  positive_count!: number;
  negative_count!: number;
  positive_points!: number;
  negative_points!: number;
  total_behavior_points!: number;
}

export class ParentBehaviorSummaryDto extends ParentBehaviorAttendanceSummaryDto {
  positiveCount!: number;
  negativeCount!: number;
  positivePoints!: number;
  negativePoints!: number;
  totalBehaviorPoints!: number;
  positive_count!: number;
  negative_count!: number;
  positive_points!: number;
  negative_points!: number;
  total_behavior_points!: number;
}

export class ParentBehaviorCategoryDto {
  categoryId!: string;
  code!: string;
  name!: string | null;
  type!: ParentBehaviorRecordType;
}

export class ParentBehaviorRecordDto {
  id!: string;
  type!: ParentBehaviorRecordType;
  title!: string | null;
  date!: string;
  occurredAt!: string;
  occurred_at!: string;
  points!: number;
  note!: string | null;
  status!: ParentBehaviorVisibleStatus;
  category!: ParentBehaviorCategoryDto | null;
}

export class ParentBehaviorVisibilityDto {
  status!: ParentBehaviorVisibleStatus;
  reason!: 'approved_records_only';
}

export class ParentBehaviorPaginationDto {
  page!: number;
  limit!: number;
  total!: number;
}

export class ParentBehaviorListResponseDto {
  child!: ParentBehaviorChildDto;
  summary!: ParentBehaviorSummaryDto;
  records!: ParentBehaviorRecordDto[];
  pagination!: ParentBehaviorPaginationDto;
  visibility!: ParentBehaviorVisibilityDto;
}

export class ParentBehaviorSummaryResponseDto {
  child!: ParentBehaviorChildDto;
  summary!: ParentBehaviorSummaryDto;
  visibility!: ParentBehaviorVisibilityDto;
}

export class ParentBehaviorRecordResponseDto extends ParentBehaviorRecordDto {
  child!: ParentBehaviorChildDto;
  visibility!: ParentBehaviorVisibilityDto;
}
