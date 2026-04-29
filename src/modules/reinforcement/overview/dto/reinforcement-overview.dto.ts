import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class GetReinforcementOverviewQueryDto {
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
  @IsString()
  @MaxLength(32)
  source?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

export class GetStudentReinforcementProgressQueryDto {
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
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

export class GetClassroomReinforcementSummaryQueryDto extends GetStudentReinforcementProgressQueryDto {}

export class ReinforcementOverviewResponseDto {
  scope!: Record<string, unknown>;
  tasks!: Record<string, unknown>;
  assignments!: Record<string, unknown>;
  reviewQueue!: Record<string, unknown>;
  xp!: Record<string, unknown>;
  topStudents!: Array<Record<string, unknown>>;
  recentActivity!: Array<Record<string, unknown>>;
}

export class StudentReinforcementProgressResponseDto {
  student!: Record<string, unknown>;
  enrollment!: Record<string, unknown> | null;
  assignments!: Record<string, unknown>;
  tasks!: Array<Record<string, unknown>>;
  submissions!: Record<string, unknown>;
  xp!: Record<string, unknown>;
  recentReviews!: Array<Record<string, unknown>>;
}

export class ClassroomReinforcementSummaryResponseDto {
  classroom!: Record<string, unknown>;
  studentsCount!: number;
  assignments!: Record<string, unknown>;
  reviewQueue!: Record<string, unknown>;
  xp!: Record<string, unknown>;
  topStudents!: Array<Record<string, unknown>>;
  students!: Array<Record<string, unknown>>;
}
