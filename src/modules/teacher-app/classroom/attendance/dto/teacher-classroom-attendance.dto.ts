import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const TEACHER_CLASSROOM_ATTENDANCE_WRITE_STATUSES = [
  'present',
  'absent',
  'late',
  'excused',
] as const;

export const TEACHER_CLASSROOM_ATTENDANCE_READ_STATUSES = [
  ...TEACHER_CLASSROOM_ATTENDANCE_WRITE_STATUSES,
  'early_leave',
  'unmarked',
] as const;

export type TeacherClassroomAttendanceWriteStatus =
  (typeof TEACHER_CLASSROOM_ATTENDANCE_WRITE_STATUSES)[number];

export type TeacherClassroomAttendanceStatus =
  (typeof TEACHER_CLASSROOM_ATTENDANCE_READ_STATUSES)[number];

export type TeacherClassroomAttendanceSessionStatus = 'draft' | 'submitted';

export class TeacherClassroomAttendanceParamsDto {
  @IsUUID()
  classId!: string;
}

export class TeacherClassroomAttendanceSessionParamsDto extends TeacherClassroomAttendanceParamsDto {
  @IsUUID()
  sessionId!: string;
}

export class GetTeacherClassroomAttendanceRosterQueryDto {
  @IsDateString()
  date!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
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

export class ResolveTeacherClassroomAttendanceSessionDto {
  @IsDateString()
  date!: string;
}

export class UpdateTeacherClassroomAttendanceEntryDto {
  @IsUUID()
  studentId!: string;

  @IsIn(TEACHER_CLASSROOM_ATTENDANCE_WRITE_STATUSES)
  status!: TeacherClassroomAttendanceWriteStatus;

  @IsOptional()
  @IsDateString()
  arrivalTime?: string | null;

  @IsOptional()
  @IsDateString()
  dismissalTime?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}

export class UpdateTeacherClassroomAttendanceEntriesDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => UpdateTeacherClassroomAttendanceEntryDto)
  entries!: UpdateTeacherClassroomAttendanceEntryDto[];
}

export class TeacherClassroomAttendanceSessionDto {
  id!: string;
  status!: TeacherClassroomAttendanceSessionStatus;
  submittedAt!: string | null;
}

export class TeacherClassroomAttendanceRosterStudentDto {
  id!: string;
  displayName!: string;
  status!: 'active';
  attendanceStatus!: TeacherClassroomAttendanceStatus;
  arrivalTime!: string | null;
  dismissalTime!: string | null;
  lateMinutes!: number | null;
  earlyLeaveMinutes!: number | null;
  excuseReason!: string | null;
  note!: string | null;
}

export class TeacherClassroomAttendancePaginationDto {
  page!: number;
  limit!: number;
  total!: number;
}

export class TeacherClassroomAttendanceRosterResponseDto {
  classId!: string;
  date!: string;
  session!: TeacherClassroomAttendanceSessionDto | null;
  students!: TeacherClassroomAttendanceRosterStudentDto[];
  pagination!: TeacherClassroomAttendancePaginationDto;
}

export class TeacherClassroomAttendanceEntryResponseDto {
  id!: string;
  studentId!: string;
  displayName!: string | null;
  attendanceStatus!: TeacherClassroomAttendanceStatus;
  arrivalTime!: string | null;
  dismissalTime!: string | null;
  lateMinutes!: number | null;
  earlyLeaveMinutes!: number | null;
  excuseReason!: string | null;
  note!: string | null;
  markedAt!: string | null;
}

export class TeacherClassroomAttendanceSessionResponseDto {
  classId!: string;
  date!: string;
  session!: TeacherClassroomAttendanceSessionDto;
  entries!: TeacherClassroomAttendanceEntryResponseDto[];
}

export class TeacherClassroomAttendanceTodaySessionDto extends TeacherClassroomAttendanceSessionDto {
  mode!: 'daily';
}

export class TeacherClassroomAttendanceSummaryDto {
  totalCount!: number;
  presentCount!: number;
  absentCount!: number;
  lateCount!: number;
  excusedCount!: number;
  earlyLeaveCount!: number;
  unmarkedCount!: number;
  markedCount!: number;
}

export class TeacherClassroomAttendanceTodayResponseDto {
  classId!: string;
  date!: string;
  session!: TeacherClassroomAttendanceTodaySessionDto | null;
  summary!: TeacherClassroomAttendanceSummaryDto;
  students!: TeacherClassroomAttendanceRosterStudentDto[];
}
