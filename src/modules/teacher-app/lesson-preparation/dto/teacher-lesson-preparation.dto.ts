import { IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const YYYY_MM_DD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class TeacherLessonPreparationDateQueryDto {
  @IsString()
  @Matches(YYYY_MM_DD_PATTERN)
  date!: string;
}

export enum TeacherLessonPreparationStatusDto {
  PLANNED = 'planned',
  IN_PROGRESS = 'in_progress',
  DONE = 'done',
  SKIPPED = 'skipped',
}

export class UpdateTeacherLessonPreparationStatusDto {
  @IsEnum(TeacherLessonPreparationStatusDto)
  status!: TeacherLessonPreparationStatusDto;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}
