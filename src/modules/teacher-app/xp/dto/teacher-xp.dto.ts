import { Type } from 'class-transformer';
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

export enum TeacherXpHistorySourceQueryValue {
  REINFORCEMENT_TASK = 'reinforcement_task',
  HERO_MISSION = 'hero_mission',
  MANUAL_BONUS = 'manual_bonus',
  BEHAVIOR = 'behavior',
  GRADE = 'grade',
  ATTENDANCE = 'attendance',
  SYSTEM = 'system',
}

export class TeacherXpClassParamsDto {
  @IsUUID()
  classId!: string;
}

export class TeacherXpStudentParamsDto {
  @IsUUID()
  studentId!: string;
}

export class TeacherXpHistoryQueryDto {
  @IsOptional()
  @IsEnum(TeacherXpHistorySourceQueryValue)
  source?: TeacherXpHistorySourceQueryValue;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;

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

export class TeacherXpActivityDto {
  xpId!: string;
  studentId!: string;
  studentName!: string;
  amount!: number;
  sourceType!: string;
  sourceId!: string;
  reason!: string | null;
  occurredAt!: string;
}

export class TeacherXpTopStudentDto {
  studentId!: string;
  displayName!: string;
  totalXp!: number;
}

export class TeacherXpSummaryDto {
  studentsCount!: number;
  totalXp!: number;
  averageXp!: number;
  topStudent!: TeacherXpTopStudentDto | null;
  recentActivityCount!: number;
}

export class TeacherXpClassSummaryDto {
  classId!: string;
  className!: string;
  subjectName!: string;
  studentsCount!: number;
  totalXp!: number;
  averageXp!: number;
  topStudent!: TeacherXpTopStudentDto | null;
}

export class TeacherXpDashboardResponseDto {
  summary!: TeacherXpSummaryDto;
  byClass!: TeacherXpClassSummaryDto[];
  recentActivity!: TeacherXpActivityDto[];
}

export class TeacherXpStudentListItemDto {
  studentId!: string;
  displayName!: string;
  totalXp!: number;
  rank!: null;
  tier!: null;
  level!: null;
  recentActivityCount!: number;
}

export class TeacherXpClassResponseDto {
  classId!: string;
  className!: string;
  subjectName!: string;
  students!: TeacherXpStudentListItemDto[];
  summary!: TeacherXpClassSummaryDto;
}

export class TeacherXpStudentResponseDto {
  studentId!: string;
  displayName!: string;
  totalXp!: number;
  rank!: null;
  tier!: null;
  level!: null;
  recentActivity!: TeacherXpActivityDto[];
}

export class TeacherXpHistoryPaginationDto {
  page!: number;
  limit!: number;
  total!: number;
}

export class TeacherXpHistoryResponseDto {
  studentId!: string;
  items!: TeacherXpActivityDto[];
  pagination!: TeacherXpHistoryPaginationDto;
}
