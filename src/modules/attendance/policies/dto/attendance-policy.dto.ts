import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
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
  DailyComputationStrategy,
} from '@prisma/client';

function toOptionalBoolean(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return value;
}

export class AttendancePolicyScopeIdsDto {
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

export class CreateAttendancePolicyDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  yearId?: string;

  @IsUUID()
  termId!: string;

  @IsString()
  @MaxLength(200)
  nameAr!: string;

  @IsString()
  @MaxLength(200)
  nameEn!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  descriptionAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  descriptionEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notesAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notesEn?: string;

  @IsEnum(AttendanceScopeType)
  scopeType!: AttendanceScopeType;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  scopeKey?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AttendancePolicyScopeIdsDto)
  scopeIds?: AttendancePolicyScopeIdsDto;

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

  @IsEnum(AttendanceMode)
  mode!: AttendanceMode;

  @IsOptional()
  @IsEnum(DailyComputationStrategy)
  dailyComputationStrategy?: DailyComputationStrategy;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedPeriodIds?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  lateThresholdMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  earlyLeaveThresholdMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  autoAbsentAfterMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  absentIfMissedPeriodsCount?: number;

  @IsOptional()
  @IsBoolean()
  requireExcuseAttachment?: boolean;

  @IsOptional()
  @IsBoolean()
  requireAttachmentForExcuse?: boolean;

  @IsOptional()
  @IsBoolean()
  requireExcuseReason?: boolean;

  @IsOptional()
  @IsBoolean()
  allowParentExcuseRequests?: boolean;

  @IsOptional()
  @IsBoolean()
  allowExcuses?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyGuardiansOnAbsence?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyTeachers?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyStudents?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyGuardians?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyOnAbsent?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyOnLate?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyOnEarlyLeave?: boolean;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  effectiveStartDate?: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @IsOptional()
  @IsDateString()
  effectiveEndDate?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateAttendancePolicyDto {
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
  @IsString()
  @MaxLength(200)
  nameAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  descriptionAr?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  descriptionEn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notesAr?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notesEn?: string | null;

  @IsOptional()
  @IsEnum(AttendanceScopeType)
  scopeType?: AttendanceScopeType;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  scopeKey?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AttendancePolicyScopeIdsDto)
  scopeIds?: AttendancePolicyScopeIdsDto;

  @IsOptional()
  @IsUUID()
  stageId?: string | null;

  @IsOptional()
  @IsUUID()
  gradeId?: string | null;

  @IsOptional()
  @IsUUID()
  sectionId?: string | null;

  @IsOptional()
  @IsUUID()
  classroomId?: string | null;

  @IsOptional()
  @IsEnum(AttendanceMode)
  mode?: AttendanceMode;

  @IsOptional()
  @IsEnum(DailyComputationStrategy)
  dailyComputationStrategy?: DailyComputationStrategy;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedPeriodIds?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  lateThresholdMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  earlyLeaveThresholdMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  autoAbsentAfterMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  absentIfMissedPeriodsCount?: number;

  @IsOptional()
  @IsBoolean()
  requireExcuseAttachment?: boolean;

  @IsOptional()
  @IsBoolean()
  requireAttachmentForExcuse?: boolean;

  @IsOptional()
  @IsBoolean()
  requireExcuseReason?: boolean;

  @IsOptional()
  @IsBoolean()
  allowParentExcuseRequests?: boolean;

  @IsOptional()
  @IsBoolean()
  allowExcuses?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyGuardiansOnAbsence?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyTeachers?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyStudents?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyGuardians?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyOnAbsent?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyOnLate?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyOnEarlyLeave?: boolean;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string | null;

  @IsOptional()
  @IsDateString()
  effectiveStartDate?: string | null;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string | null;

  @IsOptional()
  @IsDateString()
  effectiveEndDate?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListAttendancePoliciesQueryDto {
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
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  isActive?: boolean;
}

export class EffectiveAttendancePolicyQueryDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  yearId?: string;

  @IsUUID()
  termId!: string;

  @IsOptional()
  @IsEnum(AttendanceScopeType)
  scopeType?: AttendanceScopeType;

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
  @IsDateString()
  date?: string;
}

export class ValidateAttendancePolicyNameQueryDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  yearId?: string;

  @IsUUID()
  termId!: string;

  @IsEnum(AttendanceScopeType)
  scopeType!: AttendanceScopeType;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  scopeKey?: string;

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
  nameAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameEn?: string;

  @IsOptional()
  @IsUUID()
  excludeId?: string;
}

export class AttendancePolicyScopeIdsResponseDto {
  stageId!: string | null;
  gradeId!: string | null;
  sectionId!: string | null;
  classroomId!: string | null;
}

export class AttendancePolicyResponseDto {
  id!: string;
  academicYearId!: string;
  yearId!: string;
  termId!: string;
  nameAr!: string;
  nameEn!: string;
  descriptionAr!: string | null;
  descriptionEn!: string | null;
  notes!: string | null;
  scopeType!: AttendanceScopeType;
  scopeKey!: string;
  scopeIds!: AttendancePolicyScopeIdsResponseDto | null;
  mode!: AttendanceMode;
  dailyComputationStrategy!: DailyComputationStrategy;
  selectedPeriodIds!: string[];
  lateThresholdMinutes!: number | null;
  earlyLeaveThresholdMinutes!: number | null;
  autoAbsentAfterMinutes!: number | null;
  absentIfMissedPeriodsCount!: number | null;
  requireExcuseAttachment!: boolean;
  requireAttachmentForExcuse!: boolean;
  requireExcuseReason!: boolean;
  allowParentExcuseRequests!: boolean;
  allowExcuses!: boolean;
  notifyGuardiansOnAbsence!: boolean;
  notifyTeachers!: boolean;
  notifyStudents!: boolean;
  notifyGuardians!: boolean;
  notifyOnAbsent!: boolean;
  notifyOnLate!: boolean;
  notifyOnEarlyLeave!: boolean;
  effectiveFrom!: string | null;
  effectiveTo!: string | null;
  effectiveStartDate!: string | null;
  effectiveEndDate!: string | null;
  isActive!: boolean;
  createdAt!: string;
  updatedAt!: string;
}

export class AttendancePoliciesListResponseDto {
  items!: AttendancePolicyResponseDto[];
}

export class DeleteAttendancePolicyResponseDto {
  ok!: true;
}

export class EffectiveAttendancePolicyResponseDto {
  policy!: AttendancePolicyResponseDto | null;
  requestedScope!: {
    scopeType: AttendanceScopeType;
    scopeKey: string;
  };
  matchedScope!: {
    scopeType: AttendanceScopeType;
    scopeKey: string;
    priority: number;
  } | null;
}

export class ValidateAttendancePolicyNameResponseDto {
  uniqueAr!: boolean;
  uniqueEn!: boolean;
  available!: boolean;
}
