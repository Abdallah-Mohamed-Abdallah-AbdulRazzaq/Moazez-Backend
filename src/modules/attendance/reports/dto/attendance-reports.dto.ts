import { AttendanceMode, AttendanceScopeType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { AttendanceReportScopeGroupBy } from '../domain/attendance-report';

export class AttendanceReportBaseQueryDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  yearId?: string;

  @IsOptional()
  @IsUUID()
  termId?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsEnum(AttendanceScopeType)
  scopeType?: AttendanceScopeType;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  scopeKey?: string;

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
  @IsEnum(AttendanceMode)
  mode?: AttendanceMode;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  periodKey?: string;
}

export class AttendanceSummaryReportQueryDto extends AttendanceReportBaseQueryDto {}

export class AttendanceDailyTrendReportQueryDto extends AttendanceReportBaseQueryDto {}

export class AttendanceScopeBreakdownReportQueryDto extends AttendanceReportBaseQueryDto {
  @IsEnum(AttendanceReportScopeGroupBy)
  groupBy!: AttendanceReportScopeGroupBy;
}

export class AttendanceSummaryReportResponseDto {
  totalSessions!: number;
  totalEntries!: number;
  presentCount!: number;
  absentCount!: number;
  lateCount!: number;
  earlyLeaveCount!: number;
  excusedCount!: number;
  unmarkedCount!: number;
  incidentCount!: number;
  attendanceRate!: number;
  absenceRate!: number;
  lateRate!: number;
  affectedStudentsCount!: number;
}

export class AttendanceDailyTrendReportRowResponseDto {
  date!: string;
  totalEntries!: number;
  presentCount!: number;
  absentCount!: number;
  lateCount!: number;
  earlyLeaveCount!: number;
  excusedCount!: number;
  attendanceRate!: number;
  incidentCount!: number;
}

export class AttendanceDailyTrendReportResponseDto {
  items!: AttendanceDailyTrendReportRowResponseDto[];
}

export class AttendanceScopeBreakdownReportRowResponseDto {
  scopeType!: AttendanceReportScopeGroupBy;
  scopeId!: string;
  scopeNameAr!: string;
  scopeNameEn!: string;
  totalEntries!: number;
  presentCount!: number;
  absentCount!: number;
  lateCount!: number;
  earlyLeaveCount!: number;
  excusedCount!: number;
  attendanceRate!: number;
  incidentCount!: number;
}

export class AttendanceScopeBreakdownReportResponseDto {
  items!: AttendanceScopeBreakdownReportRowResponseDto[];
}
