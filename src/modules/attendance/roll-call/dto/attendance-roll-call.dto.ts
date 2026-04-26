import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  AttendanceMode,
  AttendanceScopeType,
  AttendanceSessionStatus,
  AttendanceStatus,
} from '@prisma/client';

export class AttendanceRollCallScopeIdsResponseDto {
  stageId!: string | null;
  gradeId!: string | null;
  sectionId!: string | null;
  classroomId!: string | null;
}

export class AttendanceRollCallScopeQueryDto {
  @IsEnum(AttendanceScopeType)
  scopeType!: AttendanceScopeType;

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
}

export class RollCallRosterQueryDto extends AttendanceRollCallScopeQueryDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  yearId?: string;

  @IsUUID()
  termId!: string;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsEnum(AttendanceMode)
  mode?: AttendanceMode;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  periodKey?: string;
}

export class ResolveRollCallSessionDto extends AttendanceRollCallScopeQueryDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  yearId?: string;

  @IsUUID()
  termId!: string;

  @IsDateString()
  date!: string;

  @IsEnum(AttendanceMode)
  mode!: AttendanceMode;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  periodKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  periodId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  periodLabelAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  periodLabelEn?: string;
}

export class ListRollCallSessionsQueryDto {
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
  @IsEnum(AttendanceSessionStatus)
  status?: AttendanceSessionStatus;

  @IsOptional()
  @IsEnum(AttendanceMode)
  mode?: AttendanceMode;
}

export class SaveRollCallEntryDto {
  @IsUUID()
  studentId!: string;

  @IsOptional()
  @IsUUID()
  enrollmentId?: string | null;

  @IsEnum(AttendanceStatus)
  status!: AttendanceStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  lateMinutes?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  earlyLeaveMinutes?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  excuseReason?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}

export class SaveRollCallEntriesDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => SaveRollCallEntryDto)
  entries!: SaveRollCallEntryDto[];
}

export class UpsertRollCallEntryDto {
  @IsOptional()
  @IsUUID()
  enrollmentId?: string | null;

  @IsEnum(AttendanceStatus)
  status!: AttendanceStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  lateMinutes?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  earlyLeaveMinutes?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  excuseReason?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}

export class AttendanceRollCallPlacementResponseDto {
  id!: string;
  name!: string;
  nameAr!: string;
  nameEn!: string;
}

export class AttendanceRollCallStudentResponseDto {
  id!: string;
  studentId!: string;
  name!: string;
  firstName!: string;
  lastName!: string;
  fullNameEn!: string;
  studentNumber!: string | null;
  photoUrl!: string | null;
  classroom!: AttendanceRollCallPlacementResponseDto | null;
  section!: AttendanceRollCallPlacementResponseDto | null;
  grade!: AttendanceRollCallPlacementResponseDto | null;
  stage!: AttendanceRollCallPlacementResponseDto | null;
}

export class AttendanceRollCallEntryResponseDto {
  id!: string;
  sessionId!: string;
  studentId!: string;
  enrollmentId!: string | null;
  status!: AttendanceStatus;
  lateMinutes!: number | null;
  minutesLate!: number | null;
  earlyLeaveMinutes!: number | null;
  minutesEarlyLeave!: number | null;
  excuseReason!: string | null;
  note!: string | null;
  markedById!: string | null;
  markedAt!: string | null;
  student!: AttendanceRollCallStudentResponseDto | null;
  createdAt!: string;
  updatedAt!: string;
}

export class AttendanceRollCallSessionSummaryResponseDto {
  id!: string;
  academicYearId!: string;
  yearId!: string;
  termId!: string;
  date!: string;
  scopeType!: AttendanceScopeType;
  scopeKey!: string;
  scopeIds!: AttendanceRollCallScopeIdsResponseDto | null;
  mode!: AttendanceMode;
  periodId!: string | null;
  periodKey!: string;
  periodLabelAr!: string | null;
  periodLabelEn!: string | null;
  policyId!: string | null;
  status!: AttendanceSessionStatus;
  submittedAt!: string | null;
  submittedById!: string | null;
  createdAt!: string;
  updatedAt!: string;
}

export class AttendanceRollCallRosterRowResponseDto extends AttendanceRollCallStudentResponseDto {
  enrollmentId!: string;
  currentStatus!: AttendanceStatus | null;
  entryId!: string | null;
  lateMinutes!: number | null;
  earlyLeaveMinutes!: number | null;
  excuseReason!: string | null;
  note!: string | null;
}

export class RollCallRosterResponseDto {
  session!: AttendanceRollCallSessionSummaryResponseDto | null;
  items!: AttendanceRollCallRosterRowResponseDto[];
}

export class RollCallSessionResponseDto {
  session!: AttendanceRollCallSessionSummaryResponseDto;
  entries!: AttendanceRollCallEntryResponseDto[];
}

export class RollCallSessionsListResponseDto {
  items!: AttendanceRollCallSessionSummaryResponseDto[];
}

export class SaveRollCallEntriesResponseDto {
  session!: AttendanceRollCallSessionSummaryResponseDto;
  entries!: AttendanceRollCallEntryResponseDto[];
}
