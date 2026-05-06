import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export const STUDENT_BEHAVIOR_RECORD_TYPES = ['positive', 'negative'] as const;
export const STUDENT_BEHAVIOR_VISIBLE_STATUSES = ['approved'] as const;

export type StudentBehaviorRecordType =
  (typeof STUDENT_BEHAVIOR_RECORD_TYPES)[number];
export type StudentBehaviorVisibleStatus =
  (typeof STUDENT_BEHAVIOR_VISIBLE_STATUSES)[number];

function toLowerOptionalString(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class StudentBehaviorQueryDto {
  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(STUDENT_BEHAVIOR_RECORD_TYPES)
  type?: StudentBehaviorRecordType;

  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(STUDENT_BEHAVIOR_VISIBLE_STATUSES)
  status?: StudentBehaviorVisibleStatus;

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

export class StudentBehaviorAttendanceSummaryDto {
  attendanceCount!: number;
  absenceCount!: number;
  latenessCount!: number;
  attendance_count!: number;
  absence_count!: number;
  lateness_count!: number;
  dateText!: string;
  date_text!: string;
}

export class StudentBehaviorPointSummaryDto {
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

export class StudentBehaviorSummaryDto extends StudentBehaviorAttendanceSummaryDto {
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

export class StudentBehaviorCategoryDto {
  categoryId!: string;
  code!: string;
  name!: string | null;
  type!: StudentBehaviorRecordType;
}

export class StudentBehaviorRecordDto {
  id!: string;
  type!: StudentBehaviorRecordType;
  title!: string | null;
  date!: string;
  occurredAt!: string;
  occurred_at!: string;
  points!: number;
  note!: string | null;
  status!: StudentBehaviorVisibleStatus;
  category!: StudentBehaviorCategoryDto | null;
}

export class StudentBehaviorVisibilityDto {
  status!: StudentBehaviorVisibleStatus;
  reason!: string;
}

export class StudentBehaviorPaginationDto {
  page!: number;
  limit!: number;
  total!: number;
}

export class StudentBehaviorListResponseDto {
  summary!: StudentBehaviorSummaryDto;
  records!: StudentBehaviorRecordDto[];
  pagination!: StudentBehaviorPaginationDto;
  visibility!: StudentBehaviorVisibilityDto;
}

export class StudentBehaviorSummaryResponseDto {
  summary!: StudentBehaviorSummaryDto;
  visibility!: StudentBehaviorVisibilityDto;
}

export class StudentBehaviorRecordResponseDto extends StudentBehaviorRecordDto {}
