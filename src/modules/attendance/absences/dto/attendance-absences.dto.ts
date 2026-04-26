import {
  AttendanceMode,
  AttendanceScopeType,
  AttendanceStatus,
} from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class ListAttendanceAbsencesQueryDto {
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
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsEnum(AttendanceStatus)
  status?: AttendanceStatus;
}

export class AttendanceAbsenceSummaryQueryDto extends ListAttendanceAbsencesQueryDto {}

export class AttendanceAbsenceScopeIdsResponseDto {
  stageId!: string | null;
  gradeId!: string | null;
  sectionId!: string | null;
  classroomId!: string | null;
}

export class AttendanceAbsencePlacementResponseDto {
  id!: string;
  name!: string;
  nameAr!: string;
  nameEn!: string;
}

export class AttendanceAbsenceStudentResponseDto {
  id!: string;
  studentId!: string;
  name!: string;
  firstName!: string;
  lastName!: string;
  fullNameEn!: string;
  studentNumber!: string | null;
  photoUrl!: string | null;
}

export class AttendanceAbsenceIncidentResponseDto {
  id!: string;
  incidentId!: string;
  sessionId!: string;
  sourceSessionId!: string;
  entryId!: string;
  academicYearId!: string;
  yearId!: string;
  termId!: string;
  studentId!: string;
  enrollmentId!: string | null;
  student!: AttendanceAbsenceStudentResponseDto;
  studentName!: string;
  studentNameEn!: string;
  studentNumber!: string | null;
  photoUrl!: string | null;
  date!: string;
  status!: AttendanceStatus;
  lateMinutes!: number | null;
  minutesLate!: number | null;
  earlyLeaveMinutes!: number | null;
  minutesEarlyLeave!: number | null;
  excuseReason!: string | null;
  note!: string | null;
  scopeType!: AttendanceScopeType;
  scopeKey!: string;
  scopeIds!: AttendanceAbsenceScopeIdsResponseDto | null;
  stageId!: string | null;
  gradeId!: string | null;
  sectionId!: string | null;
  classroomId!: string | null;
  stage!: AttendanceAbsencePlacementResponseDto | null;
  grade!: AttendanceAbsencePlacementResponseDto | null;
  section!: AttendanceAbsencePlacementResponseDto | null;
  classroom!: AttendanceAbsencePlacementResponseDto | null;
  stageNameAr!: string | null;
  stageNameEn!: string | null;
  gradeNameAr!: string | null;
  gradeNameEn!: string | null;
  sectionNameAr!: string | null;
  sectionNameEn!: string | null;
  classroomNameAr!: string | null;
  classroomNameEn!: string | null;
  mode!: AttendanceMode;
  periodId!: string | null;
  periodKey!: string;
  periodLabelAr!: string | null;
  periodLabelEn!: string | null;
  periodNameAr!: string | null;
  periodNameEn!: string | null;
  submittedAt!: string | null;
  createdAt!: string;
  updatedAt!: string;
}

export class AttendanceAbsencesListResponseDto {
  items!: AttendanceAbsenceIncidentResponseDto[];
}

export class AttendanceAbsenceSummaryResponseDto {
  totalIncidents!: number;
  absentCount!: number;
  lateCount!: number;
  earlyLeaveCount!: number;
  excusedCount!: number;
  affectedStudentsCount!: number;
}
