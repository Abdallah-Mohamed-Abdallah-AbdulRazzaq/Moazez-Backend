import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListTeacherClassesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsUUID()
  termId?: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @IsUUID()
  classroomId?: string;

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

export class TeacherClassMetricsDto {
  studentsCount!: number;
  activeAssignmentsCount!: number | null;
  pendingReviewCount!: number | null;
  followUpCount!: number | null;
  pendingAttendanceCount!: number | null;
  todayAttendanceStatus!: string | null;
  lastAttendanceStatus!: string | null;
  averageGrade!: number | null;
  completionRate!: number | null;
}

export class TeacherClassResponseDto {
  id!: string;
  classId!: string;
  classroomId!: string;
  classroomName!: string;
  className!: string;
  subjectId!: string;
  subjectName!: string;
  termId!: string;
  termName!: string;
  gradeId!: string;
  gradeName!: string;
  sectionId!: string;
  sectionName!: string;
  stageId!: string;
  stageName!: string;
  cycleId!: string;
  cycleName!: string;
  roomName!: string | null;
  studentsCount!: number;
  activeAssignmentsCount!: number | null;
  pendingReviewCount!: number | null;
  followUpCount!: number | null;
  pendingAttendanceCount!: number | null;
  todayAttendanceStatus!: string | null;
  lastAttendanceStatus!: string | null;
  averageGrade!: number | null;
  completionRate!: number | null;
  needsPreparation!: boolean | null;
  note!: string | null;
}

export class TeacherClassesPaginationDto {
  page!: number;
  limit!: number;
  total!: number;
}

export class TeacherClassesListResponseDto {
  classes!: TeacherClassResponseDto[];
  pagination!: TeacherClassesPaginationDto;
}

export class TeacherClassDetailResponseDto {
  class!: TeacherClassResponseDto;
  metrics!: TeacherClassMetricsDto;
  rosterPreview!: [];
  attendanceSummary!: null;
  gradeSummary!: null;
  behaviorSummary!: null;
  reinforcementSummary!: null;
}
