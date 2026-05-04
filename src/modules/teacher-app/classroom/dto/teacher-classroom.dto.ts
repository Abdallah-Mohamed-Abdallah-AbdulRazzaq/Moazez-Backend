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

export class TeacherClassroomParamsDto {
  @IsUUID()
  classId!: string;
}

export class ListTeacherClassroomRosterQueryDto {
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

export class TeacherClassroomReferenceDto {
  id!: string;
  name!: string;
  code!: string | null;
}

export class TeacherClassroomSubjectDto {
  id!: string;
  name!: string;
}

export class TeacherClassroomTermDto {
  id!: string;
  name!: string;
}

export class TeacherClassroomAcademicHierarchyDto {
  stageName!: string;
  gradeName!: string;
  sectionName!: string;
}

export class TeacherClassroomSummaryDto {
  studentsCount!: number;
  presentTodayCount!: number | null;
  absentTodayCount!: number | null;
  pendingAssignmentsCount!: number | null;
  averageGrade!: number | null;
  behaviorAlertsCount!: number | null;
}

export class TeacherClassroomScheduleDto {
  available!: false;
  reason!: 'timetable_not_available';
}

export class TeacherClassroomDetailResponseDto {
  classId!: string;
  classroom!: TeacherClassroomReferenceDto;
  subject!: TeacherClassroomSubjectDto;
  term!: TeacherClassroomTermDto;
  academicHierarchy!: TeacherClassroomAcademicHierarchyDto;
  summary!: TeacherClassroomSummaryDto;
  schedule!: TeacherClassroomScheduleDto;
}

export class TeacherClassroomRosterStudentDto {
  id!: string;
  displayName!: string;
  studentNumber!: string | null;
  avatarUrl!: string | null;
  status!: 'active';
  attendanceToday!: null;
  latestGrade!: null;
  behaviorSummary!: null;
}

export class TeacherClassroomRosterPaginationDto {
  page!: number;
  limit!: number;
  total!: number;
}

export class TeacherClassroomRosterResponseDto {
  classId!: string;
  students!: TeacherClassroomRosterStudentDto[];
  pagination!: TeacherClassroomRosterPaginationDto;
}
