import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export const DISCIPLINE_SOURCE_TYPES = ['attendance', 'behavior'] as const;
export const DISCIPLINE_ITEM_TYPES = [
  'absence',
  'lateness',
  'early_leave',
  'excused',
  'positive',
  'negative',
] as const;
export const DISCIPLINE_SEVERITIES = [
  'info',
  'low',
  'medium',
  'high',
  'critical',
] as const;
export const DISCIPLINE_STATUSES = [
  'submitted',
  'excused',
  'approved',
] as const;

export type DisciplineSourceType = (typeof DISCIPLINE_SOURCE_TYPES)[number];
export type DisciplineItemType = (typeof DISCIPLINE_ITEM_TYPES)[number];
export type DisciplineSeverity = (typeof DISCIPLINE_SEVERITIES)[number];
export type DisciplineStatus = (typeof DISCIPLINE_STATUSES)[number];

function toLowerOptionalString(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class DisciplineDerivedQueryDto {
  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(DISCIPLINE_SOURCE_TYPES)
  sourceType?: DisciplineSourceType;

  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(DISCIPLINE_ITEM_TYPES)
  itemType?: DisciplineItemType;

  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(DISCIPLINE_ITEM_TYPES)
  type?: DisciplineItemType;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

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

export class DisciplineTimelineCategoryDto {
  id!: string;
  code!: string;
  nameAr!: string | null;
  nameEn!: string | null;
  name_ar!: string | null;
  name_en!: string | null;
  type!: 'positive' | 'negative' | null;
}

export class DisciplineTimelineAttendanceDto {
  status!: 'absent' | 'late' | 'early_leave' | 'excused';
  lateMinutes!: number | null;
  minutesLate!: number | null;
  earlyLeaveMinutes!: number | null;
  minutesEarlyLeave!: number | null;
  excuseReason!: string | null;
}

export class DisciplineTimelineItemDto {
  id!: string;
  sourceType!: DisciplineSourceType;
  source_type!: DisciplineSourceType;
  itemType!: DisciplineItemType;
  item_type!: DisciplineItemType;
  occurredAt!: string;
  occurred_at!: string;
  date!: string;
  title!: string;
  description!: string | null;
  severity!: DisciplineSeverity | null;
  pointsDelta!: number;
  points_delta!: number;
  status!: DisciplineStatus;
  category!: DisciplineTimelineCategoryDto | null;
  attendance!: DisciplineTimelineAttendanceDto | null;
}

export class DisciplineTimelinePaginationDto {
  page!: number;
  limit!: number;
  total!: number;
}

export class DisciplineSummaryDto {
  totalIncidents!: number;
  attendanceIncidentCount!: number;
  absenceCount!: number;
  lateCount!: number;
  earlyLeaveCount!: number;
  excusedCount!: number;
  positiveCount!: number;
  negativeCount!: number;
  behaviorPoints!: number;
  period!: string;
  dateText!: string;
  total_incidents!: number;
  attendance_incident_count!: number;
  absence_count!: number;
  late_count!: number;
  early_leave_count!: number;
  excused_count!: number;
  positive_count!: number;
  negative_count!: number;
  behavior_points!: number;
  date_text!: string;
}

export class DisciplineTimelineListResponseDto {
  items!: DisciplineTimelineItemDto[];
  summary!: DisciplineSummaryDto;
  pagination!: DisciplineTimelinePaginationDto;
}

export class DisciplineSummaryResponseDto {
  summary!: DisciplineSummaryDto;
}

export class DisciplineChildDto {
  studentId!: string;
  enrollmentId!: string;
  student_id!: string;
  enrollment_id!: string;
}

export class ParentDisciplineTimelineListResponseDto extends DisciplineTimelineListResponseDto {
  child!: DisciplineChildDto;
}

export class ParentDisciplineSummaryResponseDto extends DisciplineSummaryResponseDto {
  child!: DisciplineChildDto;
}
