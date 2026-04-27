import { Type } from 'class-transformer';
import {
  IsArray,
  ArrayNotEmpty,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { AttendanceExcuseStatus, AttendanceExcuseType } from '@prisma/client';

export class ListAttendanceExcuseRequestsQueryDto {
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
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsEnum(AttendanceExcuseStatus)
  status?: AttendanceExcuseStatus;

  @IsOptional()
  @IsEnum(AttendanceExcuseType)
  type?: AttendanceExcuseType;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class CreateAttendanceExcuseRequestDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  yearId?: string;

  @IsUUID()
  termId!: string;

  @IsUUID()
  studentId!: string;

  @IsEnum(AttendanceExcuseType)
  type!: AttendanceExcuseType;

  @IsDateString()
  dateFrom!: string;

  @IsDateString()
  dateTo!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  selectedPeriodKeys?: string[] | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  selectedPeriodIds?: string[] | null;

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
  reasonAr?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reasonEn?: string | null;
}

export class UpdateAttendanceExcuseRequestDto {
  @IsOptional()
  @IsEnum(AttendanceExcuseType)
  type?: AttendanceExcuseType;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  selectedPeriodKeys?: string[] | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  selectedPeriodIds?: string[] | null;

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
  reasonAr?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reasonEn?: string | null;
}

export class LinkAttendanceExcuseAttachmentsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID(undefined, { each: true })
  fileIds!: string[];
}

export class AttendanceExcuseAttachmentResponseDto {
  id!: string;
  fileId!: string;
  filename!: string;
  originalName!: string;
  mimeType!: string;
  sizeBytes!: string;
  createdAt!: string;
  downloadUrl!: string;
}

export class AttendanceExcuseAttachmentsListResponseDto {
  items!: AttendanceExcuseAttachmentResponseDto[];
}

export class AttendanceExcuseStudentResponseDto {
  id!: string;
  studentId!: string;
  name!: string;
  firstName!: string;
  lastName!: string;
  fullNameEn!: string;
  studentNumber!: string | null;
  photoUrl!: string | null;
}

export class AttendanceExcuseRequestResponseDto {
  id!: string;
  academicYearId!: string;
  yearId!: string;
  termId!: string;
  studentId!: string;
  student!: AttendanceExcuseStudentResponseDto | null;
  studentName!: string | null;
  studentNameAr!: string | null;
  studentNameEn!: string | null;
  studentNumber!: string | null;
  type!: AttendanceExcuseType;
  status!: AttendanceExcuseStatus;
  dateFrom!: string;
  dateTo!: string;
  selectedPeriodKeys!: string[];
  selectedPeriodIds!: string[];
  lateMinutes!: number | null;
  minutesLate!: number | null;
  earlyLeaveMinutes!: number | null;
  minutesEarlyLeave!: number | null;
  reasonAr!: string | null;
  reasonEn!: string | null;
  decisionNote!: string | null;
  decidedAt!: string | null;
  createdById!: string | null;
  decidedById!: string | null;
  linkedSessionIds!: string[];
  attachmentCount!: number;
  attachments?: AttendanceExcuseAttachmentResponseDto[];
  createdAt!: string;
  updatedAt!: string;
}

export class AttendanceExcuseRequestsListResponseDto {
  items!: AttendanceExcuseRequestResponseDto[];
}

export class DeleteAttendanceExcuseRequestResponseDto {
  ok!: true;
}
